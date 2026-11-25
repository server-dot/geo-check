// 無障礙檢查：前後端共用的型別
export interface WcagItem {
  key: string;
  sc: string; // 準則編號
  level: 'A' | 'AA';
  name: string;
  why: string;
  fix: string;
  checked: number; // 檢查了幾個元素（頁層級的項目＝頁數）
  bad: number;
  pages: { url: string; bad: number }[];
  samples: string[];
}
export interface WcagReport {
  checkedAt: string;
  pages: { url: string; title: string; readable: boolean }[];
  items: WcagItem[];
}

// 這些要看畫面或實際操作，程式看原始碼判斷不了
export const MANUAL_ITEMS = ['文字和背景的顏色對比', '只用鍵盤能不能操作', '鍵盤選到哪裡看不看得出來', '影片有沒有字幕', '圖片說明寫得對不對'];
