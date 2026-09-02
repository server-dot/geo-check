import Link from "next/link";

// 五個行銷頁共用的 sticky 導覽列。首頁（active 不給）不顯示「開始檢測」按鈕、
// 也不 bold 任何導覽項——因為首頁本身就是那個動作的入口，不需要再引導一次。
// 子頁才需要 active 標記目前在哪一頁、以及一顆連回首頁的 CTA。
const NAV_ITEMS = [
  { key: "geo", href: "/geo", label: "GEO 知識" },
  { key: "scoring", href: "/scoring", label: "判斷標準" },
  { key: "pricing", href: "/pricing", label: "費用" },
  { key: "about", href: "/about", label: "關於我們" },
] as const;

export default function Masthead({ active }: { active?: "geo" | "scoring" | "pricing" | "about" }) {
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-[rgba(243,242,234,.95)]">
      <div className="mx-auto flex h-[68px] max-w-[1120px] items-center gap-6 px-10">
        <Link href="/" className="mark">
          <i />
          <b>GEOCHECK</b>
          <em>AI 搜尋能見度健檢</em>
        </Link>
        <div className="ml-auto flex items-center gap-6 text-sm">
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
