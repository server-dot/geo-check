import { askJson, parseJson, type RecommendQuestionResult } from './geo-recommend-visibility';
import { isPeerSource } from './geo-citation-sources';

// ── GEO：「AI 為什麼沒推薦你」第 2 關——你有沒有一頁在回答這題 ──────────
// 第 1 關（AI 認不認得你）看品牌題就知道；第 3 關（權重、第三方推薦）量不到，只能用刪去法。
// 真正要算的是這一關：每一題推薦題，拿你網站爬到的頁面去比，挑最接近的一頁，
// 判斷它是「正面回答這題」「沾到邊但角度或用詞不同」還是「根本沒有」，
// 再對照 AI 實際引用的同業頁面，列出客戶／同業用、你頁面上沒有的字。
//
// 2026-09-23 拿 aiqkangber.com 手動做過一次：服務頁有「n8n 流程自動化」，但題目問的是
// 「台灣哪家團隊能幫企業導入」，同業頁標題是「n8n 顧問與導入服務」，你的頁面「導入」「顧問」
// 各只出現 1 次、「台灣」「中小企業」0 次——這就是這裡要自動給出的判斷。
//
// 只講「有沒有一頁在回答」「缺哪些字」，不講「補了就會被推薦」
// （見 memory：geo-check-visibility-no-tech-causation）。

export type MatchVerdict = 'yes' | 'partial' | 'no';

export interface ContentMatch {
  question: string;
  verdict: MatchVerdict;
  pageUrl: string;   // 你網站上最接近的一頁；verdict 為 no 時可能是空字串
  pageTitle: string;
  missing: string[]; // 題目或同業頁面在用、你那一頁沒出現的字，最多 4 個
  peerPages: { url: string; title: string }[]; // AI 在這題引用的同業頁面，最多 3 個
  // 11-13 小積木：「要說你講的是…建議可以…」。11-13 之前的結果沒有這兩欄，報告用 missing＋peerPages 組一句頂替
  pageAbout?: string; // 這一頁在講什麼（一句）
  advice?: string;    // partial／no 時，可以補什麼內容或新增什麼頁（一句，「可以…」開頭）
}

export interface MatchPage {
  url: string;
  title: string;
  text: string;
}

const SNIPPET_CHARS = 220;
const MAX_PAGES = 40;
const MAX_MISSING = 4;
const MAX_PEERS = 3;
// 題目裡的問句用語不是「缺的字」——模型交代了還是會列（09-23 實測列出「注意」）
const NOT_A_TERM = /^(注意|推薦|服務|哪些|哪家|專業|比較|怎麼|如何|資源|專家|公司|團隊|找誰|應該|可以)$/;

function peerPagesFor(q: RecommendQuestionResult): { url: string; title: string }[] {
  const seen = new Map<string, { url: string; title: string; n: number }>();
  for (const r of q.results) {
    for (const c of r.citations) {
      if (!isPeerSource(c)) continue;
      const key = c.url.replace(/[?#].*$/, '').replace(/\/$/, '');
      const e = seen.get(key);
      if (e) e.n += 1;
      else seen.set(key, { url: c.url, title: c.title, n: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, MAX_PEERS).map(({ url, title }) => ({ url, title }));
}

function buildPrompt(items: { question: string; peers: { title: string }[] }[], pages: MatchPage[]): string {
  const pageList = pages
    .map((p, i) => `[${i}] ${p.title || '（無標題）'}｜${p.text.replace(/\s+/g, ' ').slice(0, SNIPPET_CHARS)}`)
    .join('\n');
  const qList = items
    .map((it, i) => {
      const peers = it.peers.length > 0 ? it.peers.map((p) => `「${p.title}」`).join('、') : '（沒有）';
      return `Q${i}：${it.question}\n  AI 在這題引用的同業頁面標題：${peers}`;
    })
    .join('\n');
  return `下面是一個網站的所有頁面（編號、標題、內文開頭），以及幾個客戶會拿去問 AI 的問題。
對每個問題，從這個網站的頁面裡挑出「最能回答這個問題」的一頁，判斷它回答得怎麼樣。

【這個網站的頁面】
${pageList}

【問題】
${qList}

挑頁面：有專門講這件事的子頁（例如問「客服機器人」，網站有一頁「客服 AI 自動回覆」），就挑那一頁，不要挑列出所有服務的總覽頁。

判斷標準：
- yes：這一頁的主題就是在回答這個問題——客戶讀了會知道「這家就是在做這件事、可以找他」。
- partial：沾到邊，但角度或用詞不同。例如問題問「找誰導入 n8n」，這一頁卻是在列「我做過哪些自動化項目」；或問題問「台灣中小企業」，頁面完全沒講對象是誰。
- no：整個網站沒有一頁在講這件事。部落格教學文不算回答「找誰幫忙」這類問題。
- about：一句話（25 字內）說你挑的那一頁在講什麼，例如「列出私密潔淨系列的商品」「介紹品牌理念與門市」。no 時給空字串。
- advice：partial 或 no 時給一句建議（40 字內），用「可以」開頭，具體說要在那一頁補什麼內容、或新增一頁講什麼，才算正面回答這個問題；可以參考同業頁面標題的寫法。不要寫「就會被推薦」這類保證。yes 時給空字串。
- missing：問題或同業頁面標題裡用到、但你挑的那一頁沒有講到的關鍵字詞，最多 ${MAX_MISSING} 個，每個 2 到 8 個字，用原文的寫法（例如「導入」「顧問」「中小企業」「台灣」）。yes 也可以有 missing。不要列品牌名、不要列太泛的字（「服務」「推薦」「哪些」）。

只回傳 JSON：{"matches":[{"q":0,"page":3,"alt":5,"verdict":"partial","about":"列出做過的自動化專案","advice":"可以新增一頁說明 n8n 導入顧問服務：服務對象、流程、費用","missing":["導入","顧問"]}]}
沒有任何相關頁面時 page 給 -1、verdict 給 "no"。alt 是第二接近的頁的編號，沒有就 -1。missing 不要列「頁面用別的說法講過」的字（「內訓」就是「內部培訓」）。`;
}

// 同一件事的縮寫也算講過：「內部培訓」↔「內訓」。寧可少列一個缺的字，不要誤報
export function saysIt(text: string, term: string): boolean {
  if (text.includes(term)) return true;
  if (!/^[\u4e00-\u9fff]+$/.test(term)) return false;
  if (term.length === 4) return text.includes(term[0] + term[2]) || text.includes(term[0] + term[3]);
  if (term.length === 2) return new RegExp(`${term[0]}[\u4e00-\u9fff]{1,2}${term[1]}`).test(text);
  return false;
}

// 拆出題目裡的需求，逐條找頁面原文；引文在頁面上找不到的不算
async function checkNeeds(question: string, pages: MatchPage[], apiKey: string): Promise<{ page: MatchPage; verdict: MatchVerdict } | null> {
  const flat = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const prompt = `客戶的問題：「${question}」

${pages.map((p, i) => `【頁${i}】${p.title}\n${p.text.replace(/\s+/g, ' ').slice(0, 6000)}`).join('\n\n')}

1. 把問題拆成 1～4 個需求（要找什麼、給誰用、什麼條件）。「推薦」「哪家好」這種問句用語、「台灣」不算需求。
2. 對每一頁的每個需求，抄出那一頁「真的講到」這個需求的原文片段（4～30 字，一字不差）；沒講到給空字串。用別的說法講同一件事算講到。
只回傳 JSON：{"needs":["…"],"pages":[{"page":0,"quotes":["…",""]}]}，quotes 跟 needs 同順序。`;
  try {
    const p = parseJson<{ needs?: unknown; pages?: { page?: unknown; quotes?: unknown }[] }>(await askJson(prompt, apiKey, 900));
    const n = Array.isArray(p?.needs) ? Math.min(p.needs.length, 4) : 0;
    if (n === 0 || !Array.isArray(p?.pages)) return null;
    const scored = pages.flatMap((page, i) => {
      const r = p.pages!.find((x) => x.page === i);
      if (!r || !Array.isArray(r.quotes)) return [];
      const body = flat(`${page.title}\n${page.text}`);
      const hit = r.quotes.slice(0, n).filter((q) => typeof q === 'string' && flat(q).length >= 2 && body.includes(flat(q))).length;
      return [{ page, hit }];
    });
    if (scored.length === 0) return null;
    const best = scored.sort((a, b) => b.hit - a.hit)[0];
    return { page: best.page, verdict: best.hit === n ? 'yes' : best.hit > 0 ? 'partial' : 'no' };
  } catch {
    return null;
  }
}

export async function matchQuestionsToPages(
  questions: RecommendQuestionResult[],
  pages: MatchPage[],
  apiKey: string,
): Promise<ContentMatch[] | null> {
  const usable = pages.filter((p) => p.text.trim().length > 0).slice(0, MAX_PAGES);
  if (questions.length === 0 || usable.length === 0) return null;

  const items = questions.map((q) => ({ question: q.question, peers: peerPagesFor(q) }));
  const raw = await askJson(buildPrompt(items, usable), apiKey, Math.max(1400, items.length * 350));
  const parsed = parseJson<{ matches?: { q?: number; page?: number; alt?: number; verdict?: string; about?: unknown; advice?: unknown; missing?: unknown }[] }>(raw);
  const rows = Array.isArray(parsed?.matches) ? parsed!.matches : [];

  return Promise.all(items.map(async (it, qi) => {
    const row = rows.find((r) => r.q === qi);
    const at = (n: unknown) => (typeof n === 'number' && n >= 0 ? usable[n] : undefined);
    let page = at(row?.page);
    let verdict: MatchVerdict = row?.verdict === 'yes' || row?.verdict === 'partial' ? row.verdict : 'no';
    if (!page) verdict = 'no';
    // 第一步每頁只看得到開頭；挑出來的頁再讀全文，題目的每個需求都要在頁面上找得到原文才算「有在回答」
    const alt = at(row?.alt);
    const checked = page ? await checkNeeds(it.question, alt && alt !== page ? [page, alt] : [page], apiKey) : null;
    if (checked) {
      page = checked.page;
      verdict = checked.verdict;
    }
    // 模型說「缺」的字，如果其實就在那一頁的內文或標題裡，就不是缺——擋掉模型亂講
    const pageText = page ? `${page.title}\n${page.text}`.toLowerCase() : '';
    const missing = (Array.isArray(row?.missing) ? row!.missing : [])
      .filter((m): m is string => typeof m === 'string')
      .map((m) => m.trim())
      .filter((m) => [...m].length >= 2 && [...m].length <= 8 && !NOT_A_TERM.test(m))
      .filter((m) => !saysIt(pageText, m.toLowerCase()))
      .slice(0, MAX_MISSING);
    return {
      question: it.question,
      verdict,
      pageUrl: page?.url ?? '',
      pageTitle: page?.title ?? '',
      missing,
      peerPages: it.peers,
      pageAbout: page && typeof row?.about === 'string' ? row.about.trim().slice(0, 60) : '',
      advice: verdict !== 'yes' && typeof row?.advice === 'string' ? row.advice.trim().slice(0, 80) : '',
    };
  }));
}
