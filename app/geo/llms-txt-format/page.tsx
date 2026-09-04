import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "llms.txt 要怎麼寫，AI 才看得懂你的網站？｜AI 搜尋能見度健檢",
  description: "llms.txt 是給 AI 看的網站導覽，llmstxt.org 訂了標準格式。格式要有什麼、健檢怎麼判定「內容單薄」、怎麼寫才算完整。",
};

const STEPS = [
  { name: "在網站根目錄建立 /llms.txt，第一行用 # 開頭寫網站名稱", tag: "10 分鐘" },
  { name: "第二行用 > 開頭寫一句話摘要，講清楚這個網站是做什麼的", tag: "10 分鐘" },
  { name: "列出最重要的幾個頁面連結，每個連結後面附一句說明在講什麼", tag: "30 分鐘" },
];

const RELATED = [
  { title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？", href: "/geo/js-rendering-empty-shell" },
  { title: "要讓 AI 引用你的內容，該怎麼表態？", href: "/geo/content-signals-declare" },
  { title: "結構化資料要補哪些欄位，AI 才認得出你是誰？", href: "/geo/schema-priority" },
];

export default function LlmsTxtArticlePage() {
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
              llms.txt 要怎麼寫，AI 才看得懂你的網站？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              llms.txt 是專門寫給 AI 看的網站導覽，跟給人看的網站地圖是兩回事。llmstxt.org
              訂了一套標準格式，健檢不只看「有沒有」，還會看「寫得好不好」。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-07-08</span>
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
              只給「有沒有部署 llms.txt」這種是非題沒有太大參考價值——一個檔案裡只放一行字，跟一份寫清楚標題、
              摘要、重要頁面連結的導覽，都算「有」，但對 AI 的幫助天差地遠。健檢實際解析檔案內容，
              把標題、摘要、連結清單都抓出來給你看，不是只信一個分數。
            </p>

            <h2 className="mt-11 text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              llmstxt.org 建議的格式是：一個 # 開頭的標題、一個 &gt; 開頭的摘要引言，接著用 markdown
              連結列出重要頁面，每個連結最好還附一句說明。健檢會照這個格式檢查：內容少於 100
              字或完全沒有連結，直接判定「內容單薄」；標題、摘要、連結（至少 2 個）三者缺一樣，
              也判定「內容單薄」並列出缺了什麼。
            </p>
            <div className="excerpt whitespace-pre-wrap">
              {"# 積木媒體行銷\n> 台北的 SEO 與 AI SEO 團隊，提供關鍵字優化、網站架構、內容與外部連結服務。\n\n- [服務項目](https://stack.com.tw/services): 我們提供的完整服務清單\n- [關於我們](https://stack.com.tw/about): 團隊背景與經營理念"}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              就算格式該有的都有，健檢還會多看一層：連結有沒有附說明。只有網址跟標題，AI
              還是得自己猜這個連結底下是什麼內容；附一句話講清楚，才是真的幫上忙，這是健檢判定「格式完整」的最後一道門檻。
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
              不用列出全站每一頁，挑出你最希望 AI 認識、最常被問到的幾個頁面就好——通常是服務／產品介紹、
              關於我們、常見問題這幾類。連結說明盡量具體，「服務項目」不如「SEO 關鍵字優化、網站架構調整、
              內容與外部連結的完整服務清單」來得有用。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，這一項應該從 <span className="t-fail">沒有</span> 或{" "}
              <span className="t-warn">內容單薄</span> 變成 <span className="t-ok">格式完整</span>
              ，健檢會把解析出來的標題、摘要跟每個連結展開給你看，可以直接核對內容有沒有寫對。
            </p>
            <p className="note">
              （llms.txt 目前還沒有任何 AI 業者正式承諾一定會讀取，這是一個社群提出、還在推廣中的慣例。
              寫了不保證被用，但不寫，至少確定沒有這個管道。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">llms.txt</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                沒有 / 內容單薄 / 格式完整
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
