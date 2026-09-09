// GEO CHECK 標記：放大鏡裡有一張臉（AI 正在看你的網站），左邊是它讀到的內容行。
//
// 原本是 public/geocheck-logo.png（970×670，544KB）。那張圖的深色背景是烘進去的，
// 貼在淺色 masthead 上就是一塊深色方塊加一圈綠暈；而且縮到 41×28 之後線條全糊在
// 一起，看不出是放大鏡。改成 SVG：背景透明、吃品牌 token（換色不用重畫）、任何
// 尺寸都清楚，檔案也從 544KB 變成幾百 bytes。
//
// 顏色用 fill-lime / fill-ink 這種 utility 而不是 fill="var(--lime)"：presentation
// attribute 裡的 var() 不是每個瀏覽器都吃，走 CSS 的 fill 屬性才穩。
export default function GeoCheckMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 41 28" className={className} role="img" aria-label="GEOCHECK" fill="none">
      {/* 左側：AI 讀到的內容，一行一行 */}
      <g className="fill-lime">
        <rect x="0" y="5.5" width="4.5" height="3" rx="1.5" />
        <rect x="6.5" y="5.5" width="10" height="3" rx="1.5" />
        <rect x="0" y="12.5" width="9" height="3" rx="1.5" />
        <rect x="11" y="12.5" width="5.5" height="3" rx="1.5" />
        <rect x="0" y="19.5" width="4.5" height="3" rx="1.5" />
        <rect x="6.5" y="19.5" width="8" height="3" rx="1.5" />
      </g>
      {/* 把手先畫，讓鏡片蓋住接點，不用另外裁一段 */}
      <path d="M33.2 20.2 L38.5 25.5" className="stroke-ink" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="27" cy="14" r="9" className="fill-ink" />
      {/* 臉：兩隻眼睛＋一條嘴。嘴用紙色不是金色，免得三個金點擠在一起變一團 */}
      <circle cx="23.9" cy="12.4" r="2.1" className="fill-lime" />
      <circle cx="30.1" cy="12.4" r="2.1" className="fill-lime" />
      <rect x="24.9" y="17.2" width="4.2" height="1.7" rx="0.85" className="fill-paper" />
    </svg>
  );
}
