import { hostnameOf, isSameSite, type VisibilityAnswer } from './geo-brand-visibility';

// ── Google AI 摘要（AI Overview）────────────────────────────
// Google 沒有官方 API，透過 SerpApi 查台灣 Google（google.com.tw、繁中）。
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
    const res = await fetch(u, { signal: AbortSignal.timeout(45_000) });
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

export type GoogleAioResult = { status: 'present'; answer: VisibilityAnswer } | { status: 'absent' } | null;

// null＝查不了（沒 key、額度用完、逾時）；absent＝Google 這題真的沒給 AI 摘要
export async function fetchGoogleAio(question: string, origin: string): Promise<GoogleAioResult> {
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
