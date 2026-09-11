// GA4 事件。gtag 由 layout 在 NEXT_PUBLIC_GA_ID 有設時載入；沒載入就什麼都不做。
// 事件名稱固定這幾個，GA 那邊用「事件」報表就看得到有幾個人真的跑了健檢、測了誰、拿了幾分。
export type GaEvent =
  | 'audit_start'      // 按下開始檢測
  | 'audit_complete'   // 健檢完成（帶 domain、score、grade、ok/warn/fail）
  | 'audit_fail'       // 健檢失敗或被擋（帶 reason）
  | 'keyword_query'    // 關鍵字查詢（帶 keyword_count）
  | 'pdf_download';    // 下載 PDF（帶 pages）

type Gtag = (command: 'event', name: string, params?: Record<string, string | number | boolean>) => void;

export function track(event: GaEvent, params: Record<string, string | number | boolean> = {}): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (!gtag) return;
  try {
    gtag('event', event, params);
  } catch {
    // 追蹤失敗不能影響功能
  }
}
