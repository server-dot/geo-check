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
  const blocks = answers.map((a, i) => `[${i}] ${shortEngine(a.engine)}：\n${tag(a)}`).join('\n\n---\n\n');
  return `下面是幾個 AI 回答裡提到「${brandName}」的段落。請整理出 AI 對「${brandName}」這個品牌本身的評價，分成正面跟負面。

規則：
- 只抓在講「${brandName}」的句子。講整個產品類別、講別的品牌、一般衛教知識，都不算。
- 中性的事實（官網網址、成立年份、在哪裡買得到、產品有哪些）不算評價，不要抓。
- AI 轉述「${brandName}」自己寫的內容，不算別人對它的評價。例如「${brandName}」的文章批評某個工具不準、自己測出能見度低，AI 把這些講成「${brandName}」的缺點——這是誤讀，不要抓。
- 句尾標了「${OWNED_TAG}」的，只是在轉述「${brandName}」自己文章裡的內容就不要抓；如果是 AI 看了它的網站之後自己下的評語（例如資訊不夠完整、案例不足），要抓。
- 每一段都要從頭看到尾。回答有列缺點、風險、疑慮的小節時，每一個小節各抓一條負面，不要只抓第一個，也不要把不同的缺點併成一條。
- 回答講的是名字很像的其他對象（別的店、別的公司、別的品牌），那一段整段跳過。
- 沒有根據的套話（「或許」「需要不斷提升」）不算評價。有講出具體理由的風險或疑慮（例如某項資訊沒公開、只有一個人負責）算負面評價。
- 同一個意思在不同回答出現，合併成一條；每一段都要附上那一段裡的原句當證據。
- 每條說法用台灣人平常講話的方式寫，具體、短（20 字內），例如「配方溫和、適合敏感肌」「價格比開架品牌高」。不要寫「支持精緻的日常護理」這種空話。
- 證據的 quote 必須是那一段原文裡「一字不差」的連續片段（10～40 字），只抄最能代表這個評價的一句話，不要改寫、補字，不要把條列的好幾點接成一句。小節標題本身就講出評價時，直接抄那個標題當 quote（不含編號）。找不到原句的段落不要列。
- 沒有評價就給空陣列，不要硬湊。

${blocks}

只回傳 JSON：{"themes":[{"theme":"…","polarity":"positive","evidence":[{"answer":0,"quote":"…"},{"answer":2,"quote":"…"}]}]}`;
}

const norm = (t: string) => t.replace(/[\s*_`#>|\[\]()]/g, '');

// 模型抄原句時常把條列接成一大句，整句比對會被刷掉（11-23 aiqkangber：5 條負評全抓到、全因此消失）。
// 整句對不上就留下原文裡找得到的最長一段，顯示的引文一定是原文。
export function verbatimPart(text: string, quote: string): string | null {
  const q = quote.trim();
  if (norm(q).length >= 4 && text.includes(norm(q))) return q;
  const parts = q.match(/[^，。；、：]+[，。；、：]?/g) ?? [];
  let best = '';
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j <= parts.length; j++) {
      const run = parts.slice(i, j).join('').replace(/[，。；、：]$/, '').trim();
      if (!text.includes(norm(run))) break;
      if (norm(run).length > norm(best).length) best = run;
    }
  }
  return norm(best).length >= 8 ? best : null;
}

// 那一段所在的小節標題（原文，去掉 # 和編號）。引文只剩條列裡的一小段時，標題比殘句看得懂
function headingOf(answer: string, part: string): string | null {
  const lines = answer.split('\n');
  const at = lines.findIndex((l) => norm(l).includes(norm(part)));
  for (let i = at; i >= 0; i--) {
    const m = lines[i].match(/^#{1,6}\s+(?:[\d一二三四五六七八九十]+[.、．]\s*)?(.+)$/);
    if (m) return m[1].replace(/\*\*/g, '').trim();
  }
  return null;
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
        3000,
      );
      parsed = parseJson<Parsed>(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || !Array.isArray(parsed.themes)) return null;
  // 次數不能信模型自己報：2026-11-02 實測它把只出現在 1 段的說法標成 3 段。
  // 每段都要附原句，回頭到那一段原文核對得到才算。
  const texts = answers.map((a) => norm(a.answer));
  const themes: SentimentTheme[] = [];
  for (const t of parsed.themes) {
    if (typeof t.theme !== 'string' || !t.theme.trim()) continue;
    if (t.polarity !== 'positive' && t.polarity !== 'negative') continue;
    const ev = Array.isArray(t.evidence) ? t.evidence : [];
    const ok = new Map<number, string>();
    const exact = new Set<number>();
    for (const e of ev as { answer?: unknown; quote?: unknown }[]) {
      if (typeof e?.answer !== 'number' || typeof e.quote !== 'string') continue;
      const q = texts[e.answer] ? verbatimPart(texts[e.answer], e.quote) : null;
      if (!q) continue;
      const whole = q === e.quote.trim();
      const shown = whole ? q : headingOf(answers[e.answer].answer, q) ?? q;
      // 同一段有整句核對得到的，優先於只剩一小段的
      if (!ok.has(e.answer) || (whole && !exact.has(e.answer))) ok.set(e.answer, shown);
      if (whole) exact.add(e.answer);
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
// 一次抽取要顧太多規則，單問一題比較穩。
// 11-23 aiqkangber：原本「那一行只引用品牌自己的網站」的負評直接刪掉，但 AI 看完官網後下的評語
// （案例多為自有作品、資安資訊不完整）也是引用官網，全被誤刪。改成交給這一步判斷是轉述還是評語；
// 呼叫失敗時才退回舊規則，把只引用自己網站的負評拿掉。
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
    for (const a of answers) {
      const lines = a.answer.split('\n');
      const q = norm(t.quote);
      const at = lines.findIndex((l) => norm(l).includes(q) || (norm(l).length >= 8 && q.endsWith(norm(l))));
      if (at >= 0) {
        // 往上到小節標題（最多 8 行）、往下多帶幾行：只看前面幾行常看不出這句在批評什麼
        let from = at;
        while (from > 0 && at - from < 8 && !/^#{1,6}\s/.test(lines[from])) from--;
        const to = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l));
        return lines
          .slice(from, Math.min(to < 0 ? lines.length : to, at + 7))
          .map((l) => (lineFromOwned(l, a.citations, owned) ? `${l} ${OWNED_TAG}` : l))
          .join('\n')
          .slice(0, 1200);
      }
    }
    return t.quote;
  };
  const items = neg.map(([t], k) => `[${k}] 說法：${t.theme}\n原文段落：\n${context(t)}`).join('\n\n---\n\n');
  const prompt = `下面每一條是從 AI 回答裡整理出來、說是「${brandName}」的負面評價。請逐條判斷：原文段落是不是真的在批評「${brandName}」本身（它的服務、作品、內容、價格、能力、口碑）？

以下都算「不是」：
- 句子的主詞是別的東西：某個工具、某個平台、整個產業、別的品牌（例如「某某工具的建議不準確」）
- AI 在轉述「${brandName}」自己寫的文章或測試結果（段落標了「${OWNED_TAG}」的要特別看：轉述文章裡講的事就算「不是」；AI 看了它的網站後，自己評論它哪裡不足，算「是」）
- 講的是名字很像的其他對象
- 沒有根據的套話（「競爭激烈，需要不斷提升」）。有講出具體理由的風險或疑慮算「是」

${items}

每一條都要回答（共 ${neg.length} 條），只回傳 JSON：{"verdicts":{${neg.map((_, k) => `"${k}":"是或不是"`).join(',')}}}`;
  const fallback = () => themes.filter((t) => t.polarity === 'positive' || !context(t).split('\n').some((l) => norm(l).includes(norm(t.quote)) && l.includes(OWNED_TAG)));
  let raw = '';
  try {
    raw = await askJson(prompt, apiKey, 200);
  } catch {
    return fallback();
  }
  const parsed = parseJson<{ verdicts?: Record<string, unknown> }>(raw);
  if (!parsed?.verdicts || typeof parsed.verdicts !== 'object') return fallback();
  // 逐條回答：原本請它回編號清單、範例寫 [0,2]，它每次都照抄 [0,2]（11-23 連跑 5 次）
  const verdicts = parsed.verdicts;
  const keep = new Set(neg.flatMap(([, i], k) => (String(verdicts[k] ?? '').trim() === '是' ? [i] : [])));
  return themes.filter((t, i) => t.polarity === 'positive' || keep.has(i));
}

// 拿來歸納的素材：推薦題裡「答案真的點名你」的回答＋用你的名字直接問的回答
export function sentimentInputs(
  rec: { questions: { results: { engine: string; answer: string; namedSelf: boolean; citations?: { url: string }[] }[] }[] },
  brandChecks: { engine: string; answer: string; citations?: { url: string }[]; wrongEntity?: string }[],
): SentimentInput[] {
  return [
    ...rec.questions.flatMap((q) =>
      q.results.filter((r) => r.namedSelf).map((r) => ({ engine: r.engine, answer: r.answer, citations: r.citations })),
    ),
    ...brandChecks.filter((b) => !b.wrongEntity).map((b) => ({ engine: b.engine, answer: b.answer, citations: b.citations })),
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
