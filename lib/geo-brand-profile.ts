import { askJson, parseJson } from './geo-recommend-visibility';

// ── 品牌輪廓：各家 AI 把你介紹成什麼樣子 ─────────────────────
// 2026-11-03 小積木：「用名字問很怪」——原本品牌題只看回答裡有沒有官網網址，客戶真正在意的是
// AI 把他講成什麼樣子。改成請 AI 介紹品類、主力產品、特色、價格帶、通路，再逐項整理成表，
// 每一格都附原句、回原文核對得到才留（模型會自己編，輿情那一步抓到過）。

export const PROFILE_FIELDS = [
  { key: 'category', label: '品類' },
  { key: 'products', label: '主力產品' },
  { key: 'features', label: '品牌特色' },
  { key: 'price', label: '價格帶' },
  { key: 'channels', label: '通路' },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]['key'];

export interface ProfileCell {
  engine: string;
  value: string; // 空字串＝這家 AI 沒提到
  quote: string;
}

export interface ProfileRow {
  key: ProfileFieldKey;
  label: string;
  cells: ProfileCell[];
  conflict: string; // 各家說法互相矛盾時的一句說明，沒有就空字串
}

export interface BrandProfile {
  engines: string[];
  rows: ProfileRow[];
}

interface AnswerIn {
  engine: string;
  answer: string;
}

function shortEngine(e: string): string {
  return e.split(/[（(]/)[0].trim();
}

export function profileQuery(brand: string): string {
  return `「${brand}」是什麼品牌？請介紹它的產品類別、主力產品、品牌特色、價格帶、販售通路，每項一兩句就好，並附上官方網站。`;
}

// Google 只吃搜尋字串，長問句反而不出 AI 摘要
export function profileGoogleQuery(brand: string): string {
  return `${brand} 是什麼品牌`;
}

const norm = (t: string) => t.replace(/[\s*_`#>|[\]()【】「」]/g, '');

// 模型抄原句常把兩三段接起來，或在中間自己補幾個字（「…寶雅等，以及Relove的官方網站」），
// 整句比對會被刷掉。拆成小段，過半小段在原文找得到才算數；顯示時只留找得到的那幾段，
// 畫面上的引文一定是原文。
function verifiedQuote(text: string, quote: string): string | null {
  const parts = quote.split(/[，,。；;：:…]+/).map((p) => p.trim()).filter((p) => norm(p).length >= 3);
  const found = parts.filter((p) => text.includes(norm(p)));
  return parts.length > 0 && found.length * 2 >= parts.length ? found.join('…') : null;
}

// 一段回答各自整理：三段一起丟給模型時，它常整格漏掉（2026-11-03 實測 ChatGPT 那段五項都寫了，只抽出兩項）
async function extractOne(brand: string, answer: string, apiKey: string): Promise<Partial<Record<ProfileFieldKey, { value: string; quote: string }>>> {
  const fieldList = PROFILE_FIELDS.map((f) => `${f.key}（${f.label}）`).join('、');
  const prompt = `下面是一個 AI 介紹「${brand}」的回答。請整理它對這個品牌的描述：${fieldList}。

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

export async function extractProfile(brand: string, answers: AnswerIn[], apiKey: string): Promise<BrandProfile | null> {
  if (answers.length === 0) return null;
  const engines = answers.map((a) => shortEngine(a.engine));
  const per = await Promise.all(answers.map((a) => extractOne(brand, a.answer, apiKey)));
  const rows: ProfileRow[] = PROFILE_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    cells: engines.map((engine, i) => ({ engine, value: per[i][f.key]?.value ?? '', quote: per[i][f.key]?.quote ?? '' })),
    conflict: '',
  }));
  const conflicts = await findConflicts(brand, rows, apiKey);
  for (const r of rows) r.conflict = conflicts[r.key] ?? '';
  return { engines, rows };
}
