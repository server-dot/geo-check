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
}

export interface Diagnosis {
  conclusion: string;
  // 用品牌名直接問 AI 找不找得到你；找不到時，推薦題沒推你就不難理解，放在表格上方
  recognition: { state: GateState; line: string };
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
      ? { state: 'unknown' as const, line: '這次沒用品牌名問 AI' }
      : found > 0
        ? { state: 'pass' as const, line: `用品牌名直接問，${found}/${brand.length} 家 AI 找得到你的網站` }
        : { state: 'fail' as const, line: `用品牌名直接問，${brand.length} 家 AI 都找不到你的網站` };

  // names[].answers 是「題目依序攤平」之後的回答位置，換算回每題的範圍
  let offset = 0;
  const rows: DiagnosisRow[] = rec.questions.map((q) => {
    const start = offset;
    const end = offset + q.results.length;
    offset = end;
    const rivals = rec.names
      .filter((n) => !n.isSelf)
      .map((n) => ({ name: n.name, hits: (n.answers ?? []).filter((i) => i >= start && i < end).length }))
      .filter((n) => n.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, MAX_RIVALS)
      .map((n) => n.name);
    return {
      question: q.question,
      named: q.results.filter((r) => r.namedSelf).length,
      total: q.results.length,
      match: rec.contentMatch?.find((m) => m.question === q.question) ?? null,
      rivals,
    };
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

  return {
    conclusion: parts.join('；'),
    recognition,
    rows,
    thirdPartyNote:
      thirdParty > 0
        ? `AI 回答這些題目時，引了 ${thirdParty} 次平台、論壇、媒體或別人的推薦文。這些地方有沒有提到你，這份報告查不到。`
        : '別的網站有沒有提到你，這份報告查不到。',
    recencyNote: '最近一個月才改過的頁面，AI 可能還沒讀到，過 3～4 週再測一次。',
  };
}
