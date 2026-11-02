import { askJson, parseJson } from './geo-recommend-visibility';

// ── AI 怎麼評價你（輿情）──────────────────────────────────
// 參考 WorkDuo 的「情緒」頁：把 AI 回答裡講到你的句子，整理成一條一條正面／負面的說法。
// 差別：WorkDuo 一週有幾十個回答可以歸納，我們一次健檢只有幾段（推薦題裡點名你的＋
// 用你的名字問的），所以畫面上只列「說法＋出現在幾段＋哪家 AI」，不做「正面 87／負面 48」
// 那種看起來很準的大數字。多一次便宜模型呼叫；失敗就回 null，不影響報告其他部分。

export interface SentimentTheme {
  theme: string; // 一句短中文，例如「配方溫和、適合敏感肌」
  polarity: 'positive' | 'negative';
  count: number; // 出現在幾段回答
  engines: string[];
  quote: string; // 回答裡的原句（節錄）
  quoteEngine: string;
}

export interface SentimentResult {
  themes: SentimentTheme[];
  answerCount: number; // 拿來歸納的回答段數
}

export interface SentimentInput {
  engine: string;
  answer: string;
}

function shortEngine(e: string): string {
  return e.split(/[（(]/)[0].trim();
}

function buildPrompt(brandName: string, answers: SentimentInput[]): string {
  const blocks = answers.map((a, i) => `[${i}] ${shortEngine(a.engine)}：\n${a.answer.slice(0, 2500)}`).join('\n\n---\n\n');
  return `下面是幾個 AI 回答裡提到「${brandName}」的段落。請整理出 AI 對「${brandName}」這個品牌本身的評價，分成正面跟負面。

規則：
- 只抓在講「${brandName}」的句子。講整個產品類別、講別的品牌、一般衛教知識，都不算。
- 中性的事實（官網網址、成立年份、在哪裡買得到、產品有哪些）不算評價，不要抓。
- 同一個意思在不同回答出現，合併成一條，列出它出現在哪幾段。
- 每條說法用台灣人平常講話的方式寫，具體、短（20 字內），例如「配方溫和、適合敏感肌」「價格比開架品牌高」。不要寫「支持精緻的日常護理」這種空話。
- quote 從原文節錄一小段（40 字內），不要改寫。
- 沒有評價就給空陣列，不要硬湊。

${blocks}

只回傳 JSON：{"themes":[{"theme":"…","polarity":"positive","answers":[0,2],"quote":"…","quoteFrom":0}]}`;
}

export async function extractSentiment(brandName: string, answers: SentimentInput[], apiKey: string): Promise<SentimentResult | null> {
  if (answers.length === 0) return null;
  let raw = '';
  try {
    raw = await askJson(buildPrompt(brandName, answers), apiKey, 1200);
  } catch {
    return null;
  }
  const parsed = parseJson<{ themes?: { theme?: unknown; polarity?: unknown; answers?: unknown; quote?: unknown; quoteFrom?: unknown }[] }>(raw);
  if (!parsed || !Array.isArray(parsed.themes)) return null;
  const themes: SentimentTheme[] = [];
  for (const t of parsed.themes) {
    if (typeof t.theme !== 'string' || !t.theme.trim()) continue;
    if (t.polarity !== 'positive' && t.polarity !== 'negative') continue;
    const idx = Array.isArray(t.answers) ? [...new Set(t.answers.filter((n): n is number => typeof n === 'number' && n >= 0 && n < answers.length))] : [];
    if (idx.length === 0) continue;
    const from = typeof t.quoteFrom === 'number' && answers[t.quoteFrom] ? t.quoteFrom : idx[0];
    themes.push({
      theme: t.theme.trim(),
      polarity: t.polarity,
      count: idx.length,
      engines: [...new Set(idx.map((i) => shortEngine(answers[i].engine)))],
      quote: typeof t.quote === 'string' ? t.quote.trim() : '',
      quoteEngine: shortEngine(answers[from].engine),
    });
  }
  themes.sort((a, b) => b.count - a.count || (a.polarity === 'positive' ? -1 : 1));
  return { themes, answerCount: answers.length };
}

// 拿來歸納的素材：推薦題裡「答案真的點名你」的回答＋用你的名字直接問的回答
export function sentimentInputs(
  rec: { questions: { results: { engine: string; answer: string; namedSelf: boolean }[] }[] },
  brandChecks: { engine: string; answer: string }[],
): SentimentInput[] {
  return [
    ...rec.questions.flatMap((q) => q.results.filter((r) => r.namedSelf).map((r) => ({ engine: r.engine, answer: r.answer }))),
    ...brandChecks.map((b) => ({ engine: b.engine, answer: b.answer })),
  ];
}
