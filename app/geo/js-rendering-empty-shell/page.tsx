import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？｜AI 搜尋能見度健檢",
  description: "主流 AI 爬蟲不執行 JavaScript，純前端渲染的網站在 AI 眼中可能只是一個空的 <div>。判定門檻、怎麼修、改完怎麼複驗。",
};

const STEPS = [
  { name: "打開瀏覽器開發者工具，停用 JavaScript 後重新整理頁面", tag: "5 分鐘" },
  { name: "看看內容還在不在——如果整頁只剩導覽列跟一個空白區塊，就是問題本人", tag: "5 分鐘" },
  { name: "改成 SSR／SSG，或至少把首屏內容用伺服器端渲染先吐出來", tag: "工程師" },
];

const RELATED = [
  { title: "要讓 AI 引用你的內容，該怎麼表態？", href: "/geo/content-signals-declare" },
  { title: "llms.txt 要怎麼寫，AI 才看得懂你的網站？", href: "/geo/llms-txt-format" },
  { title: "健檢顯示「無法判定」，是防火牆擋住了嗎？", href: "/geo/waf-false-unknown" },
];

export default function JsRenderingArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 pb-[52px] pt-[60px]">
          <div className="k">POST</div>
          <div>
            <div className="mono text-[11.5px] text-ink3">
              <Link href="/geo">GEO 知識</Link> / 內容品質
            </div>
            <h1 className="mt-4 max-w-[22em] text-[44px] leading-[1.18] tracking-[-0.035em]">
              網站用 JavaScript 渲染，AI 讀得到內容嗎？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              robots.txt 允許不等於 AI 讀得到內容。主流 AI 爬蟲抓的是伺服器回的原始 HTML，不執行
              JavaScript——純前端渲染的網站，AI 看到的可能只是一個空的 &lt;div id=&quot;root&quot;&gt;&lt;/div&gt;。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-06-02</span>
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
              robots.txt 全部開放，健檢的可達性那一項會給你綠燈；但如果網站是純前端渲染（CSR），
              AI 爬蟲實際讀到的內容可能少到幾乎等於沒有。這是兩件事：能不能進來，跟進來之後看不看得到東西，
              robots.txt 只回答第一個問題。
            </p>

            <h2 className="mt-11 text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              健檢會關掉 JavaScript，用跟 AI 爬蟲一樣的方式讀你的首頁，量出能讀到的純文字字數。少於 200
              字判定為「沒有內容可讀」，200～500 字之間是「內容單薄」，超過 500 字才算正常。同時會對照 HTML
              原始碼的長度跟 &lt;script&gt; 標籤數量——如果 HTML 檔案本身不小，但 script 一大堆、文字卻沒幾個字，
              就是典型的「內容都在 JS 裡，沒渲染出來」訊號。
            </p>
            <div className="excerpt whitespace-pre-wrap">
              {"AI 爬蟲讀到的純文字：187 字（判定：內容不足）\nHTML 長度：4820 字元 ｜ <script> 數量：11\nAI 讀到的內容開頭：「載入中...」"}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              這種情況最常見於整站用 React／Vue 之類的框架直接輸出、沒有搭配伺服器端渲染的網站——瀏覽器裡
              JavaScript 跑起來之後畫面正常，人看起來完全沒問題，但 AI 爬蟲不會等 JavaScript 執行完，
              它只讀伺服器第一時間回的那份 HTML。
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
              不用整站砍掉重練——大部分框架都有 SSR／SSG 模式（Next.js、Nuxt、SvelteKit 都內建），
              優先處理首頁跟產品／服務頁這些你最想被引用的頁面，讓伺服器直接把內容渲染進 HTML
              裡再回給瀏覽器，JavaScript 之後照樣可以接手互動，AI 爬蟲那邊已經先讀到完整內容了。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，「AI 讀到的內容」這一項應該從{" "}
              <span className="t-fail">內容單薄</span> 或 <span className="t-warn">可優化</span> 變成{" "}
              <span className="t-ok">正常</span>，字數也會明顯變多。你也可以自己用瀏覽器開發者工具停用
              JavaScript 重新整理頁面，用肉眼確認內容還在不在——這就是 AI 爬蟲看到的版本。
            </p>
            <p className="note">
              （這一項只看首頁。如果產品頁、文章頁也是純前端渲染，同樣的問題會發生在那些頁面上，深度健檢的
              21 項裡有另外幾項會抽樣檢查其他頁面。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">AI 讀到的內容</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                正常 / 內容單薄
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

      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
          <h2 className="max-w-[20em] text-[34px] tracking-[-0.035em]">看看 AI 爬蟲讀到的是不是空殼。</h2>
          <div className="mt-7 flex gap-3">
            <Link href="/" className="btn-lime no-underline">
              開始檢測
            </Link>
            <Link href="/geo" className="btn-line-dark">
              回到 GEO 知識
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
