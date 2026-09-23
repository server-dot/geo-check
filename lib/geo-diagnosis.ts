import type { ContentMatch } from './geo-content-match';
import { isThirdPartySource } from './geo-citation-sources';

// ── GEO：「AI 為什麼沒推薦你」三關 ──────────────────────────
// 報告以前只給「AI 推了誰、引了哪些網站」，使用者看完還是不知道自己輸在哪
// （2026-09-23 小積木：「我還是不知道我輸在哪」「我只是希望這工具能給出正確的判斷」）。
// 這裡把判斷固定成三關，一關一關排除：
//   ① AI 認得你嗎——品牌題有沒有引到你的網站。沒過＝收錄／技術問題，後面兩關不用看。
//   ② 有沒有一頁在回答這題——geo-content-match.ts 的比對。沒過＝內容沒對上題目。
//   ③ 別人有沒有推薦你——權重、第三方提及。這個工具量不到，只能在前兩關都過了之後用刪去法講。
// 前面還有關沒過，就不怪權重。
//
// 純函式，網頁、PDF、Markdown 三處共用同一套判斷跟文字，不會各講各的。

export type GateState = 'pass' | 'partial' | 'fail' | 'unknown';

export interface Gate {
  state: GateState;
  line: string;
}

export interface Diagnosis {
  conclusion: string;
  gate1: Gate;
  gate2: Gate & { matches: ContentMatch[] };
  gate3: Gate & { thirdParty: number };
  // AI 的搜尋索引不會即時更新，剛改的頁面它還沒看到——這種情況下「沒被推薦」不能當結論
  recencyNote: string;
}

export const GATE_SYMBOL: Record<GateState, string> = { pass: '✓', partial: '△', fail: '✗', unknown: '?' };

export const VERDICT_LABEL: Record<ContentMatch['verdict'], string> = {
  yes: '✓ 有一頁在回答',
  partial: '△ 沾到邊，角度或用詞不同',
  no: '✗ 沒有一頁在回答',
};

// 只要用得到的欄位：前端有自己一份 RecommendVisibility 型別，結構一樣但不是同一個宣告
export interface DiagnosisInput {
  namedSelfCount: number;
  contentMatch?: ContentMatch[] | null;
  questions: { results: { citations: { url: string; title: string; isSelf: boolean }[] }[] }[];
}

export function buildDiagnosis(brand: { citedSelf: boolean }[], rec: DiagnosisInput): Diagnosis {
  // ① 品牌題
  const found = brand.filter((b) => b.citedSelf).length;
  const gate1: Gate =
    brand.length === 0
      ? { state: 'unknown', line: '這次沒有用你的名字去問 AI' }
      : found > 0
        ? { state: 'pass', line: `用你的名字問，${found}/${brand.length} 家 AI 找得到你的網站` }
        : { state: 'fail', line: `用你的名字問，${brand.length} 家 AI 都沒引用你的網站` };

  // ② 內容比對
  const matches = rec.contentMatch ?? [];
  const yes = matches.filter((m) => m.verdict === 'yes').length;
  const partial = matches.filter((m) => m.verdict === 'partial').length;
  const n = matches.length;
  const gate2: Gate & { matches: ContentMatch[] } =
    n === 0
      ? { state: 'unknown', line: '這次沒比對出來', matches }
      : yes === n
        ? { state: 'pass', line: `${n} 題都有一頁在正面回答`, matches }
        : yes + partial === 0
          ? { state: 'fail', line: `${n} 題都沒有一頁在回答`, matches }
          : {
              state: 'partial',
              line: [yes > 0 ? `${yes} 題有` : '', partial > 0 ? `${partial} 題只沾到邊` : '', n - yes - partial > 0 ? `${n - yes - partial} 題沒有` : '']
                .filter(Boolean)
                .join('、'),
              matches,
            };

  // ③ 第三方推薦（量得到的只有「AI 引了幾次第三方」，權重量不到）
  const thirdParty = rec.questions.reduce(
    (sum, q) => sum + q.results.reduce((s, r) => s + r.citations.filter((c) => isThirdPartySource(c)).length, 0),
    0,
  );
  const gate3: Gate & { thirdParty: number } = {
    state: 'unknown',
    line:
      thirdParty > 0
        ? `AI 在這些題目引了 ${thirdParty} 次平台、推薦文、論壇或媒體；你的網站權重這個工具量不到`
        : '你的網站權重、有沒有被別人推薦，這個工具量不到',
    thirdParty,
  };

  let conclusion: string;
  if (rec.namedSelfCount > 0) {
    conclusion = `AI 有 ${rec.namedSelfCount} 次把你寫進答案，下面三關看還有哪裡能補`;
  } else if (gate1.state === 'fail') {
    conclusion = '卡在第 1 關：用名字問 AI 都找不到你，先看下面的技術檢測，後面兩關先不用看';
  } else if (gate2.state === 'fail') {
    conclusion = '卡在第 2 關：客戶問的問題，你網站上沒有一頁在回答';
  } else if (gate2.state === 'partial' && yes === 0) {
    conclusion = '卡在第 2 關：你的頁面只沾到邊，沒有一頁正面回答客戶的問題';
  } else if (gate2.state === 'partial' && gate1.state === 'pass') {
    // 有頁面在回答卻還是沒被推薦的那幾題，前兩關都過了，差距只剩第 3 關——不能整份報告都講成卡在第 2 關
    // （09-23 aiqkangber 實測：2 題 yes、1 題 partial，原本的結論把 2 題講成沒回答）
    conclusion = `${yes} 題你有一頁在回答卻沒被推薦，差距在第 3 關；另外 ${n - yes} 題卡在第 2 關`;
  } else if (gate1.state === 'pass' && gate2.state === 'pass') {
    conclusion = '前兩關都過了，差距在第 3 關：AI 比較信別人推薦的，或你的網站權重不夠';
  } else {
    conclusion = '這次資料不夠，判斷不出卡在哪一關';
  }

  return {
    conclusion,
    gate1,
    gate2,
    gate3,
    recencyNote: '頁面如果是最近一個月內才改的，AI 可能還沒看到新版，3～4 週後再測一次比較準。',
  };
}
