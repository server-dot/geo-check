import { NextRequest, NextResponse } from 'next/server';
import {
  checkAiCrawlerAccess,
  parseContentSignals,
  type RobotsStatus,
} from '@/lib/geo-ai-crawlers';
import { analyzeContentVisibility, type ContentVisibility } from '@/lib/geo-content-visibility';
import { detectWaf, type WafHint } from '@/lib/geo-waf-fingerprint';
import { probeBotAccess, type ProbeResult } from '@/lib/geo-bot-probe';
import { checkBrandVisibility } from '@/lib/geo-brand-visibility';
import { analyzeLlmsTxt } from '@/lib/geo-llms-txt';
import { createAuditJob, updateAuditJob, type EngineResult } from '@/lib/geo-audit-jobs';
import { crawlSite } from '@/lib/geo-audit-crawler';
import { aggregateAuditChecks } from '@/lib/geo-audit-aggregate';

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
  return fetch(url, {
    headers: { 'User-Agent': UA, Accept: accept },
    signal: controller.signal,
    redirect: 'follow',
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
    const text = await res.text();
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
    return { html: await res.text(), note: '' };
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
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) return { exists: false, text: '' };
    return { exists: true, text };
  } catch {
    return { exists: null, text: '' }; // 抓不到就別亂講有或沒有
  }
}

// 「AI 引擎可達性」這層：robots.txt bot 存取、內容可視性、Content Signals、llms.txt。
// 秒級跑完，是原本 geo-check MVP 的四項檢測，維持同一套邏輯不變。
async function runEngineChecks(origin: string): Promise<EngineResult> {
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
  const toVerify = policyResults.filter((r) => r.status === 'allowed');
  const [probes, brandVisibility] = await Promise.all([
    toVerify.length > 0 ? probeBotAccess(origin, toVerify.map((r) => r.ua)) : Promise.resolve(new Map<string, ProbeResult>()),
    checkBrandVisibility(visibility?.title ?? '', origin),
  ]);

  const results = policyResults.map((r) => {
    const probe = probes.get(r.ua);
    if (!probe) return r;
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
  let input: string | undefined;
  try {
    const body = (await req.json()) as { url?: string };
    input = body.url?.trim();
  } catch {
    // body 不是合法 JSON。不接住的話 req.json() 會往外拋成 500
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  if (!input) return NextResponse.json({ error: '請輸入要檢測的網址' }, { status: 400 });

  let origin: string;
  let host: string;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('unsupported protocol');
    origin = u.origin;
    host = u.host;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  // 先跑一次快速的連線檢查：robots.txt 連線層都失敗代表整個網站連不上，
  // 沒有必要開一個註定失敗的背景 job 讓使用者空等。
  let engine: EngineResult;
  try {
    engine = await runEngineChecks(origin);
  } catch (err) {
    return NextResponse.json({ error: describeFetchError(err, host) }, { status: 502 });
  }

  const job = createAuditJob(origin);
  updateAuditJob(job.id, { status: 'crawling', message: '開始爬取網站…', engine });

  // ── 背景執行（不 await，讓請求先回 jobId）──
  void (async () => {
    try {
      const crawl = await crawlSite(origin, {
        onProgress: (p) =>
          updateAuditJob(job.id, {
            status: 'crawling',
            progress: p,
            message: `爬取中：已爬 ${p.crawled} 頁（發現 ${p.discovered} 頁，上限 ${p.cap}）`,
          }),
      });
      updateAuditJob(job.id, { status: 'analyzing', message: `已爬 ${crawl.pages.length} 頁，彙總分析中…` });
      const audit = await aggregateAuditChecks(crawl, (msg) => updateAuditJob(job.id, { status: 'analyzing', message: msg }));
      updateAuditJob(job.id, {
        status: 'completed',
        result: audit,
        message: `完成，爬取 ${crawl.pages.length} 頁、產出 ${audit.length} 項深度檢測`,
      });
    } catch (e) {
      updateAuditJob(job.id, { status: 'failed', error: e instanceof Error ? e.message : String(e), message: '深度健檢失敗' });
    }
  })();

  return NextResponse.json({ ok: true, jobId: job.id });
}
