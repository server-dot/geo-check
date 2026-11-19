import { parse } from 'node-html-parser';
import { paidFetch } from './paid-fetch';
import { hostnameOf, isSameSite } from './geo-brand-visibility';
import { askJson, parseJson } from './geo-recommend-visibility';

// ── SEO 健檢：關鍵字排名＋為什麼排不上去 ─────────────────────
// 11-18 小積木：「目前 SEO 還是很陽春」——站內 23 項規則只告訴你有沒有做對，不告訴你在 Google 贏不贏得了。
// 照 GEO 的流程做一遍：使用者自己填 ≤3 個關鍵字 → Bright Data 用台灣 IP 查 Google 第一頁 →
// 你排第幾、前 10 名是誰 → 拿你最接近的那頁跟前 3 名比標題、段落、字數 → 寫出這頁具體要補什麼。
// 建議要像 GEO「未被推薦原因」一樣具體（「補一段導入流程：第一週做什麼…」），不要「優化關鍵字密度」這種空話。

export interface SerpItem {
  resolved?: boolean; // 真正的網址拿到了沒（沒拿到的不拿來比內容）
  rank: number;
  url: string;
  domain: string;
  title: string;
  isSelf: boolean;
  isPlatform: boolean; // 論壇、社群、接案平台、影音——排名表照列，但不拿來跟你的頁比
}

// 11-18「n8n 自動化 接案」前 3 名是 Tasker 案件列表、Reddit、Facebook 貼文，拿你的服務頁去跟討論串比，建議變成「加 Q&A 互動」這種廢話
const PLATFORM = /(^|\.)(reddit\.com|facebook\.com|threads\.(net|com)|instagram\.com|youtube\.com|ptt\.cc|dcard\.tw|mobile01\.com|tasker\.com\.tw|104\.com\.tw|518\.com\.tw|1111\.com\.tw|pro360\.com\.tw|linkedin\.com|medium\.com|vocus\.cc|wikipedia\.org|shopee\.tw|momoshop\.com\.tw|pchome\.com\.tw|google\.com(\.tw)?)$|^(Facebook|Threads|Instagram|YouTube|Reddit|LinkedIn)$/i;
export interface PageOutline {
  url: string;
  title: string;
  description: string;
  h1: string;
  headings: string[]; // H2／H3
  words: number; // 內文字數（中文一字算一）
}
export interface KeywordTodo {
  what: string; // 具體要寫／改什麼
  basis: string; // 依據：前幾名誰有
}
export interface KeywordRank {
  keyword: string;
  selfRank: number | null; // 第一頁沒有你＝null
  top: SerpItem[];
  selfPage: PageOutline | null; // 你最接近這個關鍵字的頁（有排名就是那頁，沒有就用 site: 查）
  rivals: PageOutline[]; // 前 3 名（不含你）
  verdict: string; // 一句話：為什麼排不上去／為什麼排得上
  todos: KeywordTodo[];
  titleSuggestion: string;
  checkedAt: string;
}

const GAP_MODEL = 'openai/gpt-4.1';

// Google 第 3 名之後的連結是 google.com.tw/goto?url=…（加密的轉址），網域要看 display_link（「https://ohya.co › Blog」），
// 社群貼文的 display_link 不是網址（「6 則留言 · 1 年前」），就用 source（「Facebook · 外包網」）
type Organic = { url: string; title: string; domain: string; resolved: boolean };
const isGoto = (u: string) => /^https?:\/\/www\.google\.[a-z.]+\/goto\?/.test(u);

// 轉址連結跟著 302 拿到真正的網址（不抓內容）
async function resolveGoto(u: string): Promise<string> {
  if (!isGoto(u)) return u;
  try {
    const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    return res.headers.get('location') || u;
  } catch {
    return u;
  }
}

async function googleOrganic(q: string): Promise<Organic[] | null> {
  const key = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_SERP_ZONE || 'serp_api1';
  if (!key) return null;
  const url = `https://www.google.com.tw/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=tw&brd_json=1`;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Bright Data 失敗時會回 200＋「This query recently failed… try again after 15 seconds」，要等過才能重試
    if (attempt > 0) await new Promise((r) => setTimeout(r, 16_000));
    try {
      const res = await paidFetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ zone, url, country: 'tw', format: 'raw' }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim()) continue;
      let j: { organic?: { link?: string; title?: string; source?: string; display_link?: string }[] };
      try {
        j = JSON.parse(text);
      } catch {
        continue;
      }
      if (!Array.isArray(j.organic)) continue;
      const rows = j.organic.filter((o) => o.link && o.title);
      const urls = await Promise.all(rows.map((o) => resolveGoto(o.link!)));
      return rows.map((o, i) => {
        const raw = urls[i].replace(/[?&]srsltid=[^&]+/, '');
        const shown = (o.display_link ?? '').match(/^https?:\/\/[^\s›]+/)?.[0];
        const resolved = !isGoto(raw);
        const domain = resolved ? hostnameOf(raw) : shown ? hostnameOf(shown) : (o.source ?? '').split('·')[0].trim();
        // 轉址解不開（帶 gsessionid 的會回 16 秒的等待頁，不是 302）：連結改指到那個網站首頁，也不拿來比內容
        const url = resolved ? raw : shown ? `https://${hostnameOf(shown)}` : raw;
        return { url, title: o.title!, domain, resolved };
      });
    } catch {
      // 再試一次
    }
  }
  return null;
}

async function outline(input: string): Promise<PageOutline | null> {
  let url = input;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'zh-TW,zh;q=0.9' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    url = res.url || url;
    if (/(^|\.)google\.[a-z.]+$/.test(hostnameOf(url))) return null; // 跳到 Google 自己的等待頁＝沒拿到
    const root = parse(await res.text());
    root.querySelectorAll('script,style,noscript,nav,footer,header,svg').forEach((n) => n.remove());
    const t = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const body = t(root.querySelector('main')?.text || root.querySelector('body')?.text);
    const words = (body.match(/[一-鿿]/g)?.length ?? 0) + (body.match(/[A-Za-z0-9]+/g)?.length ?? 0);
    return {
      url,
      title: t(root.querySelector('title')?.text).slice(0, 120),
      description: t(root.querySelector('meta[name="description"]')?.getAttribute('content')).slice(0, 200),
      h1: t(root.querySelector('h1')?.text).slice(0, 100),
      headings: root
        .querySelectorAll('h2,h3')
        .map((h) => t(h.text).slice(0, 60))
        .filter(Boolean)
        .slice(0, 25),
      words,
    };
  } catch {
    return null;
  }
}

// 品牌名：首頁標題用「｜」「|」「-」切開，取不是服務清單（沒有「・、，」）的最短那段
// （「Q kangber AI 工作室｜n8n 自動化・AI 導入・系統開發」→ Q kangber AI 工作室；11-18 取最後一段取到服務清單）
export async function guessBrand(origin: string): Promise<string> {
  const home = await outline(origin);
  const parts = (home?.title ?? '').split(/[｜|]|\s[—–-]\s/).map((x) => x.trim()).filter(Boolean);
  const named = parts.filter((p) => !/[・、，,]/.test(p)).sort((a, b) => a.length - b.length);
  return named[0] || parts[0] || hostnameOf(origin);
}

export const MAX_KEYWORDS = 3;

// 候選關鍵字：11-18 小積木：「我的客戶是小白，哪有關鍵字的概念」——不能叫人自己填。
// 讀首頁和服務頁，列出「想買這個網站賣的東西的客人」會打進 Google 的字，每個附一句白話說明，給人勾。
export interface KeywordCandidate {
  keyword: string;
  who: string; // 誰會這樣搜，白話一句
}

export async function suggestKeywords(origin: string, apiKey: string): Promise<KeywordCandidate[]> {
  const home = await outline(origin);
  if (!home) return [];
  const prompt = `下面是一個台灣網站的首頁。請列 8 個「想買這個網站賣的東西或服務的客人」會打進 Google 的搜尋字。

標題：${home.title}
說明：${home.description}
H1：${home.h1}
段落標題：${home.headings.join('／')}

規則：
- 要是客人（買方）會搜的字，不是同業、求職者、想接案的人會搜的（例如接案工作室不要「n8n 接案」，那是找案子的人在搜）。
- 2～12 字，像真人打的（「n8n 自動化 外包」「台中 原木桌板」「私密處清潔 推薦」），不要整句話，不要品牌名。
- 平均分到這個網站的各項服務或商品，不要全擠在同一項。
- 有「推薦」「價格」「怎麼選」這類找廠商的字優先。
- who：誰會這樣搜，白話 20 字內，例如「想把訂單整理交給系統的電商老闆」。

只回傳 JSON：{"keywords":[{"keyword":"…","who":"…"}]}`;
  try {
    const p = parseJson<{ keywords?: { keyword?: string; who?: string }[] }>(await askJson(prompt, apiKey, 600));
    return (p?.keywords ?? [])
      .filter((k) => k?.keyword?.trim())
      .map((k) => ({ keyword: k.keyword!.trim().slice(0, 40), who: (k.who ?? '').trim().slice(0, 40) }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

const brief = (p: PageOutline) =>
  `標題：${p.title}\n說明：${p.description || '（沒有）'}\nH1：${p.h1 || '（沒有）'}\n段落標題：${p.headings.length ? p.headings.join('／') : '（沒有）'}\n內文約 ${p.words} 字`;

export async function checkKeyword(keyword: string, origin: string, brandName: string, apiKey: string): Promise<KeywordRank | null> {
  const self = hostnameOf(origin);
  const organic = await googleOrganic(keyword);
  if (!organic) return null;
  const top: SerpItem[] = organic.slice(0, 10).map((o, i) => ({
    rank: i + 1,
    url: o.url,
    domain: o.domain,
    title: o.title,
    isSelf: isSameSite(o.domain, self),
    isPlatform: PLATFORM.test(o.domain),
    resolved: o.resolved,
  }));
  const mine = top.find((t) => t.isSelf);
  // 你最接近的那頁：有排名就是那頁；沒有就在你網站裡搜這個關鍵字，取第一筆；再沒有就首頁
  let selfUrl = mine?.url;
  if (!selfUrl) {
    const site = await googleOrganic(`site:${self} ${keyword}`);
    selfUrl = site?.find((o) => o.resolved && isSameSite(o.domain, self))?.url ?? origin;
  }
  // 比較對象：排在前面的同業網站（不含你、不含平台）
  const rivalItems = top.filter((t) => !t.isSelf && !t.isPlatform && t.resolved !== false).slice(0, 3);
  const [selfPage, ...rivalPages] = await Promise.all([outline(selfUrl), ...rivalItems.map((r) => outline(r.url))]);
  // 抓不到內容的跳過；名次跟著頁面走（不然少一頁之後「第幾名」會對錯）
  const pairs = rivalPages.map((p, i) => ({ p, rank: rivalItems[i].rank })).filter((x): x is { p: PageOutline; rank: number } => !!x.p);
  const rivals = pairs.map((x) => x.p);

  let verdict = '';
  let todos: KeywordTodo[] = [];
  let titleSuggestion = '';
  if (selfPage && rivals.length > 0) {
    const prompt = `關鍵字「${keyword}」在台灣 Google 搜尋，${mine ? `「${brandName}」排第 ${mine.rank} 名` : `「${brandName}」不在第一頁`}。
下面是「${brandName}」最接近這個關鍵字的頁，跟排在前面的 ${rivals.length} 個同業網站（論壇、社群、接案平台已排除）。

【${brandName}】${selfPage.url}
${brief(selfPage)}

${pairs.map((x) => `【第 ${x.rank} 名】${x.p.url}\n${brief(x.p)}`).join('\n\n')}

請比較後寫：
- verdict：一句話講為什麼${mine ? '還沒排到更前面' : '排不上第一頁'}，40 字內，講具體差在哪（例如「前 3 名都是整理 10 家以上的比較文，你這頁只介紹自己的服務」）。
- todos：這頁具體要補或改什麼，最多 5 點。每點 what 寫要加哪一段、寫什麼內容（例如「加一段『n8n 跟 Make 差在哪』，用表格比價格、彈性、適合誰」），basis 寫依據（例如「第 1、2 名都有這段」）。不要寫「優化關鍵字密度」「提升內容品質」這種空話；要加的內容必須是這個網站本來就做得到的。
- titleSuggestion：這頁建議的新標題，28 字內，要有關鍵字，不要放品牌名（品牌名我們自己加）。

看的人是不懂網路行銷的老闆：不要用 SEO 術語（H1、H2、meta、標題標籤、關鍵字密度、反向連結、內部連結、權重、SERP），用一般人聽得懂的話（「段落標題」「網頁標題」「別的網站連到你」）。
用台灣人平常講話的方式寫。只回傳 JSON：{"verdict":"…","todos":[{"what":"…","basis":"…"}],"titleSuggestion":"…"}`;
    try {
      const p = parseJson<{ verdict?: string; todos?: { what?: string; basis?: string }[]; titleSuggestion?: string }>(await askJson(prompt, apiKey, 900, GAP_MODEL));
      verdict = (p?.verdict ?? '').trim();
      todos = (p?.todos ?? []).filter((t) => t?.what?.trim()).slice(0, 5).map((t) => ({ what: t.what!.trim(), basis: (t.basis ?? '').trim() }));
      titleSuggestion = (p?.titleSuggestion ?? '').trim();
    } catch {
      // 比對失敗只少建議，排名照樣給
    }
  }
  return { keyword, selfRank: mine?.rank ?? null, top, selfPage, rivals, verdict, todos, titleSuggestion, checkedAt: new Date().toISOString() };
}
