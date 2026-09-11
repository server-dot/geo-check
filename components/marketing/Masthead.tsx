import Link from "next/link";

// 五個行銷頁共用的 sticky 導覽列。首頁（active 不給）不顯示「開始檢測」按鈕、
// 也不 bold 任何導覽項——因為首頁本身就是那個動作的入口，不需要再引導一次。
// 子頁才需要 active 標記目前在哪一頁、以及一顆連回首頁的 CTA。
const NAV_ITEMS = [
  { key: "geo", href: "/geo", label: "GEO 知識" },
  { key: "scoring", href: "/scoring", label: "判斷標準" },
  { key: "pricing", href: "/pricing", label: "費用" },
  { key: "about", href: "/about", label: "關於我們" },
  { key: "contact", href: "/contact", label: "聯絡我們" },
] as const;

export default function Masthead({ active }: { active?: "geo" | "scoring" | "pricing" | "about" | "contact" }) {
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-[rgba(246,245,239,.95)]">
      {/* 手機：logo 一列、導覽自己一列可以橫向捲；桌機：同一列 68px 高。 */}
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-6 px-5 md:h-[68px] md:flex-nowrap md:px-10">
        <Link href="/" className="mark py-3 md:py-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- 固定素材、非使用者上傳圖片，不需要 next/image 的最佳化/尺寸協商 */}
          <img src="/geocheck-logo.webp" alt="GEOCHECK" className="h-[28px] w-[41px] shrink-0 object-contain" />
          <b>GEOCHECK</b>
          <em className="hidden sm:inline">AI 搜尋能見度健檢</em>
        </Link>
        <div className="nav-scroll -mx-5 flex w-[calc(100%+2.5rem)] items-center gap-5 overflow-x-auto whitespace-nowrap border-t border-line px-5 py-2.5 text-sm md:mx-0 md:ml-auto md:w-auto md:gap-6 md:overflow-visible md:border-0 md:p-0">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={active === item.key ? "nav-link is-active" : "nav-link"}
            >
              {item.label}
            </Link>
          ))}
          {active && (
            <Link href="/" className="btn-lime">
              開始檢測
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
