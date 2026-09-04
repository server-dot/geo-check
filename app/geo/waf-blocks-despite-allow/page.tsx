import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "robots.txt 明明允許，AI 爬蟲卻連不進來？｜AI 搜尋能見度健檢",
  description:
    "robots.txt 寫 Allow，AI 爬蟲實測還是被擋——問題通常出在 WAF／CDN，不是 robots.txt。WAF／CDN 是什麼、為什麼會蓋過 robots.txt 的允許，以及怎麼放行。",
};

const STEPS = [
  { name: "確認健檢辨識出的 WAF／CDN 廠商（回應標頭裡通常看得出來）", tag: "2 分鐘" },
  { name: "登入該廠商後台的 Bot 管理設定，找到目前擋掉這個爬蟲的規則", tag: "5 分鐘" },
  { name: "把爬蟲的 User-Agent 或官方公告的來源 IP 段加進白名單／已驗證清單", tag: "工程師" },
];

const RELATED = [
  { title: "健檢顯示「無法判定」，是防火牆擋住了嗎？", href: "/geo/waf-false-unknown" },
  { title: "robots.txt 要怎麼寫，AI 爬蟲才進得來？", href: "/geo/robots-txt-blocking-ai" },
  { title: "要讓 AI 引用你的內容，該怎麼表態？", href: "/geo/content-signals-declare" },
];

export default function WafBlocksDespiteAllowArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 pb-[52px] pt-[60px]">
          <div className="k">POST</div>
          <div>
            <div className="mono text-[11.5px] text-ink3">
              <Link href="/geo">GEO 知識</Link> / 技術與索引
            </div>
            <h1 className="mt-4 max-w-[22em] text-[44px] leading-[1.18] tracking-[-0.035em]">
              robots.txt 明明允許，AI 爬蟲卻連不進來？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              robots.txt 寫得清清楚楚 Allow: /，健檢實測卻還是被擋下來——這種「政策允許但實測被擋」不是
              健檢誤判，是 robots.txt 跟真正擋下請求的東西，根本是兩層完全獨立的系統。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-09-04</span>
              <span>（作者待填）</span>
              <span>（閱讀時間待填）</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr_220px] gap-x-6 px-10 py-[72px]">
          <div className="k">01</div>

          <div className="max-w-[34em]">
            <p className="text-[15.5px] leading-[1.75] text-ink2">
              健檢會分兩步驟驗證每一家 AI 爬蟲：先讀 robots.txt 裡寫的規則（這是「政策」），
              再真的用那家爬蟲的身分送一次請求，看看實際連不連得上（這是「實測」）。
              兩者對不上，最常見的原因就是 WAF 或 CDN——robots.txt 允許，不代表請求真的能穿過站方前面那層防護。
            </p>

            <h2 className="mt-11 text-[30px]">WAF／CDN 是什麼</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              <strong>CDN（Content Delivery Network，內容傳遞網路）</strong>是把你的網站內容快取到全球多個節點的服務，
              主要目的是加速與分流，例如 Cloudflare、Akamai、Fastly。
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              <strong>WAF（Web Application Firewall，網頁應用防火牆）</strong>則是架在你的伺服器前面的一層過濾器，
              專門判斷進來的流量像不像正常訪客——請求頻率太高、User-Agent 可疑、沒有瀏覽器該有的行為特徵，
              都可能被直接擋下來，回一個 403 或挑戰頁。多數 CDN 廠商會把 WAF／Bot 防護當附加功能一起賣，
              所以這兩個名詞常常一起出現、指的也常是同一家廠商（例如 Cloudflare 本身就同時是 CDN 也是 WAF）。
            </p>

            <h2 className="mt-11 text-[30px]">為什麼會蓋過 robots.txt 的允許</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              robots.txt 是一份寫給爬蟲看的「君子協定」——內容是純文字規則，願不願意遵守，全靠對方自律。
              正派的 AI 爬蟲會先讀這份文件，讀到 Allow 才會繼續請求頁面。但 WAF／CDN 不是協定，是強制的網路層關卡：
              請求要先通過它的規則判斷，才會真的送到你的網站程式碼——判斷過程完全不會去看你的 robots.txt 寫了什麼，
              兩邊是各自獨立運作的系統。也因為這樣，「robots.txt 允許」只代表你<em>願意</em>讓這家爬蟲進來，
              不保證前面那層防護真的會<em>放行</em>它。
            </p>
            <div className="report-preview">
              {"政策允許但實測被擋：robots.txt 允許（Allow: /），實測連線被擋下\n（HTTP 403，疑似 Cloudflare）\nrobots.txt 只是規則，實際能不能連進來要看前面的 WAF／CDN 放不放行。\n\n到 Cloudflare 後台「Security → Bots」，確認 Bot Fight Mode／Super Bot\nFight Mode 有沒有把這家爬蟲也擋掉，並在「Verified Bots」或自訂規則\n中放行對應的 User-Agent。"}
            </div>

            <h2 className="mt-11 text-[30px]">怎麼修</h2>
            <div className="mt-[18px]">
              {STEPS.map((s) => (
                <div key={s.name} className="list-row list-row--step">
                  <div className="nm">{s.name}</div>
                  <div className="st">{s.tag}</div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              後台設定的位置依廠商而不同——Cloudflare 是 Security → Bots，Akamai 是 Bot Manager／Kona
              Site Defender，Imperva 是 Bot Access Control。多數主流 AI 爬蟲（GPTBot、ClaudeBot、
              PerplexityBot 等）都有官方公告的 User-Agent 字串，部分也公告固定來源 IP 段，
              放行的時候優先用官方清單，不要只靠字串比對，避免有心人士假冒 User-Agent 繞過其他防護。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，這一項應該從{" "}
              <span className="t-warn">政策允許但實測被擋</span> 變成 <span className="t-ok">可存取</span>。
            </p>
            <p className="note">
              （這個狀況跟「⚪ 無法判定」不是同一回事：無法判定是連 robots.txt 本身都讀不到，
              這裡是 robots.txt 讀得到、也寫了允許，卡在後面那一層。無法判定的情況見
              「健檢顯示「無法判定」，是防火牆擋住了嗎？」那篇。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">AI 爬蟲的存取權限</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                可存取 / 被擋 / 無法判定 / 政策允許但實測被擋
              </p>
              <Link href="/" className="btn-lime mt-[18px] inline-block text-[13.5px]">
                檢測我的網站
              </Link>
            </div>
            <div className="k mt-8">相關文章</div>
            <div className="mt-3.5 grid gap-3 text-sm">
              {RELATED.map((r) => (
                <Link key={r.href} href={r.href} className="text-ink3">
                  {r.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
