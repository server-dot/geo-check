import { runVisibilityQueries, hostnameOf, isSameSite, type VisibilityAnswer } from './geo-brand-visibility';

// ── GEO：推薦題自動查詢 ──────────────────────────────────
// 品牌能見度（geo-brand-visibility.ts）問的是「AI 認不認得你」；關鍵字能見度
// （geo-keyword-visibility.ts）問的是「這個主題底下 AI 推不推你」，但要使用者自己
// 點關鍵字才會跑——實際上大多數人不會點，報告就停在「AI 認得你」，看不到最關鍵
// 的那一頁：客戶問「有沒有推薦的 XX」時，AI 推的是誰、有沒有你。
//
// 這裡把那一步自動化：先叫一個便宜模型讀首頁內容，猜 3 個「一般人會拿去問 AI 的
// 推薦題」，再拿去問即時搜尋引擎，最後從回答裡把「被點名推薦的名字」抽出來彙總。
// 題目是猜的，不是真實需求量——這點要在畫面上講清楚，不能包裝成「客戶都這樣問」。
//
// 成本：每次健檢多 1 次生題 + 3 題 × 2 引擎 + 1 次抽名字，全部走 OpenRouter。
// 沒設 API key 或任一步失敗時回 null，健檢照常完成，不因為這段掛掉整份報告。

export interface RecommendQuestionResult {
  question: string;
  results: RecommendAnswer[];
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
}

export interface RecommendVisibility {
  brandName: string;
  questions: RecommendQuestionResult[];
  names: RecommendedName[];
  askedAt: string;    // ISO 時間，畫面上要標「這是幾點問的」——AI 回答會隨時間變
  totalAnswers: number;
  citedSelfCount: number;  // 引用清單裡出現你的網址的次數（寬鬆）
  namedSelfCount: number;  // 回答正文真的點名你的次數（嚴格，畫面上的標題用這個）
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
}

const MODEL = 'openai/gpt-4.1-mini';
const QUESTION_COUNT = 3;

async function askJson(prompt: string, apiKey: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://geo-check.app',
      'X-Title': 'GEO Check Recommend Query',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤（${MODEL}）：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function parseJson<T>(text: string): T | null {
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
function buildQuestionPrompt(input: RecommendInput): string {
  const lead = input.leadParagraphs.slice(0, 3).join('\n');
  return `下面是一個網站的資訊。請站在「還不認識這個網站的一般台灣消費者」的角度，寫出 ${QUESTION_COUNT} 個他們在找這類服務或資源時，會拿去問 ChatGPT 的問題。

【網站標題】${input.title || '（無）'}
【網站描述】${input.description || '（無）'}
【主標題】${input.h1.join('／') || '（無）'}
【首頁內文摘錄】
${lead || '（無）'}
【首頁純文字開頭】
${input.preview.slice(0, 800) || '（無）'}

規則：
- 問題裡絕對不可以出現這個品牌的名稱「${input.brandName}」、網址，或任何能指向這個網站的字眼。要問的是「這一類」，不是「這一家」。
- 每一題都必須是在找「人、公司、網站、頻道、課程或服務」——也就是 AI 回答時會列出一串名字的那種問題。不要問技術怎麼做、工具怎麼選（例如「A 跟 B 該怎麼選」「怎麼設定 X」），那種題目 AI 只會講方法，不會推薦任何人。
- 用台灣人的口語，像真的在跟 AI 聊天，每題 15 到 40 字。
- 三題題型要不同：
  1. 推薦型：「有沒有推薦的…（網站／老師／公司）」
  2. 選擇型：「台灣哪幾家／哪些人做…比較好」「找…要怎麼挑」
  3. 情境型：「我是…（一個具體身分或處境），想…，可以找誰或看哪裡」
- 主題要貼著這個網站實際在賣、在做的東西（看內文與商品分類，不要只看標題），不要泛到「AI 工具推薦」「線上購物平台」這種太大的題。

只回傳 JSON：{"questions":["問題一","問題二","問題三"]}`;
}

export async function generateRecommendQuestions(input: RecommendInput, apiKey: string): Promise<string[]> {
  const raw = await askJson(buildQuestionPrompt(input), apiKey, 400);
  const parsed = parseJson<{ questions?: unknown }>(raw);
  const list = Array.isArray(parsed?.questions) ? parsed!.questions : [];
  const brand = input.brandName.toLowerCase();
  return list
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim())
    .filter((q) => q.length >= 8 && q.length <= 80)
    // 模型偶爾還是會把品牌名塞進去，塞了就丟掉這題，不要拿去問
    .filter((q) => !brand || !q.toLowerCase().includes(brand))
    .slice(0, QUESTION_COUNT);
}

// 從回答文字抽「被具體點名推薦的名字」。引用來源的網域彙總（geo-cited-domains.ts）
// 是客觀的，但 youtube.com、vocus.cc 這種平台網域看不出 AI 到底推了誰——
// 回答正文裡寫的「AI 說人話」「雷蒙」才是客戶會記得的名字，這一步就是抓那個。
// 主觀判斷，所以畫面上要保留回答原文讓人核對。
function buildNamePrompt(answers: { engine: string; question: string; answer: string }[]): string {
  const blocks = answers
    .map((a, i) => `[${i}] 引擎：${a.engine}\n問題：${a.question}\n回答：\n${a.answer.slice(0, 2500)}`)
    .join('\n\n---\n\n');
  return `下面是幾個 AI 搜尋引擎對「推薦類問題」的回答。請從每個回答裡，抽出「被具體推薦或點名的品牌、公司、網站、頻道、課程或人名」。

規則：
- 只抽「可以去找它買服務、上課、看教學」的對象：公司、工作室、顧問、講師、網站、YouTube 頻道、部落格、課程平台。這些是在跟提問者搶生意的人。
- 絕對不要抽：軟體／工具／技術名稱（n8n、OpenAI、Claude、Pinecone、RAG、Zapier 這類）、泛稱（「線上課程平台」「官方文件」）、文章標題、新聞媒體。
- 抽的是「誰」，不是「哪篇文章」：回答寫「TheAI學院的 n8n 完整教學」就抽「TheAI學院」；寫「【n8n 中文教學】從零打造…」這種標題，要抽發這篇的網站或作者，抽不出來就跳過。
- 名字照回答裡的寫法，不要翻譯、不要改寫；同一回答重複出現只列一次。
- 沒有具體點名就給空陣列。

${blocks}

只回傳 JSON：{"answers":[{"index":0,"names":["…"]},{"index":1,"names":[]}]}`;
}

// 同一個對象常被不同回答寫成不同長度的名字（「AIJOB」vs「AIJOB 企業 AI 導入顧問」、
// 「智賦 AI 科技」vs「智賦 AI 科技的企業流程自動化顧問」）。分成兩列會讓名單看起來
// 又長又重複，而且次數被拆開，等於低估了真正常被推的那幾家。這裡把「短的是長的
// 子字串」視為同一個對象，保留較短的寫法當代表。
function normalizeForMerge(name: string): string {
  return name.toLowerCase().replace(/[\s·・、,，.。（）()【】「」《》:：\-—–_]/g, '');
}

export async function extractRecommendedNames(
  answers: { engine: string; question: string; answer: string; citations: { url: string; isSelf: boolean }[] }[],
  brandName: string,
  domain: string,
  apiKey: string,
): Promise<RecommendedName[]> {
  if (answers.length === 0) return [];
  const raw = await askJson(buildNamePrompt(answers), apiKey, 800);
  const parsed = parseJson<{ answers?: { index?: number; names?: unknown }[] }>(raw);
  const rows = Array.isArray(parsed?.answers) ? parsed!.answers : [];

  // 先逐筆收集，count 用「出現在哪幾個回答」的集合大小算，不是出現次數累加——
  // 合併同義名稱時才不會把同一個回答裡的兩種寫法算成兩次。
  type Entry = { name: string; norm: string; answers: Set<number>; engines: Set<string>; isSelf: boolean };
  const entries: Entry[] = [];
  const byNorm = new Map<string, Entry>();
  const tokens = brandTokens(brandName);
  // 題目裡本來就在問的東西（n8n、Pinecone…）不是「被推薦的人」，模型再怎麼交代
  // 還是會抽出來，這裡用題目文字反過來擋掉；超過 24 字的多半是文章標題，也不要。
  const questionText = answers.map((a) => a.question.toLowerCase()).join('\n');
  const MAX_NAME_CHARS = 24;
  for (const row of rows) {
    const idx = typeof row.index === 'number' ? row.index : -1;
    const engine = answers[idx]?.engine;
    if (!engine || !Array.isArray(row.names)) continue;
    for (const n of row.names) {
      if (typeof n !== 'string') continue;
      const name = n.trim();
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
      const isSelf =
        tokens.some((t) => key.includes(t) || (key.length >= 3 && t.includes(key))) ||
        isSameSite(hostnameOf(name.startsWith('http') ? name : `https://${name}`), domain) ||
        selfMarks.some((m) => lineWithName.includes(m));
      let entry = byNorm.get(norm);
      if (!entry) {
        entry = { name, norm, answers: new Set(), engines: new Set(), isSelf };
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
    const host = merged.find((m) => m.norm.length >= 3 && e.norm.includes(m.norm));
    if (host) {
      for (const i of e.answers) host.answers.add(i);
      for (const g of e.engines) host.engines.add(g);
      if (e.isSelf) host.isSelf = true;
    } else {
      merged.push(e);
    }
  }

  return merged
    .map((e) => ({ name: e.name, count: e.answers.size, engines: [...e.engines], isSelf: e.isSelf }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hant'));
}

// 三態，不是兩態：「引用清單有你」跟「答案裡推薦你」差很多，混在一起講會變成報喜不報憂。
function adviceFor(a: VisibilityAnswer, question: string, namedSelf: boolean): string {
  if (namedSelf) return `${a.engine} 在回答「${question}」時直接把你寫進答案裡——這題你進得了 AI 的推薦名單。`;
  if (a.citedSelf)
    return `${a.engine} 查過你的網站（你的網址出現在它的引用清單裡），但回答「${question}」時沒有把你寫進推薦名單——它讀到了你，只是沒拿你當答案。`;
  return `${a.engine} 回答「${question}」時沒有引用也沒有提到你——這題 AI 推的是別人。`;
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
  if (head && head.length >= 3) out.add(head);
  return [...out];
}

function mentionsSelf(
  answer: string,
  brandName: string,
  domain: string,
  citations: { url: string; isSelf: boolean }[],
): boolean {
  const text = answer.toLowerCase();
  if (brandTokens(brandName).some((t) => text.includes(t))) return true;
  const root = domain.toLowerCase().replace(/^www\./, '');
  if (root.length >= 4 && text.includes(root)) return true;
  return citations.some((c, i) => c.isSelf && new RegExp(`\\[${i + 1}\\]`).test(answer));
}

export async function runRecommendVisibility(input: RecommendInput, origin: string): Promise<RecommendVisibility | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !input.brandName) return null;

  let questions: string[];
  try {
    questions = await generateRecommendQuestions(input, apiKey);
  } catch {
    return null;
  }
  if (questions.length === 0) return null;

  const askedAt = new Date().toISOString();
  const domain = hostnameOf(origin);
  const perQuestion = await Promise.all(
    questions.map(async (question) => {
      const answers = await runVisibilityQueries(`${question} 請具體推薦幾個，並附上來源網址。`, origin, 900);
      const results: RecommendAnswer[] = (answers ?? []).map((a) => {
        const named = mentionsSelf(a.answer, input.brandName, domain, a.citations);
        return { ...a, query: question, namedSelf: named, advice: adviceFor(a, question, named) };
      });
      return { question, results };
    }),
  );
  const questionsWithAnswers = perQuestion.filter((q) => q.results.length > 0);
  if (questionsWithAnswers.length === 0) return null;

  const flat = questionsWithAnswers.flatMap((q) =>
    q.results.map((r) => ({ engine: r.engine, question: q.question, answer: r.answer, citations: r.citations })),
  );
  let names: RecommendedName[] = [];
  try {
    names = await extractRecommendedNames(flat, input.brandName, domain, apiKey);
  } catch {
    names = []; // 抽名字失敗不影響前面的結果，畫面上還有引用網域可看
  }

  return {
    brandName: input.brandName,
    questions: questionsWithAnswers,
    names,
    askedAt,
    totalAnswers: flat.length,
    citedSelfCount: questionsWithAnswers.reduce((n, q) => n + q.results.filter((r) => r.citedSelf).length, 0),
    namedSelfCount: questionsWithAnswers.reduce((n, q) => n + q.results.filter((r) => r.namedSelf).length, 0),
  };
}
