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
export async function serper(q: string, key: string, page = 1) {
  const wait = Math.max(0, serperNext - Date.now());
  serperNext = Date.now() + wait + 250;
  await new Promise((r) => setTimeout(r, wait));
  const res = await paidFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'tw', hl: 'zh-tw', ...(page > 1 ? { page } : {}) }),
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
  const r = await forumSearch(keyword, key);
  return { ...r, posts: r.posts.filter(asksForNeed) };
}
// 兩段都出現最準；冷門品類常只寫領域那段（「私密處清潔推薦」不會寫「用品」），退一步只要第一段
function asksForNeed(p: Post): boolean {
  const head = p.keyword.split(/\s+/)[0];
  return ASK.test(p.title) && !AD.test(p.title) && (mentions(p.title, p.keyword) || (head.length >= 2 && mentions(p.title, head)));
}

// 六個論壇搜到的原始貼文，還沒篩
async function forumSearch(keyword: string, key: string, page = 1, only = ''): Promise<{ posts: Post[]; failed: number; total: number }> {
  let failed = 0;
  const lists = await Promise.all(
    Object.entries(FORUMS).filter(([site]) => !only || site === only).map(async ([site, domain]) => {
      try {
        const data = await serper(`${keyword} site:${domain}`, key, page);
        return (data.organic ?? []).filter((o) => site !== 'FB' || o.link.includes('/groups/')).map((o) => ({ site, keyword, title: cleanTitle(o.title), link: o.link }));
      } catch {
        failed += 1;
        return [];
      }
    }),
  );
  return { posts: lists.flat(), failed, total: Object.keys(FORUMS).length };
}

// ── 「網友相關問題」那頁的清單（11-25 小積木：真的相關的都要列，有幾則列幾則，不設目標數也不設上限）──────────────
// 原本借用挑題目的清單，只留「在找推薦」的，290 篇只剩 10 則。這份留所有相關的發問（症狀、用法、價格、經驗），只用規則、不叫 AI
// 標題沒問號但在問的：「問私密處異味怎解」「關於男性私密處清潔」
const ASK_LOOSE = /怎|^#?問|^關於|困擾|大家|想知道|該不該|要不要|會不會|有沒有|是不是|好不好|用什麼|什麼牌/;
// 一個搜尋的第一頁有這麼多則相關，後面多半還有，就往下翻；最多翻到第 3 頁
const DIG_IF = 4;
const MAX_PAGE = 3;
// 媒體衛教、講座、業者口吻：不是網友在問
const NOT_ASKING = /醫[：:師生教曝揭]|婦產科|營養師|專家|盤點|\d+\s*[招種]|講座|影片更新|直播|小編|教你|避免？|揭密|詢問「|上線啦|大推|^\[?(公告|新聞|情報|廣告|分享)/;
const COMMON = /^(推薦|價格|費用|多少|哪裡|哪家|怎麼|如何|方法|問題|用品|產品|服務|公司|清潔|保養|設計|系統|工具|女性|男性|台灣|台北|台中|高雄)$/;

// 這個網站的主題字：至少兩個需求詞都有的兩個字（私密）；太通用的字不算
function topicStems(needs: string[]): string[] {
  const n = new Map<string, number>();
  for (const k of needs) {
    const set = new Set<string>();
    for (const part of k.split(/\s+/)) {
      if (/^[\x00-\x7f]+$/.test(part)) set.add(part.toLowerCase());
      else for (let i = 0; i + 2 <= part.length; i++) set.add(part.slice(i, i + 2));
    }
    for (const x of set) n.set(x, (n.get(x) ?? 0) + 1);
  }
  return [...n].filter(([x, c]) => c >= 2 && !COMMON.test(x)).map(([x]) => x);
}

export function relatedPosts(posts: Post[], needs: string[], brand: string): RealQuestionSource[] {
  const stems = topicStems(needs);
  const b = brand.trim().toLowerCase();
  const seen = new Set<string>();
  const out: RealQuestionSource[] = [];
  for (const p of posts) {
    // 「…(第2頁)」是同一篇；「Re: [問題]」是回文
    const title = p.title.replace(/\s*[(（]第\s*\d+\s*頁[)）]/g, '').replace(/^Re:\s*/i, '').replace(/\s*-\s*PTT$/i, '').trim();
    if (!(ASK.test(title) || ASK_LOOSE.test(title)) || AD.test(title) || NOT_ASKING.test(title) || (b && title.toLowerCase().includes(b))) continue;
    const head = p.keyword.split(/\s+/)[0];
    const related = mentions(title, p.keyword) || (stems.length > 0 ? stems.some((x) => mentions(title, x)) : head.length >= 2 && mentions(title, head));
    const same = title.replace(/^\s*(\[[^\]]*\]|【[^】]*】|#)\s*/, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
    if (!related || same.length < 4 || seen.has(same) || seen.has(p.link)) continue;
    seen.add(same);
    seen.add(p.link);
    out.push({ site: p.site, title, link: p.link });
  }
  return out;
}

// 每個論壇輪流取，才不會前面都是同一個論壇
function spread(list: RealQuestionSource[]): RealQuestionSource[] {
  const by = [...new Set(list.map((x) => x.site))].map((s) => list.filter((x) => x.site === s));
  const out: RealQuestionSource[] = [];
  for (let i = 0; by.some((b) => b.length > i); i++) for (const b of by) if (b[i]) out.push(b[i]);
  return out;
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
): Promise<{ questions: { question: string; source: RealQuestionSource }[]; all: RealQuestionSource[]; status: 'ok' | 'failed' }> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { questions: [], all: [], status: 'failed' };
  try {
    const needs = await findNeeds(input, apiKey);
    if (process.env.DEBUG_REALQ) console.log('[realq] needs', needs);
    if (needs.length === 0) return { questions: [], all: [], status: 'ok' };
    const raw = await Promise.all(needs.map((k) => forumSearch(k, key)));
    const failed = raw.reduce((n, r) => n + r.failed, 0);
    const total = raw.reduce((n, r) => n + r.total, 0);
    const found = raw.flatMap((r) => r.posts);
    // 哪個論壇的哪個詞還有相關的，就往下翻（每翻一頁 US$0.001）
    const extra: Post[] = [];
    let dig = needs.flatMap((k) => Object.keys(FORUMS).map((site) => ({ k, site, hits: found.filter((p) => p.keyword === k && p.site === site) })));
    for (let page = 2; page <= MAX_PAGE; page++) {
      dig = dig.filter((d) => relatedPosts(d.hits, needs, input.brandName).length >= DIG_IF);
      dig = await Promise.all(dig.map(async (d) => ({ ...d, hits: (await forumSearch(d.k, key, page, d.site)).posts })));
      extra.push(...dig.flatMap((d) => d.hits));
    }
    const all = spread(relatedPosts([...found, ...extra], needs, input.brandName));
    // 挑題目去問 AI 的那份：照舊，標題要有需求詞、只留在找推薦的
    const seen = new Set<string>();
    const posts = found
      .filter(asksForNeed)
      .filter((p) => (seen.has(p.link) ? false : (seen.add(p.link), true)));
    if (process.env.DEBUG_REALQ) console.log('[realq] posts', posts.length, 'all', all.length, 'failed', failed, '/', total);
    if (posts.length === 0) return { questions: [], all, status: total > 0 && failed === total ? 'failed' : 'ok' };
    return { questions: await pickQuestions(input, posts, count, apiKey).catch(() => []), all, status: 'ok' };
  } catch (e) {
    if (process.env.DEBUG_REALQ) console.log('[realq] error', e);
    return { questions: [], all: [], status: 'failed' };
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
  return { forum, forumAll: forumResult.all, ...(forumResult.status === 'failed' ? { forumFailed: true } : {}), ai, keywords, input };
}
