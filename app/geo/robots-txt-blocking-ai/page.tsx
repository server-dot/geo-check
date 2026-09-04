import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "robots.txt 要怎麼寫，AI 爬蟲才進得來？｜AI 搜尋能見度健檢",
  description: "健檢裡最常見的需處理項目，也是最快能修好的一項：規則怎麼影響各家 AI 爬蟲、哪幾行要改、改完怎麼複驗。",
};

const STEPS = [
  { name: "打開 https://你的網域/robots.txt，找出所有 AI 爬蟲的規則", tag: "5 分鐘" },
  { name: "移除或改寫對 GPTBot、ClaudeBot、PerplexityBot 的 Disallow", tag: "工程師" },
  { name: "順手補上 Content Signals 與 llms.txt 的表態", tag: "選配" },
];

const RELATED = [
  { title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？", href: "/geo/js-rendering-empty-shell" },
  { title: "要讓 AI 引用你的內容，該怎麼表態？", href: "/geo/content-signals-declare" },
  { title: "健檢顯示「無法判定」，是防火牆擋住了嗎？", href: "/geo/waf-false-unknown" },
];

export default function RobotsTxtArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 pb-[52px] pt-[60px]">
          <div className="k">POST</div>
          <div>
            <div className="mono text-[11.5px] text-ink3">
              <Link href="/geo">GEO 知識</Link> / AI 可達性
            </div>
            <h1 className="mt-4 max-w-[22em] text-[44px] leading-[1.18] tracking-[-0.035em]">
              robots.txt 要怎麼寫，AI 爬蟲才進得來？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              這是健檢裡最常見的需處理項目，也是最快能修好的一項。以下說明規則怎麼影響各家 AI
              爬蟲、哪幾行要改，以及改完怎麼複驗。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-05-14</span>
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
              Google 抓得到你的網站，不代表 AI 抓得到。robots.txt 通常是網站最早設定、也最少回頭檢查的檔案——
              常見的情況是規則寫得太寬、或套用了某個資安外掛／CDN 的預設封鎖清單，把 GPTBot、ClaudeBot
              這類 AI 爬蟲也一起擋在外面，而且完全不影響 Google 排名，很容易被忽略。
            </p>

            <h2 className="mt-11 text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              健檢會用 8 家 AI 爬蟲各自真實的 User-Agent 實際發送請求，對照 robots.txt 的規則，
              只要有任何一家被 Disallow 擋下，這一項就會標成 <span className="t-fail">需處理</span>。
              下面是一個典型會連 AI 爬蟲一起擋掉的規則：
            </p>
            <div className="excerpt whitespace-pre-wrap">{"User-agent: GPTBot\nDisallow: /"}</div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              這兩行的意思是「GPTBot 不能存取網站任何路徑」。常見成因是直接複製別人的 robots.txt 範本、
              或用了一次擋掉所有非瀏覽器 User-Agent 的資安設定——原意是擋垃圾爬蟲，結果把 AI 爬蟲也算了進去。
            </p>

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
              如果 robots.txt 是用 CMS 外掛（例如 Yoast、Rank Math）產生的，改設定介面就好；如果是放在網站根目錄的純文字檔，
              要請工程師直接改內容並重新部署。改完記得留著原本允許 Google 等既有搜尋引擎的規則，不要整份清空重寫。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，這一項應該從 <span className="t-fail">需處理</span> 變成{" "}
              <span className="t-ok">正常</span>，爬蟲清單會收合成一行「8 個 AI 爬蟲的結果一致：可存取」。
              如果仍然標成 ⚪ 無法判定，代表 robots.txt 我們讀不到，通常是 WAF 的問題——見{" "}
              <Link href="/scoring">判斷標準</Link>。
            </p>
            <p className="note">
              （如果這一項改完 AI 還是不引用你，問題不在可達性，而在內容或權威。那是另外幾篇的範圍。）
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
