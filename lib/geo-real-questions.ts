// ── 推薦題改用網友真的問過的問題 ──────────────────────────────
// 2026-11-10 原本推薦題是 AI 讀首頁「猜」台灣人會怎麼問；市面上的 prompt 研究工具（Profound、Semrush）
// 只有英文市場有真人問法資料，台灣中文拿不到。改用 stacktools「真實問題」的做法：
// 需求詞 → Google 搜 Dcard／PTT／Threads／Mobile01／BabyHome／FB 社團 → 只留標題是問句、不是業配的貼文
// → 留下所有「在找推薦」的貼文，整理成問 AI 的句子（盡量照原話）列給使用者勾，題目旁附原文連結。
// 2026-11-11 起不再自動挑 3 題去問：使用者從這份清單＋AI 產生的題目裡勾（小積木：要看得到網友問過哪些）。
// 只知道「有人這樣問過」，不知道「多少人這樣問」，畫面上不能講成需求量。
// 成本：需求詞 1 次 + Serper 約 30 次（每千次約 US$1）+ 整理 1 次。任何一步失敗或抓不到就回 []，畫面上只剩 AI 產生的題目。

import { askJson, generateKeywordQuestions, generateRecommendQuestions, parseJson, PRODUCT_NOT_CONTENT, servicesBlock, SPREAD_SERVICES, type RecommendCandidates, type RecommendInput } from './geo-recommend-visibility';
import { paidFetch } from './paid-fetch';

// 論壇題最多列幾則（太多使用者也看不完）
const MAX_FORUM_QUESTIONS = 15;

const FORUMS: Record<string, string> = {
  Dcard: 'dcard.tw',
  PTT: 'ptt.cc',
  Threads: 'threads.com',
  Mobile01: 'mobile01.com',
  BabyHome: 'babyhome.com.tw',
  FB: 'facebook.com/groups',
};
const ASK = /[?？]|嗎|請問|求|怎麼|如何|為什麼|哪|推薦|有人|詢問|請益|請教|想問|挑選|\[問題\]/;
// 業配／整理文：評比、N大、標題裡有「｜」分隔的多半是部落客或媒體文章，不是網友在問
const AD = /推薦系列|開箱|現在訂|限時|優惠|折扣|下單|代購|囤起來|必買|懶人包|評比|\d+\s*大|[｜|]|必讀|總整理|全攻略|https?:\/\/|👉|🛒|#[^#\s]+[^#]*#[^#\s]+/;
// 最後三種：FB 社團的業配貼文常帶短網址、指向箭頭、購物車符號，或一串 hashtag（11-11 Relove：「花美水推薦👉 https://…」「#女性健康#私密护理#韩国」）
// 「… - 美妝板」「… - 看板BeautySalon - 批踢踢實業坊」「… - BabyHome親子討論區」這種站名尾巴
function cleanTitle(t: string): string {
  return t.replace(/\s*-\s*(看板\S+|\S{1,8}板|批踢踢實業坊|BabyHome\S*|Dcard|Mobile01|Threads|Facebook)(\s+-\s+.*)?$/i, '').replace(/\s*\.\.\.$|\s*…$/, '').trim();
}

export interface RealQuestionSource {
  site: string; // Dcard、PTT…
  title: string; // 網友原本的標題
  link: string;
}

interface Post extends RealQuestionSource {
  keyword: string;
}

function mentions(text: string, keyword: string): boolean {
  const parts = keyword.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.every((k) => mentions(text, k));
  if (!/^[\x00-\x7f]+$/.test(keyword)) return text.includes(keyword);
  const k = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${k}($|[^a-z0-9])`, 'i').test(text);
}

// Serper 每秒最多 5 次，排隊每 250ms 放一個
let serperNext = 0;
async function serper(q: string, key: string) {
  const wait = Math.max(0, serperNext - Date.now());
  serperNext = Date.now() + wait + 250;
  await new Promise((r) => setTimeout(r, wait));
  const res = await paidFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'tw', hl: 'zh-tw' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  return (await res.json()) as { organic?: { title: string; link: string }[] };
}

// 1. 潛在客戶帶著的需求詞（「私密處 清潔」「n8n 自動化」）
export async function findNeeds(input: RecommendInput, apiKey: string): Promise<string[]> {
  const prompt = `下面是一個網站的資訊。請想：還不認識這個網站的台灣網友，會帶著什麼「需求」去 Dcard、PTT 發問，而這個網站剛好在賣或在做？

【網站標題】${input.title || '（無）'}
【網站描述】${input.description || '（無）'}
【主標題】${input.h1.join('／') || '（無）'}
【首頁內文】
${input.leadParagraphs.slice(0, 3).join('\n')}
${input.preview.slice(0, 800)}
${servicesBlock(input)}
規則：
- 每個需求寫成兩段，中間空一格，例如女鞋品牌→「大尺碼 女鞋」「久站 女鞋」；牙醫→「台北 植牙」「植牙 費用」
- 每段 2～3 個字，是網友發問標題裡真的會出現的口語字（「私密處 異味」「私密 清潔」，不要「私密保養 產品」「護理用品」這種商品分類用語）；不能有品牌名「${input.brandName}」，不要行銷形容詞
- 每個詞都要有一段點出這個網站的領域（寫「寵物 除臭」，不能只寫「除臭 噴霧」）
${SPREAD_SERVICES}
${PRODUCT_NOT_CONTENT}
- 最多 5 個

只回傳 JSON：{"needs":["…","…"]}`;
  const parsed = parseJson<{ needs?: unknown }>(await askJson(prompt, apiKey, 300));
  const brand = input.brandName.toLowerCase();
  return (Array.isArray(parsed?.needs) ? parsed!.needs : [])
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.replace(/[「」『』"']/g, '').trim().split(/\s+/).slice(0, 2).join(' '))
    .filter((k) => k && (!brand || !k.toLowerCase().includes(brand)))
    .slice(0, 5);
}

// 2. 論壇裡標題是問句、有提到需求詞、不像業配的貼文
// failed：Serper 呼叫失敗的次數（額度用完、逾時）。全部失敗時不能說成「論壇上沒人問」
export async function forumPosts(keyword: string, key: string): Promise<{ posts: Post[]; failed: number; total: number }> {
  let failed = 0;
  const lists = await Promise.all(
    Object.entries(FORUMS).map(async ([site, domain]) => {
      try {
        const data = await serper(`${keyword} site:${domain}`, key);
        return (data.organic ?? [])
          .filter((o) => { const t = cleanTitle(o.title); // 兩段都出現最準；冷門品類常只寫領域那段（「私密處清潔推薦」不會寫「用品」），退一步只要第一段
            const head = keyword.split(/\s+/)[0];
            return ASK.test(t) && !AD.test(t) && (mentions(t, keyword) || (head.length >= 2 && mentions(t, head))); })
          .filter((o) => site !== 'FB' || o.link.includes('/groups/'))
          .map((o) => ({ site, keyword, title: cleanTitle(o.title), link: o.link }));
      } catch {
        failed += 1;
        return [];
      }
    }),
  );
  return { posts: lists.flat(), failed, total: Object.keys(FORUMS).length };
}

// 3. 留下「在找推薦」的貼文，整理成問 AI 的句子（盡量保留網友原話）
export async function pickQuestions(input: RecommendInput, posts: Post[], count: number, apiKey: string): Promise<{ question: string; source: RealQuestionSource }[]> {
  const list = posts.slice(0, 60);
  const prompt = `下面是台灣網友在論壇發問的標題。我們要拿這些問題去問 AI，看 AI 會推薦哪些品牌或服務。請挑出所有符合下面條件的（最多 ${count} 則）：

- 必須是在找推薦、問哪個好、問哪裡買／找誰做的（AI 回答時會列出一串品牌、店家、服務或人名）。只問做法、症狀、心得分享的不要。
- 跟這個網站賣的東西有關，而且發問的人是這個網站的客群（女性品牌就不要挑男生在問的、寵物用品就不要挑問人用的）：${input.title}｜${input.description.slice(0, 160)}
- 網友要找的東西型態要跟這個網站一樣：網站是接案、客製、顧問、工作室這類「找人幫你做」的服務時，問「哪套 ERP／系統／軟體推薦」的不要挑（網友要買現成軟體，AI 會推軟體公司，不是同業）；反過來網站賣現成商品，找人代工、接案的也不要。（11-12 aiqkangber 挑到 8 則有 7 則在問 ERP、進銷存）
- 不能提到「${input.brandName}」。
- 每則改寫成可以直接問 AI 的一句話：盡量保留網友原本的用字，只拿掉論壇標記（[問題]、#請益、板名）和無關的贅字，15 到 50 字。
- 意思幾乎一樣的只留一則（例如「私密處清潔推薦」跟「私密清潔有推薦的嗎」）。
- 照符合程度排序，最像這個網站客群在找推薦的放前面。

${list.map((p, i) => `[${i}] ${p.site}：${p.title}`).join('\n')}

只回傳 JSON：{"picks":[{"index":0,"question":"…"}]}`;
  const parsed = parseJson<{ picks?: unknown }>(await askJson(prompt, apiKey, 1500));
  const brand = input.brandName.toLowerCase();
  const out: { question: string; source: RealQuestionSource }[] = [];
  for (const p of (Array.isArray(parsed?.picks) ? parsed!.picks : []) as { index?: unknown; question?: unknown }[]) {
    const i = typeof p.index === 'number' ? p.index : -1;
    const q = typeof p.question === 'string' ? p.question.trim() : '';
    if (!list[i] || q.length < 8 || q.length > 80 || (brand && q.toLowerCase().includes(brand))) continue;
    if (out.some((o) => o.source.link === list[i].link || o.question === q)) continue;
    out.push({ question: q, source: { site: list[i].site, title: list[i].title, link: list[i].link } });
  }
  return out.slice(0, count);
}

// 2026-11-12 原沐製材所：Serper 額度用完（餘額 -4），每次搜尋都失敗，畫面卻寫「論壇上找不到網友問過的問題」——
// 查不了跟沒人問是兩回事，要分開（同 WAF 假綠燈那次的教訓）。status：ok＝有搜到結果（可能 0 則）、failed＝搜尋本身壞了
export async function listForumQuestions(
  input: RecommendInput,
  apiKey: string,
  count = MAX_FORUM_QUESTIONS,
): Promise<{ questions: { question: string; source: RealQuestionSource }[]; status: 'ok' | 'failed' }> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { questions: [], status: 'failed' };
  try {
    const needs = await findNeeds(input, apiKey);
    if (process.env.DEBUG_REALQ) console.log('[realq] needs', needs);
    if (needs.length === 0) return { questions: [], status: 'ok' };
    const results = await Promise.all(needs.map((k) => forumPosts(k, key)));
    const failed = results.reduce((n, r) => n + r.failed, 0);
    const total = results.reduce((n, r) => n + r.total, 0);
    const seen = new Set<string>();
    const posts = results.flatMap((r) => r.posts).filter((p) => (seen.has(p.link) ? false : (seen.add(p.link), true)));
    if (process.env.DEBUG_REALQ) console.log('[realq] posts', posts.length, 'failed', failed, '/', total);
    if (posts.length === 0) return { questions: [], status: total > 0 && failed === total ? 'failed' : 'ok' };
    return { questions: await pickQuestions(input, posts, count, apiKey), status: 'ok' };
  } catch (e) {
    if (process.env.DEBUG_REALQ) console.log('[realq] error', e);
    return { questions: [], status: 'failed' };
  }
}

// 健檢時準備候選題：先找網友問過的（只列出來給人看），AI 再參考這些問題＋首頁產生 10 題長句，另抓 5 個短關鍵字，都給人勾。
// 網友一題都沒找到時 AI 只看首頁。AI 那步失敗就回 null（報告不顯示推薦題這塊）
export async function buildRecommendCandidates(input: RecommendInput, apiKey: string): Promise<RecommendCandidates | null> {
  // 短關鍵字只看首頁，跟找網友問題同時跑
  const [forumResult, keywords] = await Promise.all([
    listForumQuestions(input, apiKey),
    generateKeywordQuestions(input, apiKey).catch(() => [] as string[]),
  ]);
  const forum = forumResult.questions;
  const ai = await generateRecommendQuestions(input, apiKey, undefined, forum.map((f) => f.source.title)).catch(() => [] as string[]);
  if (ai.length === 0 && keywords.length === 0) return null;
  return { forum, ...(forumResult.status === 'failed' ? { forumFailed: true } : {}), ai, keywords, input };
}
