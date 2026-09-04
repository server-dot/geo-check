import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "要讓 AI 引用你的內容，該怎麼表態？｜AI 搜尋能見度健檢",
  description: "Content Signals 是寫在 robots.txt 裡的新欄位，回答的是「抓到之後可以拿來幹嘛」，跟能不能抓進來是兩回事。三個欄位是什麼、要不要表態。",
};

const STEPS = [
  { name: "決定三個問題的答案：要不要被搜尋索引、要不要當 AI 回答的來源、要不要被拿去訓練模型", tag: "5 分鐘" },
  { name: "在 robots.txt 的 * 群組底下加一行 Content-Signal", tag: "工程師" },
  { name: "格式：Content-Signal: search=yes, ai-input=yes, ai-train=no（依實際決定調整）", tag: "5 分鐘" },
];

const RELATED = [
  { title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？", href: "/geo/js-rendering-empty-shell" },
  { title: "llms.txt 要怎麼寫，AI 才看得懂你的網站？", href: "/geo/llms-txt-format" },
  { title: "AI 為什麼引用競爭對手，不是你？", href: "/geo/ai-cites-competitor" },
];

export default function ContentSignalsArticlePage() {
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
              要讓 AI 引用你的內容，該怎麼表態？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              Allow / Disallow 講的是「能不能抓」；Content Signals 講的是「抓到之後可以拿來幹嘛」。
              爬蟲進得來，不代表你同意它把內容拿去訓練模型，或當成 AI 回答的來源。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-06-19</span>
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
              Content Signals 是 Cloudflare 在 2025 年提出、寫在 robots.txt 裡的新欄位，現在已經隨
              Cloudflare 的代管設定鋪到數百萬個網域，IETF 的 AIPREF 工作組也在把它標準化。它拆成三個獨立的
              問題，分別表態：
            </p>
            <div className="excerpt whitespace-pre-wrap">
              {"Content-Signal: search=yes, ai-input=yes, ai-train=no\n\nsearch    ：建立搜尋索引、提供搜尋結果（不含 AI 生成摘要）\nai-input  ：把內容當成 AI 回答的參考來源（AI 摘要、RAG）\nai-train  ：把內容拿去訓練或微調 AI 模型"}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              沒寫這一行，健檢會判定成「未表態」，不是「不允許」——但對很多網站經營者來說，這三件事的答案並不一樣：
              樂意被搜尋到、也樂意被 AI 回答引用，但不見得想被拿去訓練別人的模型。不寫清楚，這個差異就表達不出來，
              只能靠對方自己解讀。
            </p>

            <h2 className="mt-11 text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              健檢會解析 robots.txt 裡萬用（*）群組底下的 Content-Signal 字串，原文照貼給你看，並把三個欄位的值分別列出來——
              yes、no，或者沒寫（未表態）。判定字彙是「允許 / 不允許 / 未表態」，這三種都不是扣分項，
              健檢只是誠實反映你有沒有表態，要不要表態、表態成什麼是你自己的決定。
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
              三個欄位可以分開決定，不用全部一致。例如很多內容型網站會選擇 search=yes、ai-input=yes（樂意被引用），
              但 ai-train=no（不想被拿去訓練模型）——這組合在 Content Signals 出現之前，
              robots.txt 的 Allow/Disallow 語法完全表達不出來。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，「內容使用授權（Content Signals）」這一項的三個欄位
              應該從 <span className="t-gray">未表態</span> 變成你設定的值，健檢也會把解析出來的原文照貼出來，
              方便你核對格式有沒有寫對。
            </p>
            <p className="note">
              （這個欄位目前還在標準化過程中，不是所有 AI 業者都保證會遵守；表態是把你的立場寫清楚，
              不是技術上的強制攔截——真正擋不擋得住，仍然要靠 Allow/Disallow 跟後面 WAF 的設定。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">內容使用授權（Content Signals）</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                允許 / 不允許 / 未表態
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
