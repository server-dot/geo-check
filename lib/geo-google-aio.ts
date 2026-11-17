import { hostnameOf, isSameSite, type VisibilityAnswer } from './geo-brand-visibility';
import { paidFetch } from './paid-fetch';

// ── Google AI 摘要（AI Overview）────────────────────────────
// Google 沒有官方 API，代查台灣 Google（google.com.tw、繁中）。
//
// 11-17 起優先用 Bright Data（台灣住家 IP）：SerpApi 從海外機房查，同一句「推薦好用的私密處清潔與保養品」
// 查 3 次都沒有 Relove，小積木自己在台灣搜卻是第一名；Bright Data 查 3 次有 2 次 Relove 第一，跟實測一致。
// 沒設 BRIGHTDATA_API_KEY 或兩次都失敗才退回 SerpApi。
//
// 坑（2026-11-02 實測）：AI 摘要有兩種——Google 已經快取的會直接出現在搜尋結果裡；
// 冷門的中文問題是打開頁面後才「思考中」即時生成，第一次回應只會給一個 page_token，
// 要馬上（約 1～4 分鐘內失效）用 google_ai_overview 引擎再抓一次才拿得到內容。
// Apify 上的現成爬蟲都不會做第二步，所以會把「有 AI 摘要」誤報成「沒有」。
//
// 額度：免費方案每月 250 次，一題最多用 2 次。額度用完或沒設 key 時回 null，
// 報告就少 Google 這一欄，不影響其他結果，也不會產生費用。

const ENGINE_LABEL = 'Google AI 摘要';

interface Block {
  type?: string;
  snippet?: string;
  title?: string;
  list?: Block[];
  snippet_links?: { text?: string; link?: string }[];
}

// SerpApi 解析時偶爾會把連結文字弄丟：Google 寫的是「Relove：台灣知名…」，Relove 是連結，
// 回來的 snippet 只剩「：台灣知名…」，snippet_links 也只有網址沒有 text（2026-11-02 實測）。
// 名字不見的話「AI 有沒有推薦你」會判成沒有，所以用連結的網域把名字補回去。
function withLostLink(b: Block): string {
  const snip = b.snippet ?? '';
  const lost = b.snippet_links?.find((l) => !l.text && l.link);
  if (lost && /^\s*[：:]/.test(snip)) {
    let host = lost.link!;
    try {
      host = new URL(lost.link!).hostname.replace(/^www\./, '');
    } catch {}
    return `${host}${snip}`;
  }
  return snip;
}

interface SerpAio {
  page_token?: string;
  text_blocks?: Block[];
  references?: { title?: string; link?: string }[];
}

async function serp(params: Record<string, string>, key: string): Promise<Record<string, unknown> | null> {
  const u = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries({ ...params, api_key: key })) u.searchParams.set(k, v);
  try {
    const res = await paidFetch(u.toString(), { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null; // 額度用完是 429，一律當成這次查不到
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 把結構化的 text_blocks 攤回 Markdown，前端跟抽名字那一步都吃純文字
function blocksToText(blocks: Block[], depth = 0): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' && b.snippet) lines.push(`**${b.snippet}**`);
    else if (b.type === 'list' && b.list) {
      for (const item of b.list) {
        const head = item.title ? `${item.title}：` : '';
        lines.push(`${'  '.repeat(depth)}- ${head}${withLostLink(item)}`.trimEnd());
        if (item.list) lines.push(blocksToText([{ type: 'list', list: item.list }], depth + 1));
      }
    } else if (b.snippet) lines.push(withLostLink(b));
  }
  return lines.filter(Boolean).join('\n\n');
}

// ── Bright Data ──
interface BdBlock {
  type?: string;
  title?: string;
  snippet?: string;
  list?: BdBlock[];
  links?: { text?: string; link?: string }[];
}
export interface BdAio {
  texts?: BdBlock[];
  references?: { href?: string; title?: string }[];
}

// 每段結尾會黏著來源標籤（「…不緊繃。 www.foreverrelove.com.tw +1」「…使用。 屈臣氏網路商店 +2」），拿掉
function stripSourceTag(s: string): string {
  return s.replace(/(?<=[。！？）)」：:])\s+(?:[^\s。！？]+\.[a-z]{2,}(?:\s\+\d+)?|[^。！？：]{1,24}?\s\+\d+)$/i, '').trim();
}

function bdToText(blocks: BdBlock[], depth = 0): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === 'list' && b.list) {
      if (b.title) lines.push(`**${b.title}**`);
      for (const item of b.list) {
        if (item.type === 'list' && item.list) {
          lines.push(bdToText([item], depth + 1));
          continue;
        }
        const snip = stripSourceTag(item.snippet ?? '');
        const head = item.title && !snip.startsWith(item.title) ? `${item.title}：` : '';
        if (snip || head) lines.push(`${'  '.repeat(depth)}- ${head}${snip}`.trimEnd());
      }
    } else if (b.type === 'heading' && b.snippet) lines.push(`**${b.snippet}**`);
    else if (b.snippet) lines.push(stripSourceTag(b.snippet));
  }
  return lines.filter(Boolean).join('\n\n');
}

function bdLinks(blocks: BdBlock[], out: { url: string; title: string }[] = []): { url: string; title: string }[] {
  for (const b of blocks) {
    for (const l of b.links ?? []) if (l.link) out.push({ url: l.link, title: l.text ?? '' });
    if (b.list) bdLinks(b.list, out);
  }
  return out;
}

// 回傳：undefined＝這次失敗（要重試或退回 SerpApi）；null＝Google 這題沒給 AI 摘要；其他＝摘要
async function brightData(question: string, key: string, zone: string): Promise<BdAio | null | undefined> {
  const url = `https://www.google.com.tw/search?q=${encodeURIComponent(question)}&hl=zh-TW&gl=tw&brd_ai_overview=2&brd_json=1`;
  try {
    const res = await paidFetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ zone, url, country: 'tw', format: 'raw' }),
      signal: AbortSignal.timeout(90_000), // 實測一次約 40 秒（要開瀏覽器等 AI 摘要生成）
    });
    if (!res.ok) return undefined;
    const text = await res.text();
    if (!text.trim()) return undefined; // 偶爾回 200 但內容空白（11-17 實測 4 次有 1 次）
    const j = JSON.parse(text) as { ai_overview?: BdAio; organic?: unknown };
    if (j.ai_overview?.texts?.length) return j.ai_overview;
    return j.organic ? null : undefined; // 有搜尋結果但沒摘要＝真的沒有；連搜尋結果都沒有＝這次壞掉
  } catch {
    return undefined;
  }
}

export function bdToAnswer(aio: BdAio, question: string, origin: string): VisibilityAnswer | null {
  const answer = bdToText(aio.texts ?? []);
  if (!answer) return null;
  const domain = hostnameOf(origin);
  const seen = new Set<string>();
  const citations = [
    ...(aio.references ?? []).filter((r) => r.href).map((r) => ({ url: r.href!, title: r.title ?? '' })),
    ...bdLinks(aio.texts ?? []),
  ]
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .map((c) => ({ ...c, isSelf: isSameSite(hostnameOf(c.url), domain) }));
  return { engine: ENGINE_LABEL, query: question, answer, citedSelf: citations.some((c) => c.isSelf), citations };
}

async function fetchViaBrightData(question: string, origin: string): Promise<GoogleAioResult | undefined> {
  const key = process.env.BRIGHTDATA_API_KEY;
  if (!key) return undefined;
  const zone = process.env.BRIGHTDATA_SERP_ZONE || 'serp_api1';
  for (let i = 0; i < 2; i++) {
    const aio = await brightData(question, key, zone);
    if (aio === undefined) continue;
    if (aio === null) return { status: 'absent' };
    const answer = bdToAnswer(aio, question, origin);
    if (answer) return { status: 'present', answer };
  }
  return undefined;
}

export type GoogleAioResult = { status: 'present'; answer: VisibilityAnswer } | { status: 'absent' } | null;

// null＝查不了（沒 key、額度用完、逾時）；absent＝Google 這題真的沒給 AI 摘要
export async function fetchGoogleAio(question: string, origin: string): Promise<GoogleAioResult> {
  const bd = await fetchViaBrightData(question, origin);
  if (bd !== undefined) return bd;
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  const first = await serp(
    { engine: 'google', q: question, gl: 'tw', hl: 'zh-tw', google_domain: 'google.com.tw', no_cache: 'true' },
    key,
  );
  if (!first) return null;
  let aio = first.ai_overview as SerpAio | undefined;
  if (!aio) return { status: 'absent' };
  if (aio.page_token && !aio.text_blocks) {
    const second = await serp({ engine: 'google_ai_overview', page_token: aio.page_token }, key);
    aio = second?.ai_overview as SerpAio | undefined;
    if (!aio) return null; // 有 AI 摘要但補抓失敗：不能說成「沒有」
  }
  const answer = aioToAnswer(aio, question, origin);
  return answer ? { status: 'present', answer } : null;
}

// 拆出來：開發時可以拿存好的 SerpApi 回應直接轉，不用再花一次額度
export function aioToAnswer(aio: SerpAio, question: string, origin: string): VisibilityAnswer | null {
  const answer = blocksToText(aio.text_blocks ?? []);
  if (!answer) return null;
  const domain = hostnameOf(origin);
  const citations = (aio.references ?? [])
    .filter((r) => r.link)
    .map((r) => ({ url: r.link!, title: r.title ?? '', isSelf: isSameSite(hostnameOf(r.link!), domain) }));
  return { engine: ENGINE_LABEL, query: question, answer, citedSelf: citations.some((c) => c.isSelf), citations };
}
