// 無障礙檢查：前後端共用的型別
export interface WcagExample {
  what: string; // 白話：搜尋按鈕、回首頁的 Logo
  url: string; // 在哪一頁
  img: string; // 那個東西的圖（有才放）
  detail: string; // 是哪一個：選單裡有哪些選項、連到哪裡
  shot?: string; // 實際截圖（紅框標出來）
  where?: string; // 在畫面哪裡
  on: string[]; // 出現在哪幾頁（最多列 10 頁）
  onCount: number; // 出現在幾頁
}
export interface WcagItem {
  key: string;
  sc: string; // 準則編號
  level: 'A' | 'AA';
  name: string;
  why: string;
  fix: string;
  more?: number; // 太多沒列完的
  checked: number; // 檢查了幾個元素（頁層級的項目＝頁數）
  bad: number;
  pages: { url: string; bad: number }[];
  examples: WcagExample[]; // 每一個有問題的東西（同一個東西在多頁出現只列一次），前三個先顯示
}
// 內容格式改了就加一，舊報告打開時會重測
export const WCAG_VERSION = 9;
export type SkipReason = '翻譯頁' | '設定不收錄' | '重複的頁' | '功能頁' | '打不開';
export interface WcagScan {
  status: 'running' | 'done' | 'stopped'; // stopped＝對方網站開始擋，查到一半停
  done: number; // 查完幾頁
  total: number; // 目前知道要查幾頁
  skipped: Partial<Record<SkipReason, number>>;
  capped: boolean; // 超過上限，只查前面的
  unreadable: number;
}
export interface WcagReport {
  scan?: WcagScan;
  v?: number;
  checkedAt: string;
  pages: { url: string; title: string; readable: boolean }[];
  items: WcagItem[];
}

// 這些要看畫面或實際操作，程式看原始碼判斷不了
export const MANUAL_ITEMS = ['文字和背景的顏色對比', '只用鍵盤能不能操作', '鍵盤選到哪裡看不看得出來', '影片有沒有字幕', '圖片說明寫得對不對'];
