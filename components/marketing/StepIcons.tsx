// 首頁「三個步驟」的三個線稿圖示：深藍灰描邊＋品牌金填色，照小積木給的設計稿畫。
// 三個圖的墨跡都畫在 16～104 這個範圍，viewBox 直接裁到 12～108（留 4px 給描邊），
// svg 外框＝墨跡外框，上下不會多出看不見的留白，跟編號之間的距離才量得準。
// 用 currentColor 當描邊、var(--lime) 當填色，跟站上其他元素共用同一組 token。
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const gold = "var(--lime)";
const paper = "var(--paper)";

function Frame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg viewBox="12 12 96 96" width="104" height="104" role="img" aria-label={title} className="block text-ink">
      {children}
    </svg>
  );
}

// 01 輸入網址：箭頭落進輸入框，框裡一段金色文字＋游標
export function StepInputIcon() {
  return (
    <Frame title="輸入網址">
      <path d="M60 18v28M47 34l13 13 13-13" {...stroke} />
      <rect x="14" y="60" width="92" height="42" rx="12" {...stroke} fill={paper} />
      <rect x="28" y="77" width="32" height="7" rx="3.5" fill={gold} />
      <path d="M84 71v20" {...stroke} />
    </Frame>
  );
}

// 02 六層檢測：一疊檢測層，其中幾層亮金，右下放大鏡裡打勾
export function StepAuditIcon() {
  const rows = [16, 29.5, 43, 56.5, 70, 83.5];
  const lit = new Set([1, 3]);
  return (
    <Frame title="六層檢測 + 深度健檢">
      {rows.map((y, i) => (
        <rect key={y} x="18" y={y} width="66" height="11" rx="4.5" {...stroke} fill={lit.has(i) ? gold : paper} />
      ))}
      <circle cx="84" cy="78" r="15" {...stroke} fill={paper} />
      <path d="M77 78l5 5 10-11" {...stroke} stroke={gold} strokeWidth={3.5} />
      <path d="M95 89l10 10" {...stroke} strokeWidth={4} />
    </Frame>
  );
}

// 03 看報告、排順序：文件裡一張長條圖，底下一條線＋箭頭代表排出順序往下走
export function StepReportIcon() {
  return (
    <Frame title="看報告、排順序">
      <rect x="30" y="16" width="60" height="70" rx="8" {...stroke} fill={paper} />
      <rect x="40" y="26" width="20" height="5" rx="2.5" fill="var(--line)" />
      <rect x="40" y="58" width="10" height="16" rx="2" {...stroke} fill={paper} />
      <rect x="55" y="48" width="10" height="26" rx="2" {...stroke} fill={gold} />
      <rect x="70" y="38" width="10" height="36" rx="2" {...stroke} fill={gold} />
      <path d="M14 98h22" {...stroke} stroke="var(--goldInk)" strokeWidth={3.5} />
      <path d="M84 98h20M98 92l6 6-6 6" {...stroke} stroke="var(--goldInk)" strokeWidth={3.5} />
    </Frame>
  );
}
