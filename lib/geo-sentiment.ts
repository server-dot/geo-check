import { askJson, parseJson } from './geo-recommend-visibility';
import { runVisibilityQueries, type VisibilityAnswer } from './geo-brand-visibility';
import { fetchGoogleAio } from './geo-google-aio';

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
  reviewQuery?: string; // 另外直接問的評價題（例如「Relove 評價」）
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
- 同一個意思在不同回答出現，合併成一條；每一段都要附上那一段裡的原句當證據。
- 每條說法用台灣人平常講話的方式寫，具體、短（20 字內），例如「配方溫和、適合敏感肌」「價格比開架品牌高」。不要寫「支持精緻的日常護理」這種空話。
- 證據的 quote 必須是那一段原文裡「一字不差」的連續片段（10～40 字），不要改寫、不要補字。找不到原句的段落不要列。
- 沒有評價就給空陣列，不要硬湊。

${blocks}

只回傳 JSON：{"themes":[{"theme":"…","polarity":"positive","evidence":[{"answer":0,"quote":"…"},{"answer":2,"quote":"…"}]}]}`;
}

export async function extractSentiment(brandName: string, answers: SentimentInput[], apiKey: string): Promise<SentimentResult | null> {
  if (answers.length === 0) return null;
  let raw = '';
  try {
    raw = await askJson(buildPrompt(brandName, answers), apiKey, 1200);
  } catch {
    return null;
  }
  const parsed = parseJson<{ themes?: { theme?: unknown; polarity?: unknown; evidence?: unknown }[] }>(raw);
  if (!parsed || !Array.isArray(parsed.themes)) return null;
  // 次數不能信模型自己報：2026-11-02 實測它把只出現在 1 段的說法標成 3 段。
  // 每段都要附原句，回頭到那一段原文核對得到才算。
  const norm = (t: string) => t.replace(/[\s*_`#>|\[\]()]/g, '');
  const texts = answers.map((a) => norm(a.answer));
  const themes: SentimentTheme[] = [];
  for (const t of parsed.themes) {
    if (typeof t.theme !== 'string' || !t.theme.trim()) continue;
    if (t.polarity !== 'positive' && t.polarity !== 'negative') continue;
    const ev = Array.isArray(t.evidence) ? t.evidence : [];
    const ok = new Map<number, string>();
    for (const e of ev as { answer?: unknown; quote?: unknown }[]) {
      if (typeof e?.answer !== 'number' || typeof e.quote !== 'string') continue;
      const q = e.quote.trim();
      if (norm(q).length < 4 || !texts[e.answer]?.includes(norm(q))) continue;
      if (!ok.has(e.answer)) ok.set(e.answer, q);
    }
    if (ok.size === 0) continue;
    const [first, quote] = [...ok.entries()][0];
    themes.push({
      theme: t.theme.trim(),
      polarity: t.polarity,
      count: ok.size,
      engines: [...new Set([...ok.keys()].map((i) => shortEngine(answers[i].engine)))],
      quote,
      quoteEngine: shortEngine(answers[first].engine),
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

// 推薦題只會問出賣點：AI 列推薦名單時不會主動講缺點。2026-11-02 實測 Relove：推薦題歸納出
// 「正面 5、負面 0」，但 Google 搜「Relove 評價」的 AI 摘要第一句就是「評價兩極化」，
// 列了除毛膏刺激、效果有限等負評。所以輿情要另外直接問一題評價，三家各問一次。
// 「Relove私密及全身保養 官方網站」→「Relove」：一般人問 AI 只會打品牌名
export function selfShortName(brandName: string): string {
  const latin = brandName.match(/^[A-Za-z0-9][A-Za-z0-9\-]{2,}/)?.[0];
  const head = brandName.split(/[\s|｜\-–—:：]/)[0]?.trim();
  return latin ?? head ?? brandName;
}

export function reviewQueryFor(brandName: string): string {
  return `${selfShortName(brandName)} 評價`;
}

export async function fetchReviewAnswers(brandName: string, origin: string): Promise<{ query: string; answers: VisibilityAnswer[] }> {
  const query = reviewQueryFor(brandName);
  const [llm, google] = await Promise.all([
    runVisibilityQueries(`${query}如何？有什麼優點跟缺點？請具體說明，並附上來源網址。`, origin, 900).catch(() => null),
    fetchGoogleAio(query, origin).catch(() => null),
  ]);
  return { query, answers: [...(llm ?? []), ...(google?.status === 'present' ? [google.answer] : [])] };
}
