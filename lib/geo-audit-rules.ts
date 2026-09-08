// ── GEO 深度健檢：規則判斷共用型別 ────────────────────────
// 跟 stacktools 的 site-audit-rules.ts 同一套設計，簡化掉「兩階段」跟 GSC 依賴——
// geo-check 檢測的是任何人丟進來的陌生網址，沒有對方的 GSC 授權，
// 所以這裡的每一項都只用「爬得到的東西」判斷，不假裝有 Google 官方資料。

// 影響層級
export const LEVEL = {
  RANK: '直接影響收錄 / 排名',
  EFFICIENCY: '影響效率 / 放大成效',
  QUALITY: '品質優化 / 中長期',
} as const;

// 分類
export const CATEGORY = {
  AI_ENGINE: 'AI 引擎可達性',
  TRACKING: '成效與追蹤',
  TECH: '技術面',
  LOCAL_BRAND: '在地與品牌',
  STRUCTURE: '網站結構',
  CONTENT: '內容與頁面',
  EXTERNAL: '外部權重',
} as const;

export type CheckStatus = 'ok' | 'warn' | 'fail';

// 檢查項目的權威順序，用來排序輸出（AI 引擎相關的擺最前面，那是我們的差異化重點）
export const ITEM_ORDER: string[] = [
  // ── AI 引擎可達性（geo-check 原生的部分）──
  'aiCrawlers',
  'contentVisibility',
  'contentSignals',
  'llmsAi',
  // ── 基礎健檢 ──
  'analytics',
  'sitemap',
  'robots',
  'indexing',
  'localbiz',
  'breadcrumb',
  'internalLinks',
  'brokenLinks',
  'duplicate',
  // ── 結構與內容 ──
  'tkd',
  'headings',
  'schema',
  'page',
  'viewport',
  'categoryDepth',
  'homepage',
  'imgAlt',
  'imgFormat',
  'externalLinks',
  'eeat',
];

// 深度健檢實際會產生的 CheckResult key（跟 geo-audit-aggregate.ts／geo-schema-check.ts／
// geo-audit-ai.ts 逐一核對過原始碼裡的 key: '...' 字面值，不是從 ITEM_ORDER 推算——
// ITEM_ORDER 只是顯示排序用，少列了 llmsSeo 這個真的會 push 出來的 key，拿它扣掉
// AI 引擎層算數量會少算一項）。行銷頁「N 項深度健檢」文案用這份清單的長度，
// 之後新增/刪除深度健檢項目時要記得一起更新。
export const DEEP_AUDIT_KEYS = [
  'analytics', 'sitemap', 'robots', 'indexing', 'localbiz', 'breadcrumb',
  'internalLinks', 'brokenLinks', 'duplicate', 'tkd', 'headings', 'schema',
  'page', 'viewport', 'categoryDepth', 'homepage', 'imgAlt', 'imgFormat',
  'externalLinks', 'llmsSeo', 'eeat',
] as const;

// 三段式文案，對應報告上三種讀者需求：
//   advice    現況——現在是什麼狀況（帶數字），白話，不含修法
//   impact    影響——所以 AI 那邊／客戶那邊會發生什麼事，白話，不含修法
//   technical 技術細節——原本那套技術說明與修法，收進可展開區給懂的人看
// 拆成三個欄位是為了取代前端「用句號切開、看最後一句有沒有『建議』兩字」
// 那個猜測式的切法：切點猜錯就會生出「補齊並控制長度」這種脫離上下文的殘句。
// 工具的定位是讓對方認知到問題存在，所以 impact 講後果、不教修法——
// 要修的話有底下的諮詢入口。
export type CheckResult = {
  key: string;
  level: string;
  category: string;
  item: string;
  status: CheckStatus;
  advice: string;
  impact?: string;
  technical?: string;
  evidence?: string;
  details?: { url: string; note: string }[];
};

export function sortByOrder(checks: CheckResult[]): CheckResult[] {
  return [...checks].sort(
    (a, b) =>
      (ITEM_ORDER.indexOf(a.key) === -1 ? 99 : ITEM_ORDER.indexOf(a.key)) -
      (ITEM_ORDER.indexOf(b.key) === -1 ? 99 : ITEM_ORDER.indexOf(b.key)),
  );
}
