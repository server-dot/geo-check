import { askJson, parseJson, type RecommendedName } from './geo-recommend-visibility';

// ── AI 怎麼定位你跟對手 ────────────────────────────────────
// 競爭對手分析只比「被點名幾次」太淺：客戶真正想知道的是 AI 推對手的時候說了它什麼好、
// 說你的時候又說了什麼。從同一批回答裡，替你跟前幾名對手各整理 2～4 個 AI 用來形容它的特點。
// 每個特點都要附原句，回原文核對得到才留（模型會自己編，2026-11-02 輿情那一步就抓到過）。

export interface PositioningTrait {
  text: string; // 短中文，例如「歷史悠久、藥局常見」
  quote: string;
  engine: string;
}

export interface BrandPositioning {
  brand: string;
  isSelf: boolean;
  traits: PositioningTrait[];
}

interface AnswerIn {
  engine: string;
  answer: string;
}

const MAX_RIVALS = 4;

function shortEngine(e: string): string {
  return e.split(/[（(]/)[0].trim();
}

// 前幾名對手：只算品牌（通路不算），同一個名字的不同寫法讓模型自己認
export function topRivals(names: RecommendedName[]): string[] {
  return names
    .filter((n) => !n.isSelf && n.kind !== 'channel')
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RIVALS)
    .map((n) => n.name);
}

export async function extractPositioning(
  selfName: string,
  rivals: string[],
  answers: AnswerIn[],
  apiKey: string,
): Promise<BrandPositioning[] | null> {
  if (answers.length === 0 || rivals.length === 0) return null;
  const blocks = answers.map((a, i) => `[${i}] ${shortEngine(a.engine)}：\n${a.answer.slice(0, 2500)}`).join('\n\n---\n\n');
  const brands = [selfName, ...rivals];
  const prompt = `下面是幾個 AI 回答推薦類問題的內容。請替這幾個品牌，各整理出 AI 用來形容它的特點：${brands.map((b) => `「${b}」`).join('、')}。

規則：
- 每個品牌 2～4 個特點，只抓 AI 在講「這個品牌」的句子，別的品牌的描述不要混進來。
- 特點用台灣人平常講話的方式寫，具體、短（12 字內），例如「歷史悠久、藥局常見」「價格偏高」「主打天然成分」。不要寫「品質優良」「深受喜愛」這種每個品牌都能套的空話。
- 好的壞的都要（價格高、刺激也是特點）。
- quote 必須是原文裡一字不差的連續片段（10～40 字），answer 填它出自第幾段。找不到原句的特點不要列。
- 回答裡完全沒描述某個品牌，就給它空陣列。

${blocks}

只回傳 JSON：{"brands":[{"brand":"…","traits":[{"text":"…","answer":0,"quote":"…"}]}]}`;

  let raw = '';
  try {
    raw = await askJson(prompt, apiKey, 1600);
  } catch {
    return null;
  }
  const parsed = parseJson<{ brands?: { brand?: unknown; traits?: unknown }[] }>(raw);
  if (!parsed || !Array.isArray(parsed.brands)) return null;
  const norm = (t: string) => t.replace(/[\s*_`#>|[\]()]/g, '');
  const texts = answers.map((a) => norm(a.answer));
  const out: BrandPositioning[] = [];
  for (const b of parsed.brands) {
    if (typeof b.brand !== 'string') continue;
    const traits: PositioningTrait[] = [];
    for (const t of (Array.isArray(b.traits) ? b.traits : []) as { text?: unknown; answer?: unknown; quote?: unknown }[]) {
      if (typeof t?.text !== 'string' || typeof t.quote !== 'string' || typeof t.answer !== 'number') continue;
      const q = t.quote.trim();
      if (norm(q).length < 4 || !texts[t.answer]?.includes(norm(q))) continue;
      traits.push({ text: t.text.trim(), quote: q, engine: shortEngine(answers[t.answer].engine) });
    }
    out.push({ brand: b.brand.trim(), isSelf: b.brand.trim() === selfName, traits });
  }
  return out;
}
