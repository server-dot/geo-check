import type { ContentMatch } from './geo-content-match';
import { isThirdPartySource } from './geo-citation-sources';

// ── GEO：「未被推薦原因」───────────────────────────────────
// 2026-09-23 原本做成三道關卡（AI 認得你／有頁在回答／別人推薦你），2026-11-09 改成一題一列：
// 關卡排法跟「為什麼沒推薦」對不上——前兩關打勾、結果還是沒推；第 3 關永遠是「?」；
// 每題原因不同卻被拆進關卡、要展開才看得到。
//
// 讀者是看不懂技術的行銷人員（小積木 11-04：「重點是解釋現象而非解決」）：
// 每題只列看得到的事實——AI 推你幾次、你網站上最接近的是哪一頁、AI 推了誰。
// 不寫「缺哪些字」「差在口碑」這種解法或猜測的原因（見 memory：geo-check-visibility-no-tech-causation）。
//
// 純函式，網頁、PDF、Markdown 三處共用同一套判斷跟文字，不會各講各的。

export type GateState = 'pass' | 'partial' | 'fail' | 'unknown';

export const GATE_SYMBOL: Record<GateState, string> = { pass: '✓', partial: '△', fail: '✗', unknown: '?' };

export const VERDICT_LABEL: Record<ContentMatch['verdict'], string> = {
  yes: '有一頁在講這件事',
  partial: '有相關的頁，沒有正面回答',
  no: '沒有相關的頁',
};

export const VERDICT_STATE: Record<ContentMatch['verdict'], GateState> = { yes: 'pass', partial: 'partial', no: 'fail' };

export interface DiagnosisRow {
  question: string;
  named: number;   // 幾次回答點名你
  total: number;   // 這題總共幾次回答
  match: ContentMatch | null; // null＝這題沒比對出來
  rivals: string[]; // 這題 AI 點名最多的對手品牌（不含通路），最多 3 個
  selfCited: number;  // 幾次回答的參考連結裡有你的網站
  thirdParty: number; // 這題 AI 參考了幾次平台、論壇、媒體、推薦文
  reason: Reason;
}

// 11-13 小積木：「這頁的重點是我要知道原因」。每題照三關刪去法給一個原因：
// AI 不認得你 → 你網站上沒有回答這題的頁／沒有正面回答 → 有頁，AI 還是選了別人（知名度、口碑量不到，要明講）。
// 只講現象，不講該補什麼（memory：geo-check-report-tone-awareness-not-solution）。
export type ReasonKind = 'recommended' | 'unknown-brand' | 'no-page' | 'partial-page' | 'chose-others' | 'no-match';

export interface Reason {
  kind: ReasonKind;
  state: GateState;
  title: string;
  detail: string;
  said?: string;   // 你的頁講的是什麼（「你這頁講的是…」）
  advice?: string; // 建議可以…（11-13 小積木要求這頁給建議）
}

const quoteList = (xs: string[]) => xs.map((x) => `「${x}」`).join('');

// 你的頁講的是什麼＋建議可以補什麼。新結果用比對時 AI 寫的那兩句；舊結果用「缺的字」＋同業頁標題組
function pageAdvice(question: string, m: ContentMatch): { said?: string; advice?: string } {
  // 自己的其他網站（Relove 的 reloveshop）不能拿來當「同業寫法」：標題裡有你頁面標題的英文品牌字就跳過
  const selfWords = (m.pageTitle.match(/[A-Za-z]{4,}/g) ?? []).map((w) => w.toLowerCase());
  const peers = m.peerPages
    .filter((p) => !selfWords.some((w) => p.title.toLowerCase().includes(w)))
    .map((p) => p.title.split(/[｜|]/)[0].trim())
    .filter(Boolean)
    .slice(0, 2);
  const peerHint = peers.length ? `AI 這題參考的同業頁是${quoteList(peers)}這類寫法。` : '';
  if (m.verdict === 'no') {
    return { advice: m.advice || `可以新增一頁，直接回答「${question}」。${peerHint}` };
  }
  let isHome = false;
  try {
    isHome = new URL(m.pageUrl).pathname.replace(/\/$/, '') === '';
  } catch {}
  const name = `${isHome ? '官網首頁' : ''}「${m.pageTitle.split(/[｜|]/)[0].trim()}」`;
  const gap = m.missing.length ? `沒有講到${quoteList(m.missing)}` : '';
  const said = [m.pageAbout, gap].filter(Boolean).join('，') || undefined;
  const advice =
    m.advice ||
    (m.missing.length
      ? `可以在${name}補上${quoteList(m.missing)}相關的說明，或另寫一頁正面回答這個問題。${peerHint}`
      : `可以另寫一頁正面回答這個問題。${peerHint}`);
  return { said, advice };
}

export const REASON_TITLE: Record<ReasonKind, string> = {
  recommended: '每家 AI 都推了你',
  'unknown-brand': 'AI 不認得你的品牌',
  'no-page': '你網站上沒有講這件事的頁',
  'partial-page': '你有相關的頁，但沒有直接回答這個問題',
  'chose-others': '你有頁在講這件事，AI 還是推了別人',
  'no-match': '判斷不出原因',
};

export interface Diagnosis {
  conclusion: string;
  // 用品牌名直接問 AI 找不找得到你；找不到時，推薦題沒推你就不難理解，放在表格上方
  recognition: { state: GateState; line: string; found: number; total: number };
  // 每種原因各幾題（網頁版大數字卡用）
  reasonCounts: Record<ReasonKind, number>;
  rows: DiagnosisRow[];
  thirdPartyNote: string;
  // AI 的搜尋索引不會即時更新，剛改的頁面它還沒看到——這種情況下「沒被推薦」不能當結論
  recencyNote: string;
}

// 只要用得到的欄位：前端有自己一份 RecommendVisibility 型別，結構一樣但不是同一個宣告
export interface DiagnosisInput {
  namedSelfCount: number;
  contentMatch?: ContentMatch[] | null;
  questions: { question: string; results: { namedSelf?: boolean; citations: { url: string; title: string; isSelf: boolean }[] }[] }[];
  names: { name: string; isSelf: boolean; kind?: 'brand' | 'channel'; answers?: number[] }[];
}

const MAX_RIVALS = 3;

export function buildDiagnosis(brand: { citedSelf: boolean }[], rec: DiagnosisInput): Diagnosis {
  const found = brand.filter((b) => b.citedSelf).length;
  const recognition =
    brand.length === 0
      ? { state: 'unknown' as const, line: '這次沒用品牌名問 AI', found, total: 0 }
      : found > 0
        ? { state: 'pass' as const, line: `用品牌名直接問，${found}/${brand.length} 家 AI 找得到你的網站`, found, total: brand.length }
        : { state: 'fail' as const, line: `用品牌名直接問，${brand.length} 家 AI 都找不到你的網站`, found, total: brand.length };

  // names[].answers 是「題目依序攤平」之後的回答位置，換算回每題的範圍
  let offset = 0;
  const rows: DiagnosisRow[] = rec.questions.map((q) => {
    const start = offset;
    const end = offset + q.results.length;
    offset = end;
    const rivals = rec.names
      .filter((n) => !n.isSelf && n.kind !== 'channel')
      .map((n) => ({ name: n.name, hits: (n.answers ?? []).filter((i) => i >= start && i < end).length }))
      .filter((n) => n.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, MAX_RIVALS)
      .map((n) => n.name);
    const named = q.results.filter((r) => r.namedSelf).length;
    const total = q.results.length;
    const match = rec.contentMatch?.find((m) => m.question === q.question) ?? null;
    const selfCited = q.results.filter((r) => r.citations.some((c) => c.isSelf)).length;
    const thirdParty = q.results.reduce((s, r) => s + r.citations.filter((c) => isThirdPartySource(c)).length, 0);
    const reason = buildReason(q.question, { named, total, match, selfCited, thirdParty, rivals }, recognition.state);
    return { question: q.question, named, total, match, rivals, selfCited, thirdParty, reason };
  });

  const n = rows.length;
  const namedQ = rows.filter((r) => r.named > 0).length;
  const noPage = rows.filter((r) => r.match?.verdict === 'no').length;
  const pageButNot = rows.filter((r) => r.named === 0 && r.match?.verdict === 'yes').length;

  const parts: string[] = [];
  if (recognition.state === 'fail') parts.push('用品牌名問，AI 都找不到你的網站');
  parts.push(namedQ === 0 ? `${n} 題 AI 都沒有推你` : namedQ === n ? `${n} 題 AI 都推過你` : `${n} 題裡，AI 在 ${namedQ} 題推過你`);
  if (noPage > 0) parts.push(`${noPage} 題你網站上沒有相關的頁`);
  if (pageButNot > 0) parts.push(`${pageButNot} 題你有頁在講，AI 推了別人`);

  const thirdParty = rec.questions.reduce(
    (sum, q) => sum + q.results.reduce((s, r) => s + r.citations.filter((c) => isThirdPartySource(c)).length, 0),
    0,
  );

  const reasonCounts = Object.fromEntries(Object.keys(REASON_TITLE).map((k) => [k, 0])) as Record<ReasonKind, number>;
  for (const r of rows) reasonCounts[r.reason.kind]++;

  return {
    conclusion: parts.join('；'),
    recognition,
    reasonCounts,
    rows,
    thirdPartyNote:
      thirdParty > 0
        ? `AI 回答這些題目時，引了 ${thirdParty} 次平台、論壇、媒體或別人的推薦文。這些地方有沒有提到你，這份報告查不到。`
        : '別的網站有沒有提到你，這份報告查不到。',
    recencyNote: '最近一個月才改過的頁面，AI 可能還沒讀到，過 3～4 週再測一次。',
  };
}

function buildReason(
  question: string,
  r: { named: number; total: number; match: ContentMatch | null; selfCited: number; thirdParty: number; rivals: string[] },
  recognition: GateState,
): Reason {
  const make = (kind: ReasonKind, state: GateState, detail: string, extra: { said?: string; advice?: string } = {}): Reason => ({
    kind,
    state,
    title: REASON_TITLE[kind],
    detail,
    ...extra,
  });
  if (r.total > 0 && r.named === r.total) return make('recommended', 'pass', `${r.total} 家 AI 都在答案裡推了你。`);
  const some = r.named > 0 ? `${r.total} 家 AI 裡有 ${r.total - r.named} 家沒推你。` : '';
  if (recognition === 'fail')
    return make('unknown-brand', 'fail', `${some}直接用品牌名問，AI 都找不到你的官網。AI 還不認得你，推薦的時候就不會想到你。`, {
      advice: '可以先讓 AI 認得你：官網首頁清楚寫出品牌名、在做什麼、服務誰。',
    });
  if (!r.match) return make('no-match', 'unknown', `${some}這題沒比對到你網站上的頁，判斷不出是卡在哪裡。`);
  const notSeen = r.selfCited === 0 ? '，AI 回答時也沒有參考你的網站' : '';
  const page = r.match.pageTitle ? `「${r.match.pageTitle}」` : '';
  if (r.match.verdict === 'no')
    return make('no-page', 'fail', `${some}你網站上找不到在講這件事的頁，AI 回答這題時沒有你的內容可以用。`, pageAdvice(question, r.match));
  if (r.match.verdict === 'partial')
    return make('partial-page', 'partial', `${some}你最接近的頁${page}跟這題有關，但沒有直接回答這個問題${notSeen}。`, pageAdvice(question, r.match));
  return make(
    'chose-others',
    'partial',
    `${some}你的頁${page}有在講這件事${r.selfCited > 0 ? '，AI 也看到了你的網站' : ''}，${r.named > 0 ? '沒推你的 AI 推了別人' : 'AI 還是推了別人'}。` +
      (r.thirdParty > 0 ? `這題 AI 參考了 ${r.thirdParty} 次平台、論壇、媒體或推薦文。` : '') +
      'AI 挑誰也看知名度、別人怎麼說你，這兩件事這份報告量不到。',
    {
      said: r.match.pageAbout || undefined,
      // 建議要點名 AI 參考的網站，網站分類在報告端算（components/report/DiagnosisCards.tsx）；
      // 11-13 小積木罵「看看那些平台有沒有提到你」這種通用句「這三小建議」，這裡不給通用句
    },
  );
}
