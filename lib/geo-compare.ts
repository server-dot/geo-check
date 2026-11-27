import { runVisibilityQueries, type VisibilityAnswer } from './geo-brand-visibility';
import { fetchGoogleAio } from './geo-google-aio';
import { askJson, parseJson } from './geo-recommend-visibility';
import { brandTokens } from './geo-rival-facts';
import { trimLeadIn } from './geo-compare-text';

// ── AI 怎麼比較你和對手（11-25）──────────────────────────────
// 直接問三家 AI「差在哪、各適合誰」，列原文；這是 AI 的看法，不當成事實、不打分數。
// 整理那步只准抄原文；程式核對①引文真的在回答裡②那段真的在講這一家（標題、表格列或欄、句子裡的品牌）。
export const GOODS = ['價格', '成分配方', '適合誰', '優點', '缺點或限制'];
export const SERVICE = ['價格', '服務內容', '適合誰', '優點', '缺點或限制'];
export interface CompareCell { brand: string; aspect: string; engine: string; quote: string }
export interface AiCompare {
  aspects?: string[];
  askedAt?: string;
  question: string;
  brands: string[]; // 第一個是你
  answers: VisibilityAnswer[];
  cells: CompareCell[];
  dropped: number; // 對不上原文或對錯家，沒放的
}

export const bare = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const lower = (s: string) => s.toLowerCase().replace(/[\s'’.&·・-]/g, '');
const mentions = (text: string, brand: string) => {
  const t = lower(text);
  return brandTokens(brand).some((k) => t.includes(k));
};

// 這句在回答裡的哪一行、那一行在講哪一家
export function ownerOf(answer: string, quote: string, brands: string[]): string[] | null {
  const lines = answer.split('\n');
  const q = bare(quote);
  const at = lines.findIndex((l) => bare(l).includes(q));
  if (at < 0) return null;
  const line = lines[at];
  const inLine = (t: string) => brands.filter((b) => mentions(t, b));
  if (line.trim().startsWith('|')) {
    const cellsOf = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|');
    const cells = cellsOf(line);
    const row = inLine(cells[0]);
    if (row.length > 0) return row;
    // 品牌在欄標題
    let h = at;
    while (h > 0 && lines[h - 1].trim().startsWith('|')) h--;
    const col = cells.findIndex((c) => bare(c).includes(q));
    const head = cellsOf(lines[h])[col] ?? '';
    return inLine(head);
  }
  // 句子裡有品牌就看離引文最近、在它前面的那個；沒有就往上找最近一個標題或段落開頭
  const pos = line.indexOf(quote.slice(0, 6));
  const before = pos > 0 ? line.slice(0, pos + quote.length) : line;
  const own = inLine(before);
  if (own.length === 1) return own;
  if (own.length > 1) {
    const last = own.map((b) => ({ b, i: Math.max(...brandTokens(b).map((k) => lower(before).lastIndexOf(k))) })).sort((x, y) => y.i - x.i)[0];
    return [last.b];
  }
  for (let i = at - 1; i >= 0 && i > at - 25; i--) {
    const found = inLine(lines[i]);
    if (found.length === 1) return found;
    if (found.length > 1 && /^#|^\*\*/.test(lines[i].trim())) return null;
  }
  return null;
}

// AI 說自己查不到，不是那家的缺點
const NO_DATA = /資料不足|查不到|找不到|結果不足|未提供|未見公開|看不到|無法可靠|缺少.{0,12}(資訊|頁面|資料)|無法.{0,10}(比較|確認|列出)|不適合拿來/;

async function extract(a: VisibilityAnswer, brands: string[], aspects: string[], apiKey: string): Promise<{ cells: CompareCell[]; dropped: number }> {
  const prompt = `下面是 AI 回答「這幾家品牌差在哪」的內容。請把它對每一家的說法抄出來，只抄原文。

品牌：${brands.join('、')}
面向：${aspects.join('、')}

回答：
${a.answer.slice(0, 7000)}

規則：
- quote 從回答照抄 4～60 字，一字不差，要看得懂在講什麼；不要抄品牌名標題。
- 只抄明確在講這一家的；講全部品牌的通則不要抄。
- 沒講到的面向就不列。每家每個面向最多 2 句。
- 缺點或限制：回答有講不適合、要注意、較貴、香味、刺激等才列。
只回傳 JSON：{"rows":[{"brand":"照抄上面的品牌","aspect":"價格","quote":"…"}]}`;
  const p = parseJson<{ rows?: { brand?: unknown; aspect?: unknown; quote?: unknown }[] }>(await askJson(prompt, apiKey, 3000, 'openai/gpt-4.1').catch(() => ''));
  const cells: CompareCell[] = [];
  let dropped = 0;
  for (const r of p?.rows ?? []) {
    const brand = brands.find((b) => b === r.brand);
    const aspect = aspects.find((x) => x === r.aspect);
    const quote = typeof r.quote === 'string' ? trimLeadIn(r.quote.trim()) : '';
    if (!brand || !aspect || bare(quote).length < 3 || NO_DATA.test(quote)) continue;
    const owner = ownerOf(a.answer, quote, brands);
    if (!owner || !owner.includes(brand) || owner.length > 1) {
      dropped++;
      if (process.env.CMP_DEBUG) console.log('DROP', a.engine.slice(0, 10), brand, aspect, quote.slice(0, 40), owner);
      continue;
    }
    // 同一句（或它的一部分）不重複放在別的面向
    if (!cells.some((c) => c.brand === brand && (bare(c.quote).includes(bare(quote)) || bare(quote).includes(bare(c.quote))))) cells.push({ brand, aspect, engine: a.engine, quote: quote.replace(/\[\d+\]|\*\*/g, '').trim() });
  }
  return { cells, dropped };
}

export async function askCompare(brand: string, rivals: string[], topic: string, goods: boolean, origin: string, apiKey: string): Promise<AiCompare | null> {
  const brands = [brand, ...rivals];
  const aspects = goods ? GOODS : SERVICE;
  const base = goods ? `${brands.join('、')}的${topic}產品差在哪裡？請逐一比較價格、主要成分、適合誰、優點和缺點，並附上來源網址。` : `做${topic}的${brands.join('、')}差在哪裡？請逐一比較價格、服務內容、適合誰、優點和缺點，並附上來源網址。`;
  const question = base;
  const [llm, google] = await Promise.all([
    runVisibilityQueries(question, origin, 8000), // 上限只防失控，照實際字數計費
    fetchGoogleAio(`${brands.join(' ')} ${topic} 比較`, origin).catch(() => null),
  ]);
  const answers = [...(llm ?? []), ...(google?.status === 'present' ? [google.answer] : [])];
  if (answers.length === 0) return null;
  const got = await Promise.all(answers.map((a) => extract(a, brands, aspects, apiKey)));
  return { question, brands, aspects, askedAt: new Date().toISOString(), answers, cells: got.flatMap((g) => g.cells), dropped: got.reduce((n, g) => n + g.dropped, 0) };
}
