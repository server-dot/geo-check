import { askJson, parseJson } from './geo-recommend-visibility';

// ── 品牌輪廓：各家 AI 把你介紹成什麼樣子 ─────────────────────
// 2026-11-03 小積木：「用名字問很怪」——原本品牌題只看回答裡有沒有官網網址，客戶真正在意的是
// AI 把他講成什麼樣子。改成請 AI 介紹品類、主力產品、特色、價格帶、通路，再逐項整理成表，
// 每一格都附原句、回原文核對得到才留（模型會自己編，輿情那一步抓到過）。

export const PROFILE_FIELDS = [
  { key: 'category', label: '品類' },
  { key: 'products', label: '主力產品／服務' },
  { key: 'features', label: '品牌特色' },
  { key: 'price', label: '價格帶' },
  { key: 'channels', label: '通路／管道' },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]['key'];

export interface ProfileCell {
  engine: string;
  value: string; // 空字串＝這家 AI 沒提到
  quote: string;
  // 跟官網對不上時才有：官網原文（回頁面核對過）＋哪一頁
  siteMismatch?: { note: string; siteQuote: string; url: string };
}

export interface ProfileRow {
  key: ProfileFieldKey;
  label: string;
  cells: ProfileCell[];
  conflict: string; // 各家說法互相矛盾時的一句說明，沒有就空字串
}

export interface ProfileKeyword {
  word: string; // 8 字內的形容，例如「私密保養」「台灣品牌」
  engines: string[]; // 哪幾家 AI 這樣講
  field?: ProfileFieldKey; // 屬於品牌輪廓哪一支（心智圖分支用）；11-13 前存的報告沒有，前端自己猜
}

export interface BrandProfile {
  engines: string[];
  rows: ProfileRow[];
  intros?: string[]; // 每家回答的第一句（原文），跟 engines 同順序
  keywords?: ProfileKeyword[];
  summaries?: string[]; // 每家 AI 怎麼介紹你的摘要，跟 engines 同順序（11-13 起跟關鍵詞同一次呼叫產生；舊報告沒有，前端用 intros）
}

interface AnswerIn {
  engine: string;
  answer: string;
}

function shortEngine(e: string): string {
  return e.split(/[（(]/)[0].trim();
}

// 11-12 改成中性問法：原本問「是什麼品牌？產品類別、主力產品、價格帶、販售通路」是零售品牌的框架，
// 接案／顧問／服務業（aiqkangber）三家 AI 第一句都在糾正題目「它不是消費品牌，而是…」，
// Google 還因為「品牌」兩字扯到同名早午餐店。改完還沒花錢實測，下次有人健檢時順便看。
export function profileQuery(brand: string): string {
  return `「${brand}」是做什麼的？請介紹它的類別、主力產品或服務、特色、價格帶、在哪裡買或怎麼找到它，每項一兩句就好，並附上官方網站。`;
}

// Google 只吃搜尋字串，長問句反而不出 AI 摘要
export function profileGoogleQuery(brand: string): string {
  return `${brand} 是什麼`;
}

const norm = (t: string) => t.replace(/[\s*_`#>|[\]()【】「」]/g, '');

// 模型抄原句常把兩三段接起來，或在中間自己補幾個字（「…寶雅等，以及Relove的官方網站」），
// 整句比對會被刷掉。拆成小段，過半小段在原文找得到才算數；顯示時只留找得到的那幾段，
// 畫面上的引文一定是原文。
function verifiedQuote(text: string, quote: string): string | null {
  const parts = quote.split(/[，。；;：:…]+|,(?!\d)/).map((p) => p.trim()).filter((p) => norm(p).length >= 3);
  const found = parts.filter((p) => text.includes(norm(p)));
  return parts.length > 0 && found.length * 2 >= parts.length ? found.join('…') : null;
}

// 一段回答各自整理：三段一起丟給模型時，它常整格漏掉（2026-11-03 實測 ChatGPT 那段五項都寫了，只抽出兩項）
async function extractOne(brand: string, answer: string, apiKey: string): Promise<Partial<Record<ProfileFieldKey, { value: string; quote: string }>>> {
  const fieldList = PROFILE_FIELDS.map((f) => `${f.key}（${f.label}）`).join('、');
  const prompt = `下面是一個 AI 介紹「${brand}」的回答。請整理它對這個品牌的描述：${fieldList}。賣商品的看商品、通路；做服務的（接案、顧問、診所…）主力產品寫服務項目，通路寫怎麼找到或委託它（官網、接案平台、LINE）。

- value 用短中文（20 字內）寫回答怎麼說，例如「私密清潔、私密保養」「藥妝店、官網」。只寫回答裡有的，不要補。
- 每一項都仔細找；回答完全沒提到的項目就不要列。
- quote 抄回答裡一字不差的原句（6～40 字）。

回答：
${answer.slice(0, 4000)}

只回傳 JSON：{"category":{"value":"…","quote":"…"},"products":{…},"features":{…},"price":{…},"channels":{…}}`;
  let raw = '';
  try {
    raw = await askJson(prompt, apiKey, 700);
  } catch {
    return {};
  }
  const parsed = parseJson<Record<string, { value?: unknown; quote?: unknown }>>(raw) ?? {};
  const text = norm(answer);
  const out: Partial<Record<ProfileFieldKey, { value: string; quote: string }>> = {};
  for (const f of PROFILE_FIELDS) {
    const v = parsed[f.key];
    if (typeof v?.value !== 'string' || typeof v.quote !== 'string' || !v.value.trim()) continue;
    const quote = verifiedQuote(text, v.quote);
    if (!quote) continue;
    out[f.key] = { value: v.value.trim(), quote };
  }
  return out;
}

const CONFLICT_KEYS: ProfileFieldKey[] = ['category', 'price', 'channels'];

// 各家說法有沒有互相矛盾：只問「矛盾」不問「差異」，詳略不同不算（不然每格都會被標）
async function findConflicts(brand: string, rows: ProfileRow[], apiKey: string): Promise<Record<string, string>> {
  // 主力產品、特色每家列的本來就不一樣，比了只會一直被標；只比講法該一致的三項
  const multi = rows.filter((r) => CONFLICT_KEYS.includes(r.key) && r.cells.filter((c) => c.value).length >= 2);
  if (multi.length === 0) return {};
  const list = multi
    .map((r) => `${r.key}（${r.label}）：${r.cells.filter((c) => c.value).map((c) => `${c.engine} 說「${c.value}」`).join('；')}`)
    .join('\n');
  const prompt = `幾個 AI 介紹「${brand}」，各項目的說法如下。請判斷每一項的說法有沒有「互相矛盾」——例如一家說平價、一家說高價；一家說保養品、一家說保健食品。只是詳略不同、用詞不同、一家多講一點，都不算矛盾。

${list}

只回傳 JSON：{"category":{"conflict":false,"note":""}}，conflict 為 true 時 note 用一句話寫差在哪（25 字內）。`;
  try {
    const parsed = parseJson<Record<string, { conflict?: unknown; note?: unknown }>>(await askJson(prompt, apiKey, 400)) ?? {};
    return Object.fromEntries(
      multi.filter((r) => parsed[r.key]?.conflict === true && typeof parsed[r.key]?.note === 'string').map((r) => [r.key, String(parsed[r.key].note).trim()]),
    );
  } catch {
    return {};
  }
}

// 每家回答的第一句：AI 被問到你時開口的那句話，最能代表它怎麼看你。直接截原文，不經模型。
export function firstSentence(answer: string): string {
  const plain = answer
    .replace(/\[\d+\]|【[^】]*】|\[([^\]]*)\]\([^)]*\)/g, (m, t) => t ?? '')
    .replace(/[*_`#>]/g, '')
    .replace(/[「」]/g, '')
    .trim();
  // 跳過開場白：「以下是我整理的台灣資料：」「好的，」這種結尾是冒號、或以「以下／根據／好的」開頭的短句，
  // 不是 AI 對你的描述（11-12 原沐製材所 ChatGPT 卡只剩這一句）
  const parts = plain.match(/[^。！？\n]+[。！？\n]?/g) ?? [plain];
  const pick = parts.map((p) => p.replace(/\n/g, '').trim().replace(/^[-•]\s*/, '')).find((p) => p && !/[：:]$/.test(p) && !/^(以下|根據|好的|當然)/.test(p));
  return (pick ?? plain.replace(/\n/g, ' ').trim()).slice(0, 90);
}

// 各家講到的特點合併成一組關鍵詞，標出幾家 AI 這樣講：三家都講的就是 AI 對你的共識
async function collectKeywords(brand: string, rows: ProfileRow[], engines: string[], apiKey: string): Promise<{ keywords: ProfileKeyword[]; summaries: string[] }> {
  const list = engines
    .map((e, i) => `${e}：${rows.map((r) => r.cells[i].value && `${r.label}＝${r.cells[i].value}`).filter(Boolean).join('；') || '（沒有）'}`)
    .join('\n');
  const prompt = `幾個 AI 介紹「${brand}」時的說法如下。請整理成 8～14 個描述這個品牌的關鍵詞（五類都要有，某一類沒有任何 AI 提到才略過）（每個 8 字內，例如「私密保養」「台灣品牌」「價格親民」「藥妝通路」），意思相同的合併成一個，並標出是哪幾家 AI 講的，以及它屬於哪一類（field 只能填 ${PROFILE_FIELDS.map((f) => `${f.key}＝${f.label}`).join('、')}）。
另外替每一家 AI 各寫一段 60 字內的摘要（summaries，key 是 AI 名稱）：這家 AI 把「${brand}」介紹成什麼、主打什麼、價格和通路怎麼說（沒提到就寫沒提到）。只根據下面的說法，不要加形容詞或建議。

${list}

只回傳 JSON：{"summaries":{"${engines[0]}":"…"},"keywords":[{"word":"私密保養","engines":["${engines.join('","')}"],"field":"category"}]}`;
  try {
    const parsed = parseJson<{ summaries?: Record<string, unknown>; keywords?: { word?: unknown; engines?: unknown; field?: unknown }[] }>(await askJson(prompt, apiKey, 1200));
    const keys: string[] = PROFILE_FIELDS.map((f) => f.key);
    const summaries = engines.map((e) => {
      const v = parsed?.summaries?.[e];
      return typeof v === 'string' ? v.trim().slice(0, 120) : '';
    });
    const keywords = (parsed?.keywords ?? [])
      .filter((k): k is { word: string; engines: unknown[]; field?: unknown } => typeof k.word === 'string' && Array.isArray(k.engines))
      .map((k) => ({
        word: k.word.trim(),
        engines: engines.filter((e) => k.engines.includes(e)),
        ...(typeof k.field === 'string' && keys.includes(k.field) ? { field: k.field as ProfileFieldKey } : {}),
      }))
      .filter((k) => k.word && k.engines.length > 0)
      .sort((a, b) => b.engines.length - a.engines.length)
      .slice(0, 14);
    return { keywords, summaries };
  } catch {
    return { keywords: [], summaries: [] };
  }
}

export interface SitePage {
  url: string;
  title: string;
  text: string;
}

// 核對官網要讀哪幾頁：首頁＋服務、價格、關於、FAQ、聯絡這類講「自己是誰、賣什麼、多少錢」的頁
const FACT_PAGE = /\/(services?|pricing|price|plans?|about|faq|contact|shop|products?|collections?)(\/|$)|服務|價格|方案|關於/i;

function siteExcerpt(pages: SitePage[]): { text: string; pages: SitePage[] } {
  const home = pages.find((p) => { try { return new URL(p.url).pathname === '/'; } catch { return false; } });
  const picked = [...(home ? [home] : []), ...pages.filter((p) => p !== home && FACT_PAGE.test(decodeURIComponent(p.url)))].slice(0, 6);
  const text = picked.map((p, i) => `[頁${i}] ${p.url}\n${p.text.slice(0, 2200)}`).join('\n\n');
  return { text, pages: picked };
}

// 2026-11-04 小積木：AI 介紹品牌講錯（Perplexity 說「官網沒有公開報價」，服務頁明明標了 NT$3,600 起），
// 工具卻照單全收。拿爬到的官網逐格核對，只標「跟官網說法相反」的，官網沒寫到的不算錯。
async function checkAgainstSite(brand: string, rows: ProfileRow[], pages: SitePage[], apiKey: string): Promise<void> {
  const { text, pages: picked } = siteExcerpt(pages);
  if (!text) return;
  const items: { id: string; cell: ProfileCell; label: string }[] = [];
  rows.forEach((r) => r.cells.forEach((c, i) => c.value && items.push({ id: `${r.key}.${i}`, cell: c, label: r.label })));
  if (items.length === 0) return;
  const prompt = `幾個 AI 介紹「${brand}」，下面是它們的說法，以及「${brand}」官網的內容。請逐條核對：AI 的說法跟官網寫的「互相矛盾」嗎？

只有「官網明確寫了相反的事」才算矛盾，例如 AI 說「沒有公開價格」但官網列了價格、AI 說「只在實體店賣」但官網有線上購買。
AI 講得比官網籠統、多講了官網沒寫的事、用詞不同，都不算矛盾。
要連「原句」一起看：原句裡只要有一句跟官網相反就算，特別是「官網沒有寫／沒有公開 X」這種說法，官網其實有寫 X 就是矛盾。

AI 的說法：
${items.map((it) => `${it.id}｜${it.cell.engine}｜${it.label}：${it.cell.value}（原句：${it.cell.quote}）`).join('\n')}

官網內容：
${text}

只回傳 JSON：{"mismatches":[{"id":"price.0","note":"官網服務頁有列價格","page":0,"siteQuote":"官網原文一字不差的片段（6～40 字）"}]}。沒有矛盾就回 {"mismatches":[]}。`;
  let parsed: { mismatches?: { id?: unknown; note?: unknown; page?: unknown; siteQuote?: unknown }[] } | null = null;
  try {
    parsed = parseJson(await askJson(prompt, apiKey, 700));
  } catch {
    return;
  }
  for (const m of parsed?.mismatches ?? []) {
    const it = items.find((x) => x.id === m.id);
    const page = typeof m.page === 'number' ? picked[m.page] : undefined;
    if (!it || !page || typeof m.siteQuote !== 'string' || typeof m.note !== 'string') continue;
    // 官網引文要回那一頁核對得到，模型編的不算
    const q = verifiedQuote(norm(page.text), m.siteQuote);
    if (!q) continue;
    it.cell.siteMismatch = { note: m.note.trim().slice(0, 40), siteQuote: q, url: page.url };
  }
}

export async function extractProfile(brand: string, answers: AnswerIn[], apiKey: string, sitePages: SitePage[] = []): Promise<BrandProfile | null> {
  if (answers.length === 0) return null;
  const engines = answers.map((a) => shortEngine(a.engine));
  const per = await Promise.all(answers.map((a) => extractOne(brand, a.answer, apiKey)));
  const rows: ProfileRow[] = PROFILE_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    cells: engines.map((engine, i) => ({ engine, value: per[i][f.key]?.value ?? '', quote: per[i][f.key]?.quote ?? '' })),
    conflict: '',
  }));
  const [conflicts, { keywords, summaries }] = await Promise.all([
    findConflicts(brand, rows, apiKey),
    collectKeywords(brand, rows, engines, apiKey),
    checkAgainstSite(brand, rows, sitePages, apiKey).catch(() => {}),
  ]);
  for (const r of rows) r.conflict = conflicts[r.key] ?? '';
  return { engines, rows, intros: answers.map((a) => firstSentence(a.answer)), keywords, ...(summaries.some(Boolean) ? { summaries } : {}) };
}
