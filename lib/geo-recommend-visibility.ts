import { runVisibilityQueries, hostnameOf, isSameSite, guessBrandName, type VisibilityAnswer } from './geo-brand-visibility';
import type { RealQuestionSource } from './geo-real-questions';
import { SITE_URL } from '@/lib/site';
import type { ContentMatch } from './geo-content-match';
import { fetchGoogleAio } from './geo-google-aio';
import type { SentimentResult } from './geo-sentiment';
import type { BrandPositioning } from './geo-positioning';
import type { RivalMap } from './geo-rival-map';
import type { BrandProfile } from './geo-brand-profile';
import { noteOpenRouterFailure } from './openrouter-health';
import { paidFetch } from './paid-fetch';

// ── GEO：推薦題自動查詢 ──────────────────────────────────
// 品牌能見度（geo-brand-visibility.ts）問的是「AI 認不認得你」；關鍵字能見度
// （geo-keyword-visibility.ts）問的是「這個主題底下 AI 推不推你」，但要使用者自己
// 點關鍵字才會跑——實際上大多數人不會點，報告就停在「AI 認得你」，看不到最關鍵
// 的那一頁：客戶問「有沒有推薦的 XX」時，AI 推的是誰、有沒有你。
//
// 2026-11-11 改成三步：健檢時列出候選題（網友在論壇問過的全部列出＋AI 讀首頁產生的，見 geo-real-questions.ts），
// 使用者在報告上勾最多 3 題（或自己寫），勾完才拿去問即時搜尋引擎，再從回答裡把「被點名推薦的名字」抽出來彙總。
// 網友問過＝知道有人這樣問，不知道多少人問；AI 產生的是推估——都不能包裝成需求量。
//
// 成本：每題 Perplexity、ChatGPT、Google 各問一次（11-12 起不換說法），加 1 次抽名字。
// 沒設 API key 或任一步失敗時回 null，健檢照常完成，不因為這段掛掉整份報告。

export interface RecommendQuestionResult {
  question: string;
  // 同一個意思的另一種問法（2026-11-03 數字要穩又不想每天問：每題換兩種問法一起問，
  // 樣本加倍，也才測得出「客戶不管怎麼問 AI 都會推你」）。舊結果沒有這欄。
  altQuestion?: string;
  // 題目取自網友在論壇真的問過的問題（見 geo-real-questions.ts）；沒有＝AI 產生的或使用者自己寫的
  source?: RealQuestionSource;
  // 題目從哪來：forum＝網友問過、ai＝AI 讀首頁產生、custom＝使用者自己寫。11-11 前的結果沒有這欄
  origin?: QuestionOrigin;
  // Google 這題的狀態：absent＝Google 真的沒給 AI 摘要（很多題本來就不出）、failed＝查詢失敗（逾時、額度）。
  // 原本兩種都只顯示「—」，看不出是沒有還是壞了（11-12 aiqkangber 第一題）。11-12 前的結果沒有這欄
  google?: 'present' | 'absent' | 'failed';
  results: RecommendAnswer[];
}

// keyword＝短關鍵字（「私密清潔凝露推薦」），11-11 加：ChatGPT 長句題都不推 Relove，問到主力品項的短關鍵字才排第一
export type QuestionOrigin = 'forum' | 'ai' | 'keyword' | 'custom';

// 使用者在報告上勾的題目（2026-11-11 起健檢不再自動問推薦題，先列候選題讓人勾）
export interface PickedQuestion {
  question: string;
  origin: QuestionOrigin;
  source?: RealQuestionSource;
}

// 健檢時先準備好的候選題：網友在論壇問過的（全部列出，只給人看、不能勾）＋ AI 參考網友問題與首頁產生的（給人勾）
export interface RecommendCandidates {
  forum: { question: string; source: RealQuestionSource }[];
  forumFailed?: boolean; // 論壇搜尋本身失敗（Serper 額度用完、逾時），不是沒人問
  ai: string[];
  // 短關鍵字：從首頁商品／服務分類抓「品項＋推薦」，一般人打進搜尋框的那種。11-11 前的紀錄沒有這欄
  keywords?: string[];
  // 從檢測紀錄打開的報告也要能勾題來問：問題要拿品牌名、首頁資訊當原料，跟著存進紀錄
  input: RecommendInput;
}

export interface RecommendAnswer extends VisibilityAnswer {
  advice: string;
  // 回答「正文」裡有沒有真的點名你。citedSelf 只代表你的網址出現在引用清單裡——
  // Perplexity 一個回答會列二十筆來源，其中大多數只是它查過的資料，不是它推薦的對象。
  // 只看 citedSelf 會把「查過你」講成「推薦你」，這是整份報告最容易講錯的一句話。
  namedSelf: boolean;
}

export interface RecommendedName {
  name: string;
  count: number;      // 幾個回答裡點名了它（同一回答重複提到只算一次）
  engines: string[];  // 哪些引擎點過名
  isSelf: boolean;
  // brand＝跟你搶客人的那一家；channel＝去哪裡買／找的管道（電商、通路、評論網站、媒體）。
  // 通路不是對手，報告的排名表跟聲量佔比不算它。舊的快取結果沒有這欄，當成 brand。
  kind?: 'brand' | 'channel';
  // 點名它的回答在「題目依序攤平」之後的位置（questions[0].results 先、再 questions[1]…）。
  // 報告要做「每題你 vs 對手」「各引擎點名幾次」都靠這個；舊的快取結果沒有這欄。
  answers?: number[];
}

export interface RecommendVisibility {
  brandName: string;
  questions: RecommendQuestionResult[];
  names: RecommendedName[];
  askedAt: string;    // ISO 時間，畫面上要標「這是幾點問的」——AI 回答會隨時間變
  totalAnswers: number;
  citedSelfCount: number;  // 引用清單裡出現你的網址的次數（寬鬆）
  namedSelfCount: number;  // 回答正文真的點名你的次數（嚴格，畫面上的標題用這個）
  // 「AI 為什麼沒推薦你」第 2 關：每題你網站上最接近的一頁（見 geo-content-match.ts）。
  // 要等爬蟲跑完才算得出來，所以是後補的；null／undefined 代表沒算出來，畫面上第 2 關就不給判斷。
  contentMatch?: ContentMatch[] | null;
  // 題目是使用者自己改過的，不是 AI 猜的——畫面上的說明文字要跟著換
  customQuestions?: boolean;
  // AI 怎麼評價你（見 geo-sentiment.ts）；跟 contentMatch 一樣是後補的
  sentiment?: SentimentResult | null;
  // AI 怎麼定位你跟前幾名對手（見 geo-positioning.ts）
  positioning?: BrandPositioning[] | null;
  // 競爭對手分析的市場定位圖：兩個軸看 AI 怎麼描述每家（見 geo-rival-map.ts）。11-17 試過的 peers（同類業者）、swot 已拿掉，舊紀錄的欄位不讀
  rivalMap?: RivalMap | null;
  // 11-12 拿掉「你跟某對手哪個好」的直接比較（只問得到一家、其他家沒問，畫面不一致；答案多半是「看需求」）。
  // 舊紀錄裡的 compare／compares 欄位留著不讀。
  profile?: BrandProfile | null;
}

export interface RecommendInput {
  brandName: string;
  title: string;
  description: string;
  h1: string[];
  leadParagraphs: string[];
  // 首頁純文字開頭。電商站的 <title> 常是「XX 線上購物」這種空話，靠標題猜出來的
  // 題目會變成「有沒有推薦的線上購物平台」；商品分類名多半在正文裡，要一起餵。
  preview: string;
  // 服務／產品頁的內文。11-11 aiqkangber.com：首頁幾乎都在講 n8n，題目全擠在 n8n，
  // LINE 機器人、AI Agent、遊戲開發這些服務只寫在服務頁。爬蟲跑完才有，舊紀錄沒有
  services?: string;
}

// 出題三處共用：服務頁內文
export function servicesBlock(input: RecommendInput): string {
  return input.services ? `\n【服務／產品頁】\n${input.services.slice(0, 2000)}\n` : '';
}

// 出題三處共用：題目要分散到不同服務
export const SPREAD_SERVICES = `- 這個網站如果有好幾種服務或產品線，題目要平均分到各項（看服務／產品頁），同一個服務、工具或品項最多佔三分之一，不要全擠在首頁最常出現的那一項。`;

const MODEL = 'openai/gpt-4.1-mini';
// 一次最多勾幾題：每題要問 Perplexity、ChatGPT、Google 各一次，題目多了等太久也太貴
export const MAX_PICKED_QUESTIONS = 3;
// AI 產生的候選題數量（使用者從中勾）
const AI_CANDIDATE_COUNT = 10;
const KEYWORD_COUNT = 5;

export async function askJson(prompt: string, apiKey: string, maxTokens: number, model = MODEL): Promise<string> {
  const res = await paidFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': SITE_URL,
      'X-Title': 'GEO Check Recommend Query',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      // 推理模型（gpt-5.x）不吃 temperature，推理要時間
      ...(model.startsWith('openai/gpt-5') ? { reasoning: { effort: 'low' } } : { temperature: 0.3 }),
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(model.startsWith('openai/gpt-5') ? 60000 : 30000),
  });
  if (!res.ok) {
    const body = await res.text();
    noteOpenRouterFailure(res.status, body);
    throw new Error(`OpenRouter 錯誤（${model}）：${body}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

export function parseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// 題目一定不能含品牌名——含了就變成「AI 認不認得你」，不是「AI 推不推你」。
// 三種題型分開要求，避免模型三題都生「有沒有推薦的 XX」這種同型題。
function buildQuestionPrompt(input: RecommendInput, count: number, forum: string[]): string {
  const lead = input.leadParagraphs.slice(0, 3).join('\n');
  const ref = forum.length
    ? `
【台灣網友在論壇真的問過的問題（參考用）】
${forum.map((q) => `- ${q}`).join('\n')}

這些是真人問過的。跟網站服務對得上的網友問題，要優先延伸：保留網友在意的條件（洗感、預算、在哪買、想換品牌、症狀、族群…）和他們的用字，不要換成網站的商品名或成分名。
網友沒問到的服務也要出題，不能因為網友只問了其中一項，題目就全擠在那一項。網友的條件比題型規則優先：題型分配可以不平均。
`
    : '';
  return `下面是一個網站的資訊。請站在「還不認識這個網站的一般台灣消費者」的角度，寫出 ${count} 個他們在找這類服務或資源時，會拿去問 ChatGPT 的問題。
${ref}
【網站標題】${input.title || '（無）'}
【網站描述】${input.description || '（無）'}
【主標題】${input.h1.join('／') || '（無）'}
【首頁內文摘錄】
${lead || '（無）'}
【首頁純文字開頭】
${input.preview.slice(0, 800) || '（無）'}
${servicesBlock(input)}
規則：
- 問題裡絕對不可以出現這個品牌的名稱「${input.brandName}」、網址，或任何能指向這個網站的字眼。要問的是「這一類」，不是「這一家」。
- 每一題都必須是在找「人、公司、網站、頻道、課程或服務」——也就是 AI 回答時會列出一串名字的那種問題。不要問技術怎麼做、工具怎麼選、服務要怎麼挑（例如「A 跟 B 該怎麼選」「怎麼設定 X」「XX 服務要怎麼挑」），那種題目 AI 只會講方法，不會推薦任何人。
${SPREAD_SERVICES}
- 用台灣人的口語，像真的在跟 AI 聊天，每題 15 到 40 字。
- 題型平均分配成三種，每種 ${Math.ceil(count / 3)} 題左右；同一種題型也要問不同的需求或情境，不要只換幾個字：
  1. 推薦型：「有沒有推薦的…」
  2. 選擇型：「台灣哪幾個…比較好」「…要怎麼挑」
  3. 情境型：「我是…（一個具體身分或處境），想…，有什麼推薦」
- 先判斷這個網站是哪一種，再決定題目要 AI 列出哪一種名字：
  - 賣商品的品牌或網路商店（保養品、服飾、食品、3C…）：問「哪個牌子／哪些品牌／哪裡買」，不要問「哪些人」「工作室」——那樣 AI 會列診所、店家或達人，商品品牌根本不會出現。
  - 個人品牌、工作室、顧問、講師、接案者：問「誰／哪些人／顧問／工作室」，不要寫成「公司」——寫成公司 AI 只列公司行號，個人和小工作室問不出來。
  - 公司或店家提供的服務（餐廳、診所、代理商、系統商…）：問「哪幾家／哪間」。
  - 看不出來就用「哪些」「有什麼推薦」這種不限型態的說法。
- 主題要貼著這個網站實際在賣、在做的東西（看內文與商品分類，不要只看標題），不要泛到「AI 工具推薦」「線上購物平台」這種太大的題。
${PRODUCT_NOT_CONTENT}
- 上面網友的問題如果在問食譜、做法、心得，跟這個網站賣的東西無關，就不要跟著問。

只回傳 JSON：{"questions":["問題一","問題二","…"]}`;
}

// forum：網友在論壇問過的問題，給 AI 參考（11-11 小積木：網友題只列出來看，勾的是 AI 參考它們產生的題目）
export async function generateRecommendQuestions(input: RecommendInput, apiKey: string, count = AI_CANDIDATE_COUNT, forum: string[] = []): Promise<string[]> {
  const raw = await askJson(buildQuestionPrompt(input, count, forum), apiKey, 2000);
  const parsed = parseJson<{ questions?: unknown }>(raw);
  const list = Array.isArray(parsed?.questions) ? parsed!.questions : [];
  const brand = input.brandName.toLowerCase();
  return list
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim())
    .filter((q) => q.length >= 8 && q.length <= 80)
    // 模型偶爾還是會把品牌名塞進去，塞了就丟掉這題，不要拿去問
    .filter((q) => !brand || !brandTokens(input.brandName).some((t) => q.toLowerCase().includes(t)))
    // 只問「怎麼挑／怎麼選」、沒要名單的題，AI 只會講方法（規則寫了模型還是會出，11-11 aiqkangber 兩題）
    .filter((q) => !/(怎麼|如何|要怎樣)(挑|選)/.test(q) || /推薦|哪(幾|些|家|間|個|裡)|誰/.test(q))
    .filter((q, i, arr) => arr.indexOf(q) === i)
    .slice(0, count);
}

// 品牌官網常放大量食譜、文章、教學（康寶首頁幾乎都是食譜），那是行銷內容，不是它賣的東西。
// 11-11 康寶實測：題目全變成「家常菜食譜網站推薦」「洋蔥切法推薦」，AI 當然不會推一個調味料品牌。出題三處共用這條
export const PRODUCT_NOT_CONTENT = `- 品牌官網上的食譜、文章、教學、部落格、實測心得是行銷內容，不是它賣的東西（例如網站寫了一篇「AI 短劇怎麼做」，不代表它賣 AI 短劇製作）。要找的是這個品牌實際販售的商品或服務類別（看選單或分類裡的「產品」「商品」「服務」，以及商品名，例如調味料品牌→「雞粉」「高湯塊」「濃湯」，不是「家常菜食譜」）。`;

// 品牌名：先用標題／機構名猜；猜到的是「主頁」這種通用字（或空的）才請 AI 讀首頁判斷。
// 回「中文名 英文名」（康寶 Knorr）：AI 回答多半寫中文，只給英文會比對不到「有沒有推薦你」
export async function resolveBrandName(
  vis: { title: string; orgName?: string; description: string; h1: string[]; preview: string },
  origin: string,
  apiKey: string | undefined,
): Promise<string> {
  const guess = guessBrandName(vis.title, vis.orgName);
  if (guess || !apiKey) return guess || hostnameOf(origin).split('.')[0];
  const prompt = `下面是一個網站首頁的資訊。這個網站是哪個品牌、公司或店家的？

【網址】${origin}
【網站標題】${vis.title || '（無）'}
【網站描述】${vis.description || '（無）'}
【主標題】${vis.h1.join('／') || '（無）'}
【首頁純文字開頭】
${vis.preview.slice(0, 800) || '（無）'}

規則：
- 回一般台灣人怎麼稱呼這個品牌。有中文名也有英文名就寫「中文 英文」（例如「康寶 Knorr」），只有一種就寫一種。
- 不要加「官網」「官方網站」「台灣」這類字，不要寫標語。

只回傳 JSON：{"brand":"…"}`;
  try {
    const parsed = parseJson<{ brand?: unknown }>(await askJson(prompt, apiKey, 100));
    const b = typeof parsed?.brand === 'string' ? parsed.brand.trim().slice(0, 30) : '';
    return b || hostnameOf(origin).split('.')[0];
  } catch {
    return hostnameOf(origin).split('.')[0];
  }
}

// 短關鍵字：一般人在 Google、ChatGPT 打的「品項＋推薦」。要抓網站實際在賣的具體品項（凝露、慕斯、植牙），
// 不要大類（保養品、清潔用品）——11-11 實測 ChatGPT 問「私密保養品推薦」不推 Relove，問「私密清潔凝露推薦」排第一。
export async function generateKeywordQuestions(input: RecommendInput, apiKey: string, count = KEYWORD_COUNT): Promise<string[]> {
  const prompt = `下面是一個網站的資訊。請列出 ${count} 個台灣人在 Google 或 ChatGPT 找這類東西時會直接打的短關鍵字，格式是「品項＋推薦」。

【網站標題】${input.title || '（無）'}
【網站描述】${input.description || '（無）'}
【主標題】${input.h1.join('／') || '（無）'}
【首頁內文摘錄】
${input.leadParagraphs.slice(0, 3).join('\n') || '（無）'}
【首頁純文字開頭】
${input.preview.slice(0, 1200) || '（無）'}
${servicesBlock(input)}
規則：
- 品項要是這個網站實際在賣、在做的具體東西（看商品分類、商品名裡的品項字，例如「私密清潔凝露」「私密處清潔慕斯」「台北植牙」），不要大類（「保養品」「清潔用品」「服務」）。
- 用一般人會打的通稱：把商品名去掉品牌系列名、成分、功效字，只留「用途＋品項」。例如商品「胺基酸私密潔淨凝露」→「私密清潔凝露推薦」；「緊依偎私密修護精華」是系列名，不能用「緊依偎」。不要出現成分（胺基酸、益生菌、蛋白酵素…）。
- 主力品項優先：服務／產品頁列的、首頁放最前面的那幾種。
${SPREAD_SERVICES}
${PRODUCT_NOT_CONTENT}
- 不能有品牌名「${input.brandName}」或任何品牌名、型號；不要行銷形容詞。
- 每個 4 到 16 字，結尾是「推薦」（服務業可用「推薦」或「哪裡好」）。
- 這個網站是接案、客製、顧問、工作室這類「找人幫你做」的服務時，關鍵字要帶出「找人做」：用「接案」「代做」「顧問」「工作室」「外包」這類字（例如「n8n 接案推薦」「LINE 機器人開發外包推薦」「AI 自動化顧問推薦」），不要只寫「客服自動回覆推薦」「電商訂單自動化推薦」——那種問法 AI 推的是現成軟體（ERP、客服系統），不是同業。
- 不要重複同一個品項。

只回傳 JSON：{"keywords":["…","…"]}`;
  const parsed = parseJson<{ keywords?: unknown }>(await askJson(prompt, apiKey, 300));
  const brand = input.brandName.toLowerCase();
  return (Array.isArray(parsed?.keywords) ? parsed!.keywords : [])
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.replace(/[「」"']/g, '').trim())
    .filter((k) => k.length >= 4 && k.length <= 20 && (!brand || !k.toLowerCase().includes(brand)))
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, count);
}

// 每題再生一種「意思一樣、說法不同」的問法。一次便宜呼叫；失敗就只用原本的問法。
// 兩句最長的共同連續字數。換說法要真的換：11-11 小積木抓到「預算有限」→「預算不多」這種只換一兩個字的
function longestCommonRun(a: string, b: string): number {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}
const MAX_SHARED_RUN = 5; // 跟原句連續 6 字以上相同就算沒換
const PARAPHRASE_MODEL = 'openai/gpt-5.6-luna';

export async function paraphraseQuestions(questions: string[], brandName: string, apiKey: string): Promise<(string | null)[]> {
  if (questions.length === 0) return [];
  const prompt = `下面是幾個一般台灣消費者會拿去問 AI 的問題。請替每一題寫一個「意思一樣、但像另一個人問」的問法。

規則：
- 意思不能變：問的對象、條件（地區、族群、預算、需求）都要保留。
- 要真的換：
  1. 主要名詞換一種說法（例如「清潔品」→「洗劑」，「預算有限」→「錢不多」，「平價」→「便宜」）
  2. 句型換掉（「有沒有推薦的…」→「…哪個牌子好」；「我是學生…有推薦嗎」→「學生黨…用哪款」）
  3. 跟原句不能有連續 6 個字一樣
- 不能出現「${brandName}」或任何能指向特定品牌的字。
- 台灣口語，10 到 40 字。

例（別的領域，只示範換法）：
原：我是上班族，預算有限，想找台北好的植牙診所，有推薦嗎？
換：小資族在台北要做植牙，哪間診所便宜又不會踩雷？

${questions.map((q, i) => `[${i}] ${q}`).join('\n')}

只回傳 JSON：{"alts":["…","…"]}，順序跟上面一樣。`;
  const brand = brandName.toLowerCase();
  const ok = (q: string, a: string) =>
    a.length >= 8 && a.length <= 80 && a !== q && !(brand && a.toLowerCase().includes(brand)) && longestCommonRun(q, a) <= MAX_SHARED_RUN;
  const once = async (): Promise<(string | null)[]> => {
    // gpt-4.1-mini 換說法只會換一兩個字（11-11 實測連「不能有連續 6 字相同」都做不到），用推理模型寫
    const parsed = parseJson<{ alts?: unknown }>(await askJson(prompt, apiKey, 4000, PARAPHRASE_MODEL));
    const alts = Array.isArray(parsed?.alts) ? parsed!.alts : [];
    return questions.map((q, i) => {
      const a = typeof alts[i] === 'string' ? (alts[i] as string).trim() : '';
      return ok(q, a) ? a : null;
    });
  };
  try {
    // 沒換夠的再重寫一次（temperature 0.3，第二次會不一樣）；還是不夠就這題只問原問法
    const first = await once();
    if (first.every((a) => a !== null)) return first;
    const second = await once().catch(() => questions.map(() => null));
    return first.map((a, i) => a ?? second[i]);
  } catch {
    return questions.map(() => null);
  }
}

// 從回答文字抽「被具體點名推薦的名字」。引用來源的網域彙總（geo-cited-domains.ts）
// 是客觀的，但 youtube.com、vocus.cc 這種平台網域看不出 AI 到底推了誰——
// 回答正文裡寫的「AI 說人話」「雷蒙」才是客戶會記得的名字，這一步就是抓那個。
// 主觀判斷，所以畫面上要保留回答原文讓人核對。
function buildNamePrompt(answers: { engine: string; question: string; answer: string }[], brandName: string, domain: string, about: string): string {
  const blocks = answers
    .map((a, i) => `[${i}] 引擎：${a.engine}\n問題：${a.question}\n回答：\n${a.answer}`)
    .join('\n\n---\n\n');
  return `我們在幫「${brandName}」（${domain}）做檢測：拿推薦類問題去問 AI，看 AI 推了誰。下面是幾個 AI 搜尋引擎的回答。請從每個回答裡，抽出「被具體推薦或點名的對象」，並標出它是哪一種。
${about ? `\n${brandName} 的官網這樣介紹自己（用來判斷誰跟它是同一類）：\n${about}\n` : ''}
兩種類型：
- "brand"：跟「${brandName}」賣同一類東西、提供同一類服務，客人會「選它而不選 ${brandName}」的對手。可能是品牌、商品的牌子、公司、工作室、診所、顧問、講師、課程、YouTube 頻道——但前提是它跟 ${brandName} 做的是同一件事。
- "channel"：不是對手的其他對象。賣的東西型態不同也算 channel：${brandName} 是接案／客製服務、顧問、工作室時，賣現成軟體或系統的公司（ERP、客服系統、電商開店平台、SaaS）是客人可能另外買的工具，不是對手；反過來 ${brandName} 是賣現成軟體的，接案工作室也不是它的對手。例如：電商平台（蝦皮、momo、PChome）、連鎖通路或藥妝店（屈臣氏、康是美、寶雅）、百貨、評論或比價網站（@cosme、mybest）、媒體、論壇、社群平台、接案平台，以及被當成「可以去問」的醫師、專家、網紅（除非 ${brandName} 自己就是做這一行）。

規則：
- 絕對不要抽：軟體／工具／技術名稱（n8n、OpenAI、Claude、Zapier 這類）、成分或原料名、泛稱（「線上課程平台」「藥妝店」「官方文件」）、文章標題。
- 抽的是「誰」，不是「哪篇文章」：回答寫「TheAI學院的 n8n 完整教學」就抽「TheAI學院」；寫「【n8n 中文教學】從零打造…」這種標題，要抽發這篇的網站或作者，抽不出來就跳過。
- 同一個對象的不同寫法（「屈臣氏 Watsons」「屈臣氏台灣（Watsons）Blog」）只算一個，用最短、最常見的那個名字。
- 名字照回答裡的寫法，不要翻譯；同一回答重複出現只列一次。
- 分不清時，看客人會不會「選它而不選 ${brandName}」：會就是 brand，不會就是 channel。要找人幫忙客製的客人，不會拿現成軟體跟接案者二選一。
- 沒有具體點名就給空陣列。

${blocks}

只回傳 JSON：{"answers":[{"index":0,"names":[{"name":"…","type":"brand"},{"name":"…","type":"channel"}]},{"index":1,"names":[]}]}`;
}

// 同一個對象常被不同回答寫成不同長度的名字（「AIJOB」vs「AIJOB 企業 AI 導入顧問」、
// 「智賦 AI 科技」vs「智賦 AI 科技的企業流程自動化顧問」）。分成兩列會讓名單看起來
// 又長又重複，而且次數被拆開，等於低估了真正常被推的那幾家。這裡把「短的是長的
// 子字串」視為同一個對象，保留較短的寫法當代表。
function normalizeForMerge(name: string): string {
  return name.toLowerCase().replace(/[\s·・、,，.。（）()【】「」《》:：\-—–_]/g, '');
}

// 中英並列的品牌，不同批次會寫成不同順序（「婦潔 (VIGILL)」「VIGILL 婦潔」、「施巴 SEBAMED」「Sebamed 施巴」）
// 或多帶一段系列名（「HH」「HH 草本新淨界」），子字串比對抓不到。拆成中文段＋英文字，
// 短名的每一段都出現在長名裡就算同一個。
function nameTokens(name: string): string[] {
  return (name.toLowerCase().match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) ?? []).filter(Boolean);
}
function tokenSubset(short: string, long: string): boolean {
  const a = nameTokens(short);
  const b = new Set(nameTokens(long));
  return a.length > 0 && a.every((t) => b.has(t));
}

export async function extractRecommendedNames(
  answers: { engine: string; question: string; answer: string; citations: { url: string; isSelf: boolean }[] }[],
  brandName: string,
  domain: string,
  apiKey: string,
  about = '',
): Promise<RecommendedName[]> {
  if (answers.length === 0) return [];
  // 2026-11-10 每題加了第二種問法後一次是 15 份回答，整包丟給模型會把所有名字塞進 index 0
  // （Relove：40 個名字全部 count 1、answers [0]，排名變成照字母排，大牌跟小牌一樣 1 次）。
  // 改成每 5 份一批平行抽，index 再加回批次起點；某一批失敗只少那幾份，不會整份名單變空。
  // 11-17 aiqkangber：5 份一批時模型把編號對錯——Google 第 3 題的品牌（橙設、戰國策、PeakQi）被記到前一份 ChatGPT，
  // Google 那欄變成「—」，ChatGPT 那欄顯示的其實是 Google 的名單；長回答裡的表格、分隔線讓模型數錯塊。
  // 改成一份回答一次（平行），不用靠模型回對編號；多出來的成本是每份多送一次指示文字，gpt-4.1-mini 一次健檢多不到 US$0.01。
  const BATCH = 1;
  const batches: number[] = [];
  for (let s = 0; s < answers.length; s += BATCH) batches.push(s);
  const rows = (
    await Promise.all(
      batches.map(async (start) => {
        try {
          const raw = await askJson(buildNamePrompt(answers.slice(start, start + BATCH), brandName, domain, about), apiKey, 1600);
          const parsed = parseJson<{ answers?: { index?: number; names?: unknown }[] }>(raw);
          const got = Array.isArray(parsed?.answers) ? parsed!.answers : [];
          // 一批只有一份：模型回什麼 index 都算這一份（它偶爾回 1），名字全收
          return got.map((r) => ({ ...r, index: start }));
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  // 先逐筆收集，count 用「出現在哪幾個回答」的集合大小算，不是出現次數累加——
  // 合併同義名稱時才不會把同一個回答裡的兩種寫法算成兩次。
  type Entry = { name: string; norm: string; answers: Set<number>; engines: Set<string>; isSelf: boolean; kind: 'brand' | 'channel' };
  const entries: Entry[] = [];
  const byNorm = new Map<string, Entry>();
  const tokens = brandTokens(brandName);
  // 題目裡本來就在問的東西（n8n、Pinecone…）不是「被推薦的人」，模型再怎麼交代
  // 還是會抽出來，這裡用題目文字反過來擋掉；超過 24 字的多半是文章標題，也不要
  // （括號補充不算字數：「XX 工作室（某平台接案團隊）」先去掉括號，不然名字會被當成標題丟掉）。
  const questionText = answers.map((a) => a.question.toLowerCase()).join('\n');
  const MAX_NAME_CHARS = 24;
  for (const row of rows) {
    const idx = typeof row.index === 'number' ? row.index : -1;
    const engine = answers[idx]?.engine;
    if (!engine || !Array.isArray(row.names)) continue;
    for (const n of row.names) {
      // 新格式是 {name, type}；舊 prompt 回的是純字串，當成 brand
      const rawName = typeof n === 'string' ? n : typeof n?.name === 'string' ? n.name : null;
      if (rawName === null) continue;
      const kind: 'brand' | 'channel' = typeof n === 'object' && n?.type === 'channel' ? 'channel' : 'brand';
      let name = rawName.trim();
      if ([...name].length > MAX_NAME_CHARS) name = name.replace(/\s*[（(][^（()）]*[)）]\s*/g, ' ').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if ([...name].length > MAX_NAME_CHARS) continue;
      if (key.length >= 2 && questionText.includes(key)) continue;
      const norm = normalizeForMerge(name);
      if (!norm) continue;
      // 名字對不上品牌名時（站名「任嚴選」、AI 推的是它賣的「HH」），看那一行的引用標記
      // 有沒有指到你的網址——有就是在推你。
      const selfMarks = answers[idx].citations
        .map((c, i) => (c.isSelf ? `[${i + 1}]` : ''))
        .filter(Boolean);
      const lineWithName = answers[idx].answer.split('\n').find((l) => l.toLowerCase().includes(key)) ?? '';
      // 那一行已經點名你的時候，引用標記是給你的，不能算到同一行的別人頭上
      // （11-04 aiqkangber：「其中 Darrell TW、D2 Group、Q kangber 比較偏…[5][6][10]」，
      // Darrell TW 被當成你，推最多次的對手從名單上消失）
      const lineNamesSelf = tokens.some((t) => lineWithName.toLowerCase().includes(t));
      const isSelf =
        tokens.some((t) => key.includes(t) || (key.length >= 3 && t.includes(key))) ||
        isSameSite(hostnameOf(name.startsWith('http') ? name : `https://${name}`), domain) ||
        // 只有品牌才看引用標記：工具／平台（n8n、蝦皮）那一行引用你的頁，是 AI 拿你的文章當出處介紹那個工具，
        // 不是在推你（11-12 aiqkangber「n8n 自動化流程…台灣廠商範例[4]」，[4] 是你的服務頁，n8n 被當成你）
        (kind === 'brand' && !lineNamesSelf && selfMarks.some((m) => lineWithName.includes(m)));
      let entry = byNorm.get(norm);
      if (!entry) {
        entry = { name, norm, answers: new Set(), engines: new Set(), isSelf, kind };
        byNorm.set(norm, entry);
        entries.push(entry);
      }
      entry.answers.add(idx);
      entry.engines.add(engine);
      if (isSelf) entry.isSelf = true;
    }
  }

  // 合併：短名優先當代表，長名的回答／引擎併進去
  const sortedByLength = [...entries].sort((a, b) => a.norm.length - b.norm.length);
  const merged: Entry[] = [];
  for (const e of sortedByLength) {
    const host = merged.find((m) => (m.norm.length >= 3 && e.norm.includes(m.norm)) || tokenSubset(m.name, e.name));
    if (host) {
      for (const i of e.answers) host.answers.add(i);
      for (const g of e.engines) host.engines.add(g);
      if (e.isSelf) host.isSelf = true;
    } else {
      merged.push(e);
    }
  }

  return merged
    .map((e) => ({
      name: e.name,
      count: e.answers.size,
      engines: [...e.engines],
      isSelf: e.isSelf,
      kind: e.kind,
      answers: [...e.answers].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hant'));
}

// 三態，不是兩態：「引用清單有你」跟「答案裡推薦你」差很多，混在一起講會變成報喜不報憂。
// 卡片標題已經寫了燈號、下面也貼了實際問題跟回答，這裡不再把題目跟結論重講一遍
// （09-29 小積木：「下面不是有實際回答了嗎」）。只有🟡要補一句，因為光看標題看不出「查過你」是什麼意思。
function adviceFor(a: VisibilityAnswer, namedSelf: boolean): string {
  if (!namedSelf && a.citedSelf) return '你的網址在它的引用來源裡，但答案沒有推薦你。';
  return '';
}

// 回答正文有沒有真的推薦你。三種證據，任一成立就算：
// 1. 正文出現猜到的品牌名
// 2. 正文出現自家網域（AI 常直接把網址寫進正文）
// 3. 正文的引用標記 [n] 指到你的網址——這條最重要。品牌名是從 <title>／Organization
//    猜的，猜到的是「任嚴選線上購物」，但 AI 推的是它賣的「HH」；只比品牌名會把明明
//    推薦了你的回答判成「查過你但沒推薦」（2026-09-15 小積木用 beauty-win.com 抓到）。
//    Perplexity 的 [n] 對應引用清單第 n 筆，跟前端 renderInlineMarkdown 用同一套對法。
// 猜到的站名常常是一整串（「Relove私密及全身保養 官方網站」），AI 寫的只有「Relove」。
// 除了整串，也拿開頭的英文字跟第一段（空白／｜前）去比。太短的（<3 字）不算，
// 「HH」這種兩個字母會誤中一堆東西，那種靠下面的引用標記判。
export function brandTokens(brandName: string): string[] {
  const full = brandName.trim().toLowerCase();
  const out = new Set<string>();
  if (full.length >= 2) out.add(full);
  const latin = full.match(/^[a-z0-9][a-z0-9\-]{2,}/)?.[0];
  if (latin) out.add(latin);
  const head = full.split(/[\s|｜\-–—:：]/)[0]?.trim();
  // 中文兩個字就是完整品牌名（康寶、婦潔），英文兩個字母（HH）才會誤中一堆東西
  if (head && (head.length >= 3 || (head.length === 2 && /^[\u4e00-\u9fff]{2}$/.test(head)))) out.add(head);
  // 「康寶 Knorr」後面的英文名也要比
  for (const w of full.match(/[a-z][a-z0-9\-]{3,}/g) ?? []) out.add(w);
  return [...out];
}

export function mentionsSelf(
  answer: string,
  brandName: string,
  domain: string,
  citations: { url: string; isSelf: boolean }[],
): boolean {
  return namesSelfInText(answer, brandName, domain) || citedSelfMark(answer, citations);
}

// 正文有「[n]」指到你的網址。只代表 AI 拿你的頁當出處，那一行推的可能是別人（工具、平台），
// 所以抽完名字後要再對一次：那一份回答裡有被認成你的品牌名才算點名你。
function citedSelfMark(answer: string, citations: { url: string; isSelf: boolean }[]): boolean {
  return citations.some((c, i) => c.isSelf && new RegExp(`\\[${i + 1}\\]`).test(answer));
}

function namesSelfInText(answer: string, brandName: string, domain: string): boolean {
  const text = answer.toLowerCase();
  if (brandTokens(brandName).some((t) => text.includes(t))) return true;
  const root = domain.toLowerCase().replace(/^www\./, '');
  return root.length >= 4 && text.includes(root);
}

// 使用者自己改的題目：長度跟品牌名的規則跟 AI 生的題目一樣。含品牌名就變成「AI 認不認得你」，不是「推不推你」。
export function sanitizeCustomQuestions(raw: unknown[], brandName: string): string[] {
  const brand = brandName.toLowerCase();
  return raw
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim())
    .filter((q) => q.length >= 4 && q.length <= 80)
    // 用拆開的品牌字比：「康寶 Knorr」整串比不到「康寶雞粉推薦」
    .filter((q) => !brand || !brandTokens(brandName).some((t) => q.toLowerCase().includes(t)))
    .slice(0, MAX_PICKED_QUESTIONS);
}

// 拿使用者勾好的題目去問 AI。2026-11-11 起健檢不自動問：題目由使用者從候選題（網友問過的、AI 產生的）勾，
// 或自己寫，勾完才問。
export async function runRecommendVisibility(
  input: RecommendInput,
  origin: string,
  picked: PickedQuestion[],
): Promise<RecommendVisibility | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !input.brandName) return null;

  const questions = picked.map((p) => p.question);
  const byQuestion = new Map(picked.map((p) => [p.question, p]));
  if (questions.length === 0) return null;

  const askedAt = new Date().toISOString();
  const domain = hostnameOf(origin);
  // 2026-11-12 拿掉「換個說法」：使用者已經自己勾了 3 題，每題再多問一個換句版本等於花兩倍錢，
  // 小積木覺得沒用。只問勾的原句。（paraphraseQuestions 先留著不刪，舊紀錄的 altQuestion 畫面照常顯示）
  const ask = (q: string) => runVisibilityQueries(`${q} 請具體推薦幾個，並附上來源網址。`, origin, 900);
  const perQuestion = await Promise.all(
    questions.map(async (question) => {
      // Google 用原題直接搜（一般人就是這樣打進 Google 的），不加「請附來源網址」那串
      const [answers, google] = await Promise.all([ask(question), fetchGoogleAio(question, origin)]);
      const tagged = [
        ...(answers ?? []).map((a) => ({ a, q: question })),
        ...(google?.status === 'present' ? [{ a: google.answer, q: question }] : []),
      ];
      const results: RecommendAnswer[] = tagged.map(({ a, q }) => {
        const named = mentionsSelf(a.answer, input.brandName, domain, a.citations);
        return { ...a, query: q, namedSelf: named, advice: adviceFor(a, named) };
      });
      const p = byQuestion.get(question);
      const googleState: 'present' | 'absent' | 'failed' = google?.status ?? 'failed';
      return { question, ...(p?.source ? { source: p.source } : {}), origin: p?.origin ?? 'custom', google: googleState, results };
    }),
  );
  const questionsWithAnswers = perQuestion.filter((q) => q.results.length > 0);
  if (questionsWithAnswers.length === 0) return null;

  const flat = questionsWithAnswers.flatMap((q) =>
    q.results.map((r) => ({ engine: r.engine, question: r.query || q.question, answer: r.answer, citations: r.citations })),
  );
  let names: RecommendedName[] = [];
  try {
    // 告訴抽名字的模型這個站在賣什麼：11-12 aiqkangber（接案做自動化）問「電商訂單自動化推薦」，
    // 鼎新 A1、91APP、CYBERBIZ 這些賣現成系統的全被當成對手，競爭對手表看起來對手超強
    const about = [input.title, input.description, input.services?.slice(0, 400)].filter(Boolean).join('\n').slice(0, 700);
    names = await extractRecommendedNames(flat, input.brandName, domain, apiKey, about);
  } catch {
    names = []; // 抽名字失敗不影響前面的結果，畫面上還有引用網域可看
  }
  // 只靠引用標記算「點名你」的回答，用抽出來的名字再確認一次（抽名字失敗就維持原判斷）
  if (names.length > 0) {
    const selfAnswers = new Set(names.filter((n) => n.isSelf).flatMap((n) => n.answers));
    let i = 0;
    for (const q of questionsWithAnswers) {
      for (const r of q.results) {
        const idx = i++;
        if (r.namedSelf && !namesSelfInText(r.answer, input.brandName, domain) && !selfAnswers.has(idx)) {
          r.namedSelf = false;
          r.advice = adviceFor(r, false);
        }
      }
    }
  }

  return {
    brandName: input.brandName,
    questions: questionsWithAnswers,
    names,
    askedAt,
    totalAnswers: flat.length,
    citedSelfCount: questionsWithAnswers.reduce((n, q) => n + q.results.filter((r) => r.citedSelf).length, 0),
    namedSelfCount: questionsWithAnswers.reduce((n, q) => n + q.results.filter((r) => r.namedSelf).length, 0),
    customQuestions: picked.some((p) => p.origin === 'custom'),
  };
}
