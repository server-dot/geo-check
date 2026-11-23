import { SITE_URL } from './site';
import { paidFetch } from './paid-fetch';
import { brandKeys, handleIsBrand, sameUrl } from './geo-owned-sources';
import { hostnameOf, isSameSite } from './geo-brand-visibility';
import { askJson, parseJson, type RecommendInput, type RecommendVisibility } from './geo-recommend-visibility';

// ── 競爭對手分析：市場定位圖 ───────────────────────────────
// 11-18 小積木：縱軸用「被推幾次」→「好醜而且完全用不到」；從推薦題回答裡挖定位 →
// 回答本來就不是在講定位，資料太少，軸挑得怪（保養品出現「大公司↔小品牌」）、點擠成一團。
// 小積木：「這類型的圖可以額外問 AI」。改成兩步：
//   1. gpt-4.1 依產業列 4 個客人真的會比的候選軸（接案：個人工作室↔大公司、動手做↔教你；保養品：平價↔高價…），
//      軸只能是連續的光譜，不准用次數、也不准用二選一的（台灣／國際只有兩種答案，當軸一定擠成兩坨）
//   2. Perplexity 上網查每一家（含你自己）在 4 個軸上站哪、為什麼，附來源網址；看完資料挑最分散的兩軸畫
// 只放 AI 這次推過的品牌（平台、通路不算），挑誰不看被推幾次。

export interface MapAxis {
  low: string; // 軸的 -2 端
  high: string; // 軸的 +2 端
}
// 每個候選軸的分數＋理由（右邊「你 vs 它」對照表用；沒查到是 null）
export interface DimScore {
  v: number;
  why: string;
}
export interface MapPoint {
  name: string;
  dims?: (DimScore | null)[];
  x: number; // -2～2
  y: number;
  type: string; // 它是哪一類，10 字內
  quote: string; // AI 查到的理由（放位置的依據）
  url?: string; // 出處
}
export interface RivalMap {
  x: MapAxis;
  y: MapAxis;
  self: { x: number; y: number; why: string; url?: string; type?: string; dims?: (DimScore | null)[] };
  points: MapPoint[];
  axes?: MapAxis[]; // 全部候選軸（x、y 是其中兩個）
}

const MAX_POINTS = 10;
// AI 自己的網站不是任何一家的出處
const AI_HOSTS = ['chatgpt.com', 'openai.com', 'gemini.google.com', 'perplexity.ai', 'claude.ai', 'copilot.microsoft.com', 'grok.com'];

// 出處要是這次真的查到的網址（sonar 回的 annotations）；對手的出處不能是你自己的站或帳號頁。
// 11-23 aiqkangber：對手的出處出現 chatgpt.com 和受測者自己的官網，都是模型隨手填的。對不上就不附出處。
export function checkedSource(url: unknown, found: string[], self: { domain: string; keys: string[]; isSelf: boolean }): string | undefined {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return undefined;
  const hit = found.find((f) => sameUrl(f, url));
  if (!hit) return undefined;
  const host = hostnameOf(hit);
  if (AI_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return undefined;
  if (!self.isSelf && (isSameSite(host, self.domain) || handleIsBrand(new URL(hit), self.keys))) return undefined;
  return hit;
}
const AXIS_MODEL = 'openai/gpt-4.1';
const SEARCH_MODEL = 'perplexity/sonar';

const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ');

function keysOf(name: string): string[] {
  return [...(name.match(/[一-鿿]{2,}/g) ?? []), ...(name.match(/[A-Za-z][A-Za-z0-9.&'-]{2,}/g) ?? [])].map((k) => k.toLowerCase());
}

// AI 在推薦題回答裡講這家的那幾行，給模型認清是哪一家（同名的很多）
function describe(name: string, answers: string[]): string {
  const keys = keysOf(name);
  if (keys.length === 0) return '';
  const out: string[] = [];
  for (const a of answers) {
    const lines = a.split('\n');
    lines.forEach((line, i) => {
      if (!keys.some((k) => line.toLowerCase().includes(k))) return;
      out.push(line);
      if (line.replace(/[#*\-\d.\s|]/g, '').length <= 30) out.push(lines[i + 1] ?? '', lines[i + 2] ?? '');
    });
  }
  return clean([...new Set(out.filter(Boolean))].join(' ')).trim().slice(0, 200);
}

const clamp = (n: unknown) => {
  const v = Math.round(Number(n) * 2) / 2;
  return n !== null && n !== '' && Number.isFinite(v) ? Math.max(-2, Math.min(2, v)) : null;
};

// 11-18 小積木：「怎麼都是大公司，這很諷刺，因為我就是競品分析」——原本取名單前 10 家（依被推次數排），
// 前面全是「AI 客服顧問」題帶出來的系統商。改成請模型從 AI 推過的全部業者裡，挑規模和服務最像你的。
async function pickPeersAndAxes(
  brandName: string,
  self: string,
  all: { name: string; text: string }[],
  apiKey: string,
): Promise<{ axes: MapAxis[]; peers: number[] } | null> {
  const prompt = `我們要替「${brandName}」畫一張市場定位圖。請做兩件事：
1. 從下面「AI 推薦過的業者」裡，挑出最多 ${MAX_POINTS} 家「規模和服務內容最像${brandName}」、客人會拿來跟它比的同類業者。大公司、系統商、軟體平台如果${brandName}不是同一類，就不要挑。只有人名、沒有公司或工作室名稱的（例如「Antonio」「Max」）查不到是誰，不要挑。
2. 依這個產業，列 4 個「客人選店家時真的會比」的軸，要能把挑出來的這幾家分開。

「${brandName}」官網介紹：
${self}

AI 推薦過的業者：
${all.map((r, i) => `[${i}] ${r.name}${r.text ? `：${r.text.slice(0, 80)}` : ''}`).join('\n')}

規則：
- 每個軸是一條連續的光譜，兩端用台灣人平常講的話，各 8 字內。例如：
  接案／顧問業：「個人工作室 ↔ 大公司／系統商」「幫你動手做 ↔ 教你、給建議」「專做一件事 ↔ 什麼都做」
  保養品：「平價 ↔ 高價」「日常保養 ↔ 專業醫療」「天然溫和 ↔ 科學功效」
  家具：「現成品 ↔ 全客製」「平價 ↔ 高價」「個人居家 ↔ 商空／企業」
- 不能用次數、聲量、知名度。不能用只有兩種答案的（例如台灣／國際、有沒有門市）——大家會擠成兩坨。
- 4 個軸要彼此獨立（不要一個是價格、一個是高級感）。
- 挑能讓這幾家分散開的軸。

只回傳 JSON：{"peers":[編號,…],"axes":[{"low":"…","high":"…"}]}`;
  try {
    const p = parseJson<{ peers?: unknown[]; axes?: Partial<MapAxis>[] }>(await askJson(prompt, apiKey, 500, AXIS_MODEL));
    const ok = (a?: Partial<MapAxis>): a is MapAxis => !!a?.low?.trim() && !!a?.high?.trim();
    const axes = (p?.axes ?? []).filter(ok).map((a) => ({ low: a.low.trim(), high: a.high.trim() })).slice(0, 4);
    const peers = [...new Set((p?.peers ?? []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < all.length))].slice(0, MAX_POINTS);
    return axes.length >= 2 && peers.length >= 3 ? { axes, peers } : null;
  } catch {
    return null;
  }
}

export async function buildRivalMap(
  rv: Pick<RecommendVisibility, 'brandName' | 'questions' | 'names'>,
  input: Pick<RecommendInput, 'title' | 'description' | 'services'>,
  origin: string,
  apiKey: string,
): Promise<RivalMap | null> {
  const answers = rv.questions.flatMap((q) => q.results.map((r) => r.answer ?? ''));
  const all = rv.names
    .filter((n) => !n.isSelf && n.kind !== 'channel')
    .slice(0, 60)
    .map((n) => ({ name: n.name, text: describe(n.name, answers) }));
  if (all.length < 3) return null;

  const self = [input.title, input.description, input.services?.slice(0, 400)].filter(Boolean).join('\n').slice(0, 700);
  // 11-18 先挑兩軸再查 → 縱軸 11 家有 9 家擠在「高度客製」；改成 4 個候選軸都查，看完資料再挑最分散的兩個
  const picked = await pickPeersAndAxes(rv.brandName, self, all, apiKey);
  if (!picked) return null;
  const { axes } = picked;
  const rivals = picked.peers.map((i) => all[i]);

  const domain = hostnameOf(origin);
  const keys = brandKeys([rv.brandName], domain);
  // 一次丟 10 家，Perplexity 只查了 2 家就交差、4 家一批也常整批跳過或編號對錯（11-18 aiqkangber）；
  // 3 家一批平行查，回傳用名稱對回去（不信編號），你自己放在每一批當參考點
  const BATCH = 3;
  const batches: number[][] = [];
  for (let i = 0; i < rivals.length; i += BATCH) batches.push(rivals.slice(i, i + BATCH).map((_, j) => i + j));
  const ask = async (ids: number[]): Promise<Record<string, unknown>[]> => {
    const list = [`[0] ${rv.brandName}（官網 ${domain}）`, ...ids.map((i) => `[${i + 1}] ${rivals[i].name}${rivals[i].text ? `：${rivals[i].text}` : ''}`)].join('\n');
    const prompt = `請上網查下面這幾家台灣業者，判斷它們在每個軸上各站在哪裡：

${axes.map((a, i) => `a${i}：${a.low}（-2） ↔ ${a.high}（2）`).join('\n')}

${list}

規則：
- 每一家都要查，每個軸給 -2～2（可以用 .5），依你查到的官網、價目、商品、案例等實際資料判斷，各家要拉開差別，不要全給一樣的分數。
- reason：每個軸各一句為什麼放這裡，25 字內，講查到的具體事實（例如「一枚板 NT$3 萬起」「一人接案、主做 n8n」）。
- url：查到這個事實的網址。
- type：它是哪一類，10 字內。
- name 照抄上面列的名稱。每一家都要回，真的查不到、不確定是哪一家的才不列。

只回傳 JSON，不要其他文字：{"items":[{"name":"照抄上面的名稱","scores":{${axes.map((_, i) => `"a${i}":[0,"理由"]`).join(',')}},"type":"…","url":"https://…"}]}（我在台灣，請找台灣的資料，用繁體中文回答）`;
    try {
      const res = await paidFetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': 'GEO Check Rival Map',
        },
        body: JSON.stringify({ model: SEARCH_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.2 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { choices?: { message?: { content?: string; annotations?: { url_citation?: { url?: string } }[] } }[] };
      const found = (data.choices?.[0]?.message?.annotations ?? []).flatMap((a) => a.url_citation?.url ?? []);
      const p = parseJson<{ items?: Record<string, unknown>[] }>(data.choices?.[0]?.message?.content ?? '');
      // 只收這一批的編號，模型偶爾會回別批的
      // 用名稱對回編號：你自己＝0，這一批的業者＝原本的編號＋1；對不上的丟掉
      const same = (a: string, b: string) => a.replace(/\s/g, '').toLowerCase() === b.replace(/\s/g, '').toLowerCase();
      return (Array.isArray(p?.items) ? p!.items : []).flatMap((it) => {
        const n = String(it.name ?? '');
        if (same(n, rv.brandName)) return [{ ...it, id: 0, url: checkedSource(it.url, found, { domain, keys, isSelf: true }) }];
        const i = ids.find((k) => same(n, rivals[k].name));
        return i === undefined ? [] : [{ ...it, id: i + 1, url: checkedSource(it.url, found, { domain, keys, isSelf: false }) }];
      });
    } catch {
      return [];
    }
  };
  const results = await Promise.all(batches.map(ask));
  // 你自己用第一批的位置（每批各給一次，取第一個查到的）
  const items = [...results.flatMap((r) => r.filter((it) => it.id === 0)).slice(0, 1), ...results.flatMap((r) => r.filter((it) => it.id !== 0))];

  // 每一家、每個軸的分數＋理由
  type Row = { id: number; type: string; url?: string; s: Map<number, { v: number; why: string }> };
  const rows: Row[] = [];
  for (const it of items) {
    const id = typeof it.id === 'number' ? it.id : -1;
    if (id < 0 || id > rivals.length || rows.some((r) => r.id === id)) continue;
    const sc = (it.scores ?? {}) as Record<string, unknown>;
    const s = new Map<number, { v: number; why: string }>();
    axes.forEach((_, i) => {
      const val = sc[`a${i}`];
      const v = clamp(Array.isArray(val) ? val[0] : val);
      const why = Array.isArray(val) ? clean(String(val[1] ?? '')).trim().slice(0, 50) : '';
      if (v !== null) s.set(i, { v, why });
    });
    const url = typeof it.url === 'string' ? it.url : undefined;
    rows.push({ id, type: String(it.type ?? '').trim().slice(0, 16), url, s });
  }
  const selfRow = rows.find((r) => r.id === 0);
  const others = rows.filter((r) => r.id !== 0);
  if (!selfRow) return null;

  // 挑兩個軸：兩軸都有分數的家數 × 兩軸裡比較少的那個「分出幾種位置」最大的組合
  const sd = (vs: number[]) => {
    const m = vs.reduce((a, b) => a + b, 0) / vs.length;
    return Math.sqrt(vs.reduce((a, b) => a + (b - m) ** 2, 0) / vs.length);
  };
  let best: { i: number; j: number; score: number } | null = null;
  for (let i = 0; i < axes.length; i++)
    for (let j = i + 1; j < axes.length; j++) {
      if (!selfRow.s.has(i) || !selfRow.s.has(j)) continue;
      const on = others.filter((r) => r.s.has(i) && r.s.has(j));
      if (on.length < 3) continue;
      const vi = [selfRow.s.get(i)!.v, ...on.map((r) => r.s.get(i)!.v)];
      const vj = [selfRow.s.get(j)!.v, ...on.map((r) => r.s.get(j)!.v)];
      // 先看分出幾種位置（11-18 原沐「現成品↔全客製」6 家同分、只有木百貨一家不同，標準差卻被它拉高而被選中），
      // 同樣多的再看標準差
      const levels = (vs: number[]) => new Set(vs).size;
      const score = on.length * Math.min(levels(vi), levels(vj)) * 10 + Math.min(sd(vi), sd(vj));
      if (!best || score > best.score) best = { i, j, score };
    }
  if (!best) return null;
  const { i, j } = best;
  const why = (r: Row) => [r.s.get(i)!.why, r.s.get(j)!.why].filter(Boolean).join('；');
  const dims = (r: Row) => axes.map((_, k) => r.s.get(k) ?? null);
  const points: MapPoint[] = others
    .filter((r) => r.s.has(i) && r.s.has(j))
    .map((r) => ({ name: rivals[r.id - 1].name, x: r.s.get(i)!.v, y: r.s.get(j)!.v, type: r.type, quote: why(r), url: r.url, dims: dims(r) }));
  const selfPt = { x: selfRow.s.get(i)!.v, y: selfRow.s.get(j)!.v, why: why(selfRow), url: selfRow.url, type: selfRow.type, dims: dims(selfRow) };
  return { x: axes[i], y: axes[j], self: selfPt, points, axes };
}
