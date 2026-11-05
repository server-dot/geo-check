import { askJson, parseJson } from './geo-recommend-visibility';
import { runVisibilityQueries, type VisibilityAnswer } from './geo-brand-visibility';
import { fetchGoogleAio } from './geo-google-aio';
import { sameUrl, sourcesOfLine } from './geo-owned-sources';

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
  citations?: { url: string }[]; // 對 [n] 標記用，認出哪句話出自品牌自己的來源
}

// 這一行引用的來源全部是品牌自己的 → 這行是在轉述品牌自己的內容
function lineFromOwned(line: string, citations: { url: string }[] | undefined, owned: Set<string>): boolean {
  if (owned.size === 0) return false;
  const src = sourcesOfLine(line, citations ?? []);
  return src.length > 0 && src.every((u) => [...owned].some((o) => sameUrl(o, u)));
}

function shortEngine(e: string): string {
  return e.split(/[（(]/)[0].trim();
}

const OWNED_TAG = '〔這句的來源是品牌自己的網站或文章〕';

function buildPrompt(brandName: string, answers: SentimentInput[], owned: Set<string>): string {
  const tag = (a: SentimentInput) =>
    a.answer
      .split('\n')
      .map((l) => (lineFromOwned(l, a.citations, owned) ? `${l} ${OWNED_TAG}` : l))
      .join('\n');
  const blocks = answers.map((a, i) => `[${i}] ${shortEngine(a.engine)}：\n${tag(a).slice(0, 2500)}`).join('\n\n---\n\n');
  return `下面是幾個 AI 回答裡提到「${brandName}」的段落。請整理出 AI 對「${brandName}」這個品牌本身的評價，分成正面跟負面。

規則：
- 只抓在講「${brandName}」的句子。講整個產品類別、講別的品牌、一般衛教知識，都不算。
- 中性的事實（官網網址、成立年份、在哪裡買得到、產品有哪些）不算評價，不要抓。
- AI 轉述「${brandName}」自己寫的內容，不算別人對它的評價。例如「${brandName}」的文章批評某個工具不準、自己測出能見度低，AI 把這些講成「${brandName}」的缺點——這是誤讀，不要抓。
- 句尾標了「${OWNED_TAG}」的，是 AI 在轉述「${brandName}」自己寫的東西，不是外界的評價，不要當負面說法抓。
- 回答講的是名字很像的其他對象（別的店、別的公司、別的品牌），那一段整段跳過。
- AI 自己的推測（「可能」「或許」「需要不斷提升」這種沒有根據的套話）不算評價。
- 同一個意思在不同回答出現，合併成一條；每一段都要附上那一段裡的原句當證據。
- 每條說法用台灣人平常講話的方式寫，具體、短（20 字內），例如「配方溫和、適合敏感肌」「價格比開架品牌高」。不要寫「支持精緻的日常護理」這種空話。
- 證據的 quote 必須是那一段原文裡「一字不差」的連續片段（10～40 字），不要改寫、不要補字。找不到原句的段落不要列。
- 沒有評價就給空陣列，不要硬湊。

${blocks}

只回傳 JSON：{"themes":[{"theme":"…","polarity":"positive","evidence":[{"answer":0,"quote":"…"},{"answer":2,"quote":"…"}]}]}`;
}

export async function extractSentiment(
  brandName: string,
  answers: SentimentInput[],
  apiKey: string,
  owned: Set<string> = new Set(),
): Promise<SentimentResult | null> {
  if (answers.length === 0) return null;
  type Parsed = { themes?: { theme?: unknown; polarity?: unknown; evidence?: unknown }[] };
  // 格式不對就再問一次：11-05 Relove 實測模型回了 {"positive":[…],"negative":[…]}（沒有 themes、沒有原句），
  // 整個評價區塊就靜默消失。
  const prompt = buildPrompt(brandName, answers, owned);
  let parsed: Parsed | null = null;
  for (let attempt = 0; attempt < 2 && !Array.isArray(parsed?.themes); attempt++) {
    try {
      const raw = await askJson(
        attempt === 0 ? prompt : `${prompt}\n\n注意：最外層一定要是 {"themes":[…]}，每條都要有 theme、polarity、evidence（含 answer 編號跟 quote 原句），不要用其他格式。`,
        apiKey,
        1200,
      );
      parsed = parseJson<Parsed>(raw);
    } catch {
      parsed = null;
    }
  }
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
      // 負評的原句如果出自品牌自己的文章（那一行的來源全是品牌的），是誤讀，不算
      if (t.polarity === 'negative') {
        const a = answers[e.answer];
        const line = a.answer.split('\n').find((l) => norm(l).includes(norm(q)));
        if (line && lineFromOwned(line, a.citations, owned)) continue;
      }
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
  const kept = await checkNegatives(brandName, themes, answers, owned, apiKey);
  kept.sort((a, b) => b.count - a.count || (a.polarity === 'positive' ? -1 : 1));
  return { themes: kept, answerCount: answers.length };
}

// 負評再覆核一次：只問「這句的主詞是不是品牌本身」。
// 11-04 aiqkangber：ChatGPT 寫「技術建議的準確性：…Contenta 工具在技術建議中指出的問題有時並不準確」，
// 講的是 Contenta，那行也沒附來源（規則認不出出自品牌自己的文章），抽取時一半機率被當成 Q kangber 的負評。
// 一次抽取要顧太多規則，單問一題比較穩。呼叫失敗就照原樣保留。
async function checkNegatives(
  brandName: string,
  themes: SentimentTheme[],
  answers: SentimentInput[],
  owned: Set<string>,
  apiKey: string,
): Promise<SentimentTheme[]> {
  const neg = themes.map((t, i) => [t, i] as const).filter(([t]) => t.polarity === 'negative');
  if (neg.length === 0) return themes;
  const context = (t: SentimentTheme) => {
    const n = (x: string) => x.replace(/[\s*_`#>|\[\]()]/g, '');
    for (const a of answers) {
      const lines = a.answer.split('\n');
      const at = lines.findIndex((l) => n(l).includes(n(t.quote)));
      if (at >= 0) {
        return lines
          .slice(Math.max(0, at - 4), at + 1)
          .map((l) => (lineFromOwned(l, a.citations, owned) ? `${l} ${OWNED_TAG}` : l))
          .join('\n')
          .slice(-700);
      }
    }
    return t.quote;
  };
  const items = neg.map(([t], k) => `[${k}] 說法：${t.theme}\n原文段落：\n${context(t)}`).join('\n\n---\n\n');
  const prompt = `下面每一條是從 AI 回答裡整理出來、說是「${brandName}」的負面評價。請逐條判斷：原文段落是不是真的在批評「${brandName}」本身（它的服務、作品、內容、價格、能力、口碑）？

以下都算「不是」：
- 句子的主詞是別的東西：某個工具、某個平台、整個產業、別的品牌（例如「某某工具的建議不準確」）
- AI 在轉述「${brandName}」自己寫的文章或測試結果（段落標了「${OWNED_TAG}」的通常是這種）
- 講的是名字很像的其他對象
- AI 沒有根據的推測或套話（「競爭激烈，需要不斷提升」）

${items}

只回傳 JSON：{"keep":[0,2]}，keep 放「真的在批評 ${brandName}」的編號；都不是就回 {"keep":[]}。`;
  let raw = '';
  try {
    raw = await askJson(prompt, apiKey, 200);
  } catch {
    return themes;
  }
  const parsed = parseJson<{ keep?: unknown }>(raw);
  if (!parsed || !Array.isArray(parsed.keep)) return themes;
  const keep = new Set(parsed.keep.filter((x): x is number => typeof x === 'number').map((k) => neg[k]?.[1]));
  return themes.filter((t, i) => t.polarity === 'positive' || keep.has(i));
}

// 拿來歸納的素材：推薦題裡「答案真的點名你」的回答＋用你的名字直接問的回答
export function sentimentInputs(
  rec: { questions: { results: { engine: string; answer: string; namedSelf: boolean; citations?: { url: string }[] }[] }[] },
  brandChecks: { engine: string; answer: string; citations?: { url: string }[] }[],
): SentimentInput[] {
  return [
    ...rec.questions.flatMap((q) =>
      q.results.filter((r) => r.namedSelf).map((r) => ({ engine: r.engine, answer: r.answer, citations: r.citations })),
    ),
    ...brandChecks.map((b) => ({ engine: b.engine, answer: b.answer, citations: b.citations })),
  ];
}

// 推薦題只會問出賣點：AI 列推薦名單時不會主動講缺點。2026-11-02 實測 Relove：推薦題歸納出
// 「正面 5、負面 0」，但 Google 搜「Relove 評價」的 AI 摘要第一句就是「評價兩極化」，
// 列了除毛膏刺激、效果有限等負評。所以輿情要另外直接問一題評價，三家各問一次。
// 「Relove私密及全身保養 官方網站」→「Relove」：一般人問 AI 只會打品牌名
// 英文開頭的品牌保留連續的英文詞：「Q kangber」不能切成「Q」（2026-11-04 aiqkangber.com
// 被問成「Q 是什麼品牌」，AI 全在講 Samsung Q 系列、Q Burger）。切完不到 2 個字就用原名。
export function selfShortName(brandName: string): string {
  const name = brandName.trim();
  const latin = name.match(/^[A-Za-z0-9][A-Za-z0-9&.'\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9&.'\-]*)*/)?.[0]?.trim();
  const head = name.split(/[\s|｜\-–—:：]/)[0]?.trim();
  const short = latin || head || name;
  return short.length >= 2 ? short : name;
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
