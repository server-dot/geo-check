import Link from "next/link";

// 深色三欄頁尾（工具／公司／聯絡），home-a-problem-first.dc.html 的版本——
// 5 頁裡 4 頁用這個（/geo 沒有頁尾，見 handoff.md 的頁面結構清單跟 geo-guide.dc.html
// 本身都沒有這一段，不是漏做）。
export default function Footer() {
  return (
    <div className="bg-ink text-paper">
      <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
        <div className="grid grid-cols-3 gap-10">
          <div>
            <div className="k text-[#8b968d]">工具</div>
            <div className="mt-[14px] grid gap-2 text-sm">
              <Link href="/" className="footer-link">
                免費健檢
              </Link>
              <Link href="/geo" className="footer-link">
                GEO 知識
              </Link>
              <Link href="/scoring" className="footer-link">
                判斷標準
              </Link>
              <Link href="/pricing" className="footer-link">
                費用
              </Link>
            </div>
          </div>
          <div>
            <div className="k text-[#8b968d]">公司</div>
            <div className="mt-[14px] grid gap-2 text-sm">
              <Link href="/about" className="footer-link">
                關於我們
              </Link>
              <a href="https://stack.com.tw/" className="footer-link">
                積木媒體行銷
              </a>
              <a href="https://stack.com.tw/%e8%81%af%e7%b5%a1%e6%88%91%e5%80%91/#form" className="footer-link">
                預約諮詢
              </a>
            </div>
          </div>
          <div>
            <div className="k text-[#8b968d]">聯絡</div>
            <div className="mono mt-[14px] grid gap-2 text-xs text-[#a9b5ac]">
              <span>02-27457601</span>
              <a href="https://lin.ee/UhKq8H1" className="footer-link">
                Line @683sivea
              </a>
              <span>週一至週五 10:00–19:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
