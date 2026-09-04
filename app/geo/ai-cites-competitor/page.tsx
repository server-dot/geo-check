import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "AI 為什麼引用競爭對手，不是你？｜AI 搜尋能見度健檢",
  description: "AI 答得出你的產業，引用的卻是別人。從實際去問 AI 的結果反推缺的是內容、權威還是一致性。",
};

const STEPS = [
  { name: "把健檢裡「AI 認不認得你」的原始回答跟引用來源整段讀完，不要只看有沒有 ★", tag: "10 分鐘" },
  { name: "打開 AI 實際引用的那個競爭對手網址，比對它寫了什麼、你的網站沒寫", tag: "15 分鐘" },
  { name: "把缺的內容補上、把品牌名跟服務項目講得更明確、直接、一致", tag: "工程師" },
];

const RELATED = [
  { title: "結構化資料要補哪些欄位，AI 才認得出你是誰？", href: "/geo/schema-priority" },
  { title: "llms.txt 要怎麼寫，AI 才看得懂你的網站？", href: "/geo/llms-txt-format" },
  { title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？", href: "/geo/js-rendering-empty-shell" },
];

export default function AiCitesCompetitorArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 pb-[52px] pt-[60px]">
          <div className="k">POST</div>
          <div>
            <div className="mono text-[11.5px] text-ink3">
              <Link href="/geo">GEO 知識</Link> / 品牌與權威
            </div>
            <h1 className="mt-4 max-w-[22em] text-[44px] leading-[1.18] tracking-[-0.035em]">
              AI 為什麼引用競爭對手，不是你？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              同一個問題，AI 引用了同業的頁面。它知道這個產業、知道該問誰，只是不是從你這裡知道的——這比
              「AI 完全不認識你」更值得研究，因為問題不在能不能被讀到，而在被讀到之後為什麼沒被選。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-08-11</span>
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
              健檢會把偵測到的品牌名稱，實際送去問會即時上網搜尋的 AI 模型（Perplexity 跟 ChatGPT
              各問一次，兩者的索引跟排序邏輯不同，只測一家會誤以為「AI」是單一個東西），
              把原話跟引用來源原封不動貼給你看。指向你自己網域的引用會加上 ★；如果 AI 答得出你的產業，
              但引用連結全部指向別人，就是這篇要處理的情況。
            </p>

            <h2 className="mt-11 text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              判定字彙只有兩種：★ 引用自己，或者沒有引用你。後者不代表 AI 不知道這個產業，
              也不代表你做錯了什麼技術設定——健檢前面幾項（爬蟲存取、內容可讀、結構化資料）全綠燈，
              一樣可能被判定「沒有引用你」，因為這一項回答的是另一個問題：AI 讀得到你，但選不選你。
            </p>
            <div className="report-preview">
              {"提問：台北推薦的 SEO 行銷公司有哪些？\n引用來源：3 筆\n  - competitor-a.com/seo-service（非本站）\n  - competitor-b.com/blog/seo-guide（非本站）\n  - reviews.example.com/seo-agencies（非本站）\n判定：沒有引用你"}
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
              關鍵在「反推」：AI 引用的那幾個競爭對手頁面，通常都做對了一些具體的事——講清楚服務範圍、
              有明確的定價或案例、品牌名稱在頁面裡反覆一致地出現。把那幾頁實際打開來看，
              比憑空猜「內容要更好」有用得多。常見的缺口是三種：內容真的沒寫到那個主題、
              網站有內容但權威訊號不夠（沒有作者、沒有第三方佐證）、或者品牌名稱在全站用法不一致，
              AI 抓不準要對應到哪個名字。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link>，用同一組關鍵字重新查一次「關鍵字 AI 能見度」——這一項可以自己輸入想搶的主題，
              不用等重跑整份健檢。AI 的回答會依當下搜尋結果變動，同一個問題隔幾天問結果可能不一樣，
              看的是有沒有往「開始出現在候選名單裡」的方向移動，不用預期一次就衝到第一名。
            </p>
            <p className="note">
              （這只代表這幾個引擎當下的回答，不是「所有 AI 都這樣」；沒設 API key、抓不到品牌名稱、
              或呼叫失敗時該引擎會回空，不會硬湊一個答案出來。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">AI 認不認得你（實際去問）</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                ★ 引用自己 / 沒有引用你
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
