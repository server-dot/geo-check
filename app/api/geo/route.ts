import { NextRequest, NextResponse } from 'next/server';
import { assertPublicUrl, guardedFetch, UnsafeUrlError } from '@/lib/geo-url-guard';
import { LIMITS, clientIp, hoursLeft, releaseAuditSlot, takeDaily, tryAcquireAuditSlot } from '@/lib/rate-limit';
import { getSessionUser, isAdmin } from '@/lib/auth';
import { reserveAudit, releaseAudit, type AuditKind } from '@/lib/quota';
import {
  checkAiCrawlerAccess,
  isPolicyOnly,
  parseContentSignals,
  type RobotsStatus,
} from '@/lib/geo-ai-crawlers';
import { analyzeContentVisibility, type ContentVisibility } from '@/lib/geo-content-visibility';
import { detectWaf, type WafHint } from '@/lib/geo-waf-fingerprint';
import { probeBotAccess, type ProbeResult } from '@/lib/geo-bot-probe';
import { checkBrandVisibility, guessBrandName } from '@/lib/geo-brand-visibility';
import { buildRecommendCandidates } from '@/lib/geo-real-questions';
import { resolveBrandName, type RecommendInput } from '@/lib/geo-recommend-visibility';
import { markWrongEntity } from '@/lib/geo-answer-subject';
import { extractProfile } from '@/lib/geo-brand-profile';
import { extractSentiment, fetchReviewAnswers, selfShortName, sentimentInputs } from '@/lib/geo-sentiment';
import { detectOwnedSources, markOwned } from '@/lib/geo-owned-sources';
import { creditFailedSince } from '@/lib/openrouter-health';
import { analyzeLlmsTxt } from '@/lib/geo-llms-txt';
import { createAuditJob, updateAuditJob, setAuditJobContext, type AuditJob, type EngineResult } from '@/lib/geo-audit-jobs';
import { readTextCapped, crawlSite } from '@/lib/geo-audit-crawler';
import { aggregateAuditChecks } from '@/lib/geo-audit-aggregate';
import { buildSchemaTypeCards } from '@/lib/geo-schema-check';
import { enrichSchemaCards } from '@/lib/geo-schema-complete';

// GEO 深度健檢：先跑「AI 引擎可達性」這層（robots.txt、內容可視性、Content Signals、
// llms.txt——秒級，這是我們的差異化核心），再跑多頁爬蟲＋規則＋AI 語意判斷（Schema、E-E-A-T）
// 這層要幾十秒到兩分鐘。後面這層太慢不能同步回應，所以整支改成背景 job：
// POST 立刻回 jobId，實際工作在背景跑，前端輪詢 /api/geo/status 拿進度與結果。
export const maxDuration = 30;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TIMEOUT_MS = 10000;

function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return guardedFetch(url, {
    headers: { 'User-Agent': UA, Accept: accept },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

// 連線層失敗（DNS、憑證、逾時）時給出說得出原因的訊息。
// 一律回「連不到這個網站」等於把憑證問題和打錯字混在一起，使用者無從修。
function describeFetchError(err: unknown, host: string): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  const code = cause?.code ?? '';
  const message = cause?.message ?? '';

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `找不到 ${host} 這個網域，請確認網址是否拼錯`;
  }
  if (/certificate|altnames|ERR_TLS/i.test(code + message)) {
    return `${host} 的 HTTPS 憑證與網域不符，無法安全連線（可以試試改成 www.${host}）`;
  }
  if ((err as Error)?.name === 'AbortError' || /TIMEOUT/i.test(code)) {
    return `連線 ${host} 逾時（超過 ${TIMEOUT_MS / 1000} 秒），網站可能太慢或擋住了我們`;
  }
  return `連不到 ${host}，請確認網址是否正確`;
}

interface RobotsOutcome {
  status: RobotsStatus;
  text: string;
  url: string;
  note: string;
  wafHint: WafHint | null;
}

async function fetchRobots(origin: string): Promise<RobotsOutcome> {
  const requested = `${origin}/robots.txt`;
  const res = await fetchWithTimeout(requested, 'text/plain,*/*');
  // 跟隨轉址後才是規則的真正來源（輸入 nytimes.com 實際讀到的是 www.nytimes.com）
  const url = res.url || requested;

  if (res.ok) {
    const text = await readTextCapped(res);
    const contentType = res.headers.get('content-type') ?? '';
    // 有些站對不存在的路徑回 200 + HTML 錯誤頁（soft 404）。
    // 把 HTML 當 robots.txt 解析只會產生垃圾結論，一律視為讀不到。
    if (/text\/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text)) {
      return {
        status: 'unreachable',
        text: '',
        url,
        note: `伺服器回傳 HTML 而不是純文字（HTTP ${res.status}），這不是有效的 robots.txt`,
        wafHint: detectWaf(res.headers),
      };
    }
    return { status: 'found', text, url, note: '', wafHint: null };
  }

  if (res.status === 404 || res.status === 410) {
    // 真的沒有 robots.txt。依規範代表不設限，這時候的綠燈是正確的
    return { status: 'none', text: '', url, note: `HTTP ${res.status}，網站確實沒有放 robots.txt`, wafHint: null };
  }

  // 403 / 429 / 5xx：讀不到不等於沒設限。台灣不少網站（104、天下）用 WAF 擋掉
  // server-side fetch，若當成「沒有 robots.txt」就會給出「AI 全部可存取」的假綠燈，
  // 而實際上它們是 Disallow: / 擋掉所有 AI bot，結論完全相反。
  // 這裡順手從 response headers 辨識是哪家 WAF/CDN，把「無法判定」變成具體可操作的建議。
  return {
    status: 'unreachable',
    text: '',
    url,
    note:
      res.status === 403 || res.status === 429
        ? `HTTP ${res.status}，網站的防爬／WAF 機制擋下了我們的檢測`
        : `HTTP ${res.status}，伺服器沒有正常回應`,
    wafHint: detectWaf(res.headers),
  };
}

// 抓首頁原始 HTML。失敗不算致命——robots.txt 的結論還是有效的，
// 只是少了「AI 讀到什麼」這一段，所以回 null 讓呼叫端略過。
async function fetchHomepage(origin: string): Promise<{ html: string | null; note: string }> {
  try {
    const res = await fetchWithTimeout(origin, 'text/html,application/xhtml+xml,*/*');
    if (!res.ok) return { html: null, note: `首頁回傳 HTTP ${res.status}，無法分析內容` };
    return { html: await readTextCapped(res), note: '' };
  } catch {
    return { html: null, note: '抓不到首頁，無法分析 AI 讀得到的內容' };
  }
}

// llms.txt（llmstxt.org）：放在根目錄、給 AI 看的網站導覽。
// exists 為 null 代表「不確定」——跟 robots.txt 同一個原則：被 WAF 擋下時不能說人家沒有。
// 只有明確的 404/410 才算真的沒部署。連內容一起帶回去，才能判斷「寫得好不好」，
// 不是只看「有沒有這個檔案」——空殼 llms.txt 跟沒有部署對 AI 來說沒兩樣。
async function checkLlmsTxt(origin: string): Promise<{ exists: boolean | null; text: string }> {
  try {
    const res = await fetchWithTimeout(`${origin}/llms.txt`, 'text/plain,text/markdown,*/*');
    if (res.status === 404 || res.status === 410) return { exists: false, text: '' };
    if (!res.ok) return { exists: null, text: '' }; // 403 / 5xx：讀不到，不代表沒有
    const contentType = res.headers.get('content-type') ?? '';
    if (/text\/html/i.test(contentType)) return { exists: false, text: '' }; // soft-404：回首頁 HTML 當作沒有
    const text = await readTextCapped(res);
    if (/^\s*<(!doctype|html)/i.test(text)) return { exists: false, text: '' };
    return { exists: true, text };
  } catch {
    return { exists: null, text: '' }; // 抓不到就別亂講有或沒有
  }
}

// 「AI 引擎可達性」這層：robots.txt bot 存取、內容可視性、Content Signals、llms.txt。
// 秒級跑完，是原本 geo-check MVP 的四項檢測，維持同一套邏輯不變。
// withBrand：GEO 才要拿品牌名去問 AI「你認得這個品牌嗎」（會燒 API）；SEO 不問
async function runEngineChecks(origin: string, withBrand: boolean): Promise<EngineResult> {
  const [robots, homepage, llmsTxtFetch] = await Promise.all([
    fetchRobots(origin),
    fetchHomepage(origin),
    checkLlmsTxt(origin),
  ]);
  const llmsTxt = {
    exists: llmsTxtFetch.exists,
    quality: llmsTxtFetch.exists ? analyzeLlmsTxt(llmsTxtFetch.text) : null,
  };

  const policyResults = checkAiCrawlerAccess(robots.text, robots.status);
  const visibility: ContentVisibility | null = homepage.html
    ? analyzeContentVisibility(homepage.html)
    : null;

  // 兩個都要打外部網路、彼此不相依，並行跑省時間：
  // 1. 政策層判定「允許」的 bot，真的用它的 User-Agent 打一次網站，把推論變成實測
  //    （政策已經擋掉的不用測——守規矩的爬蟲本來就不會硬闖）
  // 2. 拿偵測到的品牌名稱去問 Perplexity「你知道這是誰嗎」，看回答有沒有引用自己的網站——
  //    比「AI 讀不讀得到」更進一步：「AI 真的知不知道你」
  const toVerify = policyResults.filter((r) => r.status === 'allowed' && !isPolicyOnly(r.ua));
  const [probes, brandVisibility] = await Promise.all([
    toVerify.length > 0 ? probeBotAccess(origin, toVerify.map((r) => r.ua)) : Promise.resolve(new Map<string, ProbeResult>()),
    withBrand ? checkBrandVisibility(guessBrandName(visibility?.title ?? '', visibility?.orgName), origin) : Promise.resolve([]),
  ]);

  const results = policyResults.map((r) => {
    const probe = probes.get(r.ua);
    if (!probe) return isPolicyOnly(r.ua) && r.status === 'allowed' ? { ...r, matchedRule: `${r.matchedRule}（只看 robots.txt，這個控制項沒有自己的爬蟲可以實測）` } : r;
    if (probe.reachable === false) {
      return { ...r, status: 'mismatch' as const, matchedRule: `${r.matchedRule}；${probe.note}——robots.txt 允許，但 WAF 實際擋下` };
    }
    if (probe.reachable === true) {
      return { ...r, matchedRule: `${r.matchedRule}（已實測驗證可達）` };
    }
    return { ...r, matchedRule: `${r.matchedRule}（${probe.note}）` };
  });

  const contentSignals = robots.status === 'unreachable' ? null : parseContentSignals(robots.text);

  return {
    origin,
    robotsUrl: robots.url,
    robotsStatus: robots.status,
    robotsNote: robots.note,
    wafHint: robots.wafHint,
    results,
    visibility,
    visibilityNote: homepage.note,
    contentSignals,
    llmsTxt,
    brandVisibility,
  };
}

export async function POST(req: NextRequest) {
  // 先登入才能跑：每個 Google 帳號 GEO、SEO 每天各免費一次（見 lib/quota.ts）
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入', needLogin: true }, { status: 401 });

  let input: string | undefined;
  let kind: AuditKind;
  try {
    const body = (await req.json()) as { url?: string; kind?: string };
    input = body.url?.trim();
    kind = body.kind === 'seo' ? 'seo' : 'geo';
  } catch {
    // body 不是合法 JSON。不接住的話 req.json() 會往外拋成 500
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  if (!input) return NextResponse.json({ error: '請輸入要檢測的網址' }, { status: 400 });

  let origin: string;
  let host: string;
  try {
    const u = await assertPublicUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    origin = u.origin;
    host = u.host;
  } catch (err) {
    return NextResponse.json({ error: err instanceof UnsafeUrlError ? err.message : '網址格式不正確' }, { status: 400 });
  }

  // 同時數先看——被同時數擋下來的那次不該吃掉他的免費次數
  if (!tryAcquireAuditSlot()) {
    return NextResponse.json({ error: '現在同時有太多網站在檢測，請等一兩分鐘再試。' }, { status: 503 });
  }
  // 每 IP 每日上限留著當第二道閘：一個人開很多 Google 帳號時還擋得住。管理員不受限。
  if (!isAdmin(user.email)) {
    const limited = takeDaily('audit', clientIp(req), LIMITS.auditPerDay);
    if (limited) {
      releaseAuditSlot();
      return NextResponse.json(
        { error: `這個網路位置今天已經跑過 ${LIMITS.auditPerDay} 次健檢，${hoursLeft(limited.retryAfterMs)}後可以再跑。要一次看很多網站的話，直接聯絡我們。` },
        { status: 429 },
      );
    }
  }
  let reserved: boolean;
  try {
    reserved = await reserveAudit(user.email, kind, origin);
  } catch {
    releaseAuditSlot();
    return NextResponse.json({ error: '系統暫時無法確認你的免費次數，請稍後再試。' }, { status: 503 });
  }
  if (!reserved) {
    releaseAuditSlot();
    return NextResponse.json(
      { error: `今日 ${KIND_LABEL[kind]}已檢測完畢，明天可以再測。`, quotaUsed: true },
      { status: 403 },
    );
  }

  // 先跑一次快速的連線檢查：robots.txt 連線層都失敗代表整個網站連不上，
  // 沒有必要開一個註定失敗的背景 job 讓使用者空等。連不上不算用掉次數。
  let engine: EngineResult;
  // 額度不足偵測從這裡算起。品牌題 11-11 起移到背景（runGeo）：ChatGPT 換成原生搜尋＋推理後一題要 25～50 秒，
  // 放在這裡會讓「開始檢測」卡住，使用者看不到進度
  const startedAt = Date.now();
  try {
    try {
      engine = await runEngineChecks(origin, false);
    } catch (err) {
      // 不少台灣站的憑證只簽了 www（例：foreverrelove.com.tw），使用者打裸網域就連不上。
      // 2026-11-10 原本只回「試試改成 www」，但錯誤訊息常沒被看到、使用者以為按鈕壞了；直接幫他改成 www 再試一次。
      if (!/certificate|altnames|ERR_TLS/i.test(String((err as { cause?: { code?: string; message?: string } })?.cause?.code ?? '') + String((err as { cause?: { message?: string } })?.cause?.message ?? '')) || host.startsWith('www.')) throw err;
      const www = new URL(origin);
      www.hostname = `www.${www.hostname}`;
      engine = await runEngineChecks(www.origin, false);
      origin = www.origin;
      host = www.host;
    }
  } catch (err) {
    releaseAuditSlot();
    await releaseAudit(user.email, kind).catch(() => {});
    return NextResponse.json({ error: describeFetchError(err, host) }, { status: 502 });
  }

  const job = createAuditJob(origin, kind, user.email);
  updateAuditJob(job.id, { status: 'crawling', message: '開始爬取網站…', engine });

  // ── 背景執行（不 await，讓請求先回 jobId）──
  void (async () => {
    try {
      if (kind === 'seo') await runSeo(job.id, origin, startedAt);
      else await runGeo(job.id, origin, engine, startedAt);
    } catch (e) {
      await releaseAudit(user.email, kind).catch(() => {});
      updateAuditJob(job.id, { status: 'failed', error: e instanceof Error ? e.message : String(e), message: '健檢失敗' });
    } finally {
      releaseAuditSlot();
    }
  })();

  return NextResponse.json({ ok: true, jobId: job.id, kind });
}

const KIND_LABEL: Record<AuditKind, string> = { geo: 'GEO 健檢', seo: 'SEO 健檢' };

function crawlWithProgress(jobId: string, origin: string) {
  return crawlSite(origin, {
    onProgress: (p) =>
      updateAuditJob(jobId, {
        status: 'crawling',
        progress: p,
        message: `爬取中：已爬 ${p.crawled} 頁（發現 ${p.discovered} 頁，上限 ${p.cap}）`,
      }),
  });
}

// SEO 健檢：多頁爬蟲＋23 項規則（標題描述、大小標題、canonical、sitemap…）＋結構化資料。不問 AI 推薦題。
async function runSeo(jobId: string, origin: string, startedAt: number) {
  const crawl = await crawlWithProgress(jobId, origin);
  updateAuditJob(jobId, { status: 'analyzing', message: `已爬 ${crawl.pages.length} 頁，彙總分析中…` });
  const audit = await aggregateAuditChecks(crawl, (msg) => updateAuditJob(jobId, { status: 'analyzing', message: msg }));
  updateAuditJob(jobId, { status: 'analyzing', message: '整理結構化資料缺漏建議中…' });
  const rawSchemaCards = buildSchemaTypeCards(crawl.pages.map((p) => ({ url: p.url, jsonLdNodes: p.jsonLdNodes })));
  const schemaCards = await enrichSchemaCards(
    rawSchemaCards,
    crawl.pages.map((p) => ({ url: p.url, mainText: p.mainText })),
  );
  updateAuditJob(jobId, {
    status: 'completed',
    result: audit,
    schemaCards,
    recommendVisibility: null,
    aiCreditShort: creditFailedSince(startedAt),
    pageWords: crawl.pages.filter((p) => p.ok && !p.nonHtml).map((p) => p.mainTextLength),
    message: `完成，爬取 ${crawl.pages.length} 頁、產出 ${audit.length} 項檢測`,
  });
}

// GEO 健檢：準備推薦候選題、品牌評價、品牌輪廓。2026-11-11 起推薦題不在這裡問：
// 健檢只列出候選題（網友在論壇問過的＋AI 產生的），使用者在報告上勾完才問（/api/geo/recommend），
// 推薦排名、競爭對手、未被推薦原因都在那之後才算。爬蟲還是要跑——第 2 關要比對你的頁面。
// 服務／產品頁：網址或標題有「服務、產品、商品、方案、價目」的頁（中文網址要先 decode 才比對得到），
// 最多兩頁、每頁 1000 字。給出題用，題目才會分散到各項服務，不會只問首頁最常出現的那一項
function serviceText(pages: { url: string; title: string; ok: boolean; nonHtml?: boolean; isHome: boolean; mainText: string }[]): string {
  const re = /服務|產品|商品|方案|價目|收費|service|product|solution|pricing|shop/i;
  const hits = pages.filter((p) => {
    if (!p.ok || p.nonHtml || p.isHome || !p.mainText) return false;
    let path = p.url;
    try {
      path = decodeURIComponent(new URL(p.url).pathname);
    } catch {}
    // 只看網址第一層（/services、/產品），文章頁標題常帶「服務」二字但不是服務頁
    const first = path.split('/').filter(Boolean)[0] ?? '';
    return re.test(first) || (path.split('/').filter(Boolean).length <= 1 && re.test(p.title));
  });
  return hits.slice(0, 2).map((p) => `${p.title}\n${p.mainText.slice(0, 1000)}`).join('\n\n');
}

async function runGeo(jobId: string, origin: string, engine: EngineResult, startedAt: number) {
  const vis = engine.visibility;
  const apiKey = process.env.OPENROUTER_API_KEY;
  // 標題／機構名是「主頁」這種通用字時，請 AI 從首頁判斷真正的品牌名（康寶 knorr.com/tw）
  const brandName = vis ? await resolveBrandName(vis, origin, apiKey) : '';
  const recommendInput: RecommendInput | null = vis
    ? {
        brandName,
        title: vis.title,
        description: vis.description,
        h1: vis.h1,
        leadParagraphs: vis.leadParagraphs,
        preview: vis.preview,
      }
    : null;
  const ready = !!(recommendInput?.brandName && apiKey);
  // 評價題、品牌題跟爬蟲互不相依，先開跑；自己吞錯，不能讓它把整個健檢弄成 failed。
  // 候選題要等爬蟲：要讀服務／產品頁（11-11 aiqkangber.com 首頁只講 n8n，題目全擠在 n8n）
  const reviewPromise = ready ? fetchReviewAnswers(recommendInput!.brandName, origin).catch(() => null) : Promise.resolve(null);
  const brandPromise = brandName ? checkBrandVisibility(brandName, origin).catch(() => []) : Promise.resolve([]);
  const crawl = await crawlWithProgress(jobId, origin);
  updateAuditJob(jobId, { status: 'analyzing', message: '整理網友問過的問題、AI 對你的評價…' });
  engine = { ...engine, brandVisibility: await brandPromise };
  const matchPages = crawl.pages
    .filter((p) => p.ok && !p.nonHtml)
    .map((p) => ({ url: p.url, title: p.title, text: p.mainText }));
  const siteExternalLinks = [...crawl.pages].sort((a, b) => Number(b.isHome) - Number(a.isHome)).flatMap((p) => p.externalLinks ?? []);
  if (recommendInput) {
    const services = serviceText(crawl.pages);
    if (services) recommendInput.services = services;
    setAuditJobContext(jobId, { origin, recommendInput, pages: matchPages, siteExternalLinks });
  }
  const candidatesPromise = ready ? buildRecommendCandidates(recommendInput!, apiKey!).catch(() => null) : Promise.resolve(null);

  let brandInsights: AuditJob['brandInsights'] = null;
  if (ready) {
    const review = await reviewPromise;
    const selfName = selfShortName(recommendInput!.brandName);
    // 哪些來源是品牌自己的（官網、姊妹購物站、官網連出去的帳號、作者是品牌的文章）：
    // 品牌題的「引用你」用這份判斷；評價抽取也用它排除轉述自己文章的負評
    const owned = await detectOwnedSources({
      brandNames: [recommendInput!.brandName, selfName],
      domain: origin,
      siteExternalLinks,
      citations: [...engine.brandVisibility.flatMap((b) => b.citations), ...(review?.answers ?? []).flatMap((a) => a.citations ?? [])],
    }).catch(() => new Set<string>());
    // 回答講的是不是你：認成同名的別人，就不算引用官網、也不拿來整理評價和品牌輪廓
    const about = [recommendInput!.title, recommendInput!.description, recommendInput!.services?.slice(0, 400)].filter(Boolean).join('\n').slice(0, 700);
    const [brandChecked, reviewAnswers] = await Promise.all([
      markWrongEntity(selfName, origin, about, engine.brandVisibility.map((b) => markOwned(b, owned)), apiKey!),
      markWrongEntity(selfName, origin, about, review?.answers ?? [], apiKey!),
    ]);
    const rightReviews = reviewAnswers.filter((a) => !a.wrongEntity);
    engine = { ...engine, brandVisibility: brandChecked };
    const [s, profile] = await Promise.all([
      extractSentiment(recommendInput!.brandName, [...sentimentInputs({ questions: [] }, engine.brandVisibility), ...rightReviews], apiKey!, owned).catch(() => null),
      extractProfile(selfName, engine.brandVisibility.filter((b) => !b.wrongEntity), apiKey!, matchPages).catch(() => null),
    ]);
    // 評價題的回答全文也要存：報告上的負評引文要追得到出處（11-04 小積木：「是哪裡說到的我沒看到」）
    // 全部回答都認成別人時沒有評價可整理，但「認成誰」還是要留在報告上
    const base = s ?? (reviewAnswers.some((a) => a.wrongEntity) ? { themes: [], answerCount: 0 } : null);
    const sentiment = base && review
      ? { ...base, reviewQuery: review.query, reviewAnswers: reviewAnswers.map(({ engine, query, answer, citedSelf, citations, wrongEntity }) => ({ engine, query, answer, citedSelf, citations, wrongEntity })) }
      : base;
    brandInsights = { sentiment, profile };
  }
  const recommendCandidates = await candidatesPromise;
  updateAuditJob(jobId, {
    status: 'completed',
    engine,
    recommendVisibility: null,
    recommendCandidates,
    brandInsights,
    aiCreditShort: creditFailedSince(startedAt),
    pageWords: crawl.pages.filter((p) => p.ok && !p.nonHtml).map((p) => p.mainTextLength),
    message: `完成，爬取 ${crawl.pages.length} 頁`,
  });
}
