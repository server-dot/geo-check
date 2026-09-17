import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";
import Breadcrumb from "@/components/seo/Breadcrumb";
import ArticleJsonLd from "@/components/seo/ArticleJsonLd";
import { findPost } from "@/lib/geo-posts";
import { ORG } from "@/lib/site";

export const metadata: Metadata = {
  title: "標題與描述要怎麼寫，AI 引用你的時候才不會講錯？",
  description:
    "每一頁的 <title> 跟 meta description，Google 跟 AI 各拿去做什麼。留空、太長、每頁都一樣各會出什麼事，健檢怎麼量，怎麼修。",
  alternates: { canonical: "/geo/title-description-for-ai" },
};

const post = findPost("/geo/title-description-for-ai");

const STEPS = [
  { name: "先處理標題留空的頁面：從健檢的逐頁清單抓出來，每頁補一句「這頁在講什麼」", tag: "10 分鐘" },
  { name: "標題太長的頁面：主題放前面、品牌名放最後用「｜」或「－」隔開，全形字控制在 30 字內", tag: "30 分鐘" },
  { name: "描述留空的頁面：用一到兩句話寫這頁給誰看、看完能得到什麼，80 字內", tag: "1 小時" },
  { name: "商品頁、文章頁這類由系統產生的頁面，在 CMS 裡設標題與描述的樣板，不要手動一頁一頁補", tag: "工程師" },
];

const RELATED = [
  { title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？", href: "/geo/js-rendering-empty-shell" },
  { title: "結構化資料要補哪些欄位，AI 才認得出你是誰？", href: "/geo/schema-priority" },
  { title: "AI 為什麼引用競爭對手，不是你？", href: "/geo/ai-cites-competitor" },
];

// 資料來源一律用官方第一手文件，日期是文件上標的更新日或我們查閱的日期。
const SOURCES = [
  { name: "Google Search Central：Influencing your title links in search results", href: "https://developers.google.com/search/docs/appearance/title-link", date: "2025-12-10 更新" },
  { name: "Google Search Central：Control your snippets in search results", href: "https://developers.google.com/search/docs/appearance/snippet", date: "2026-04-20 更新" },
  { name: "OpenAI Help Center：Publishers and Developers – FAQ", href: "https://help.openai.com/en/articles/12627856-publishers-and-developers-faq", date: "2026-08 更新" },
  { name: "Bing Webmaster Guidelines（含 Copilot 與 grounding 段落）", href: "https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a", date: "2026-09-17 查閱" },
];

export default function TitleDescriptionArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />
      <ArticleJsonLd post={post} description={metadata.description ?? post.excerpt} />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 md:grid-cols-[56px_1fr] gap-x-6 px-5 md:px-10 pb-10 md:pb-[52px] pt-8 md:pt-[60px]">
          <div className="k hidden md:block">POST</div>
          <div>
            <Breadcrumb items={[{ name: "首頁", href: "/" }, { name: "GEO 知識", href: "/geo" }, { name: post.cat }]} />
            <h1 className="mt-4 max-w-[22em] text-[30px] md:text-[44px] leading-[1.18] tracking-[-0.035em]">
              標題與描述要怎麼寫，AI 引用你的時候才不會講錯？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              每一頁的 &lt;title&gt; 跟 meta description，Google 拿去組搜尋結果那兩行字，ChatGPT
              有時候只拿這個來介紹你的頁面。留空、太長、每頁都一樣，各會出不同的事。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>{post.date}</span>
              <span>{ORG.name}</span>
              <span>約 {post.readMinutes} 分鐘</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-line">
        <div className="reveal mx-auto grid max-w-[1120px] grid-cols-1 md:grid-cols-[56px_1fr_220px] gap-x-6 px-5 md:px-10 py-12 md:py-[72px]">
          <div className="k hidden md:block">01</div>

          <div className="max-w-[34em]">
            <p className="text-[15.5px] leading-[1.75] text-ink2">
              深度健檢跑下來，這一項亮黃燈的網站最多。常見的樣子：首頁的標題描述有人認真寫過，
              商品頁跟文章頁是系統自動長出來的，標題就是商品名、描述空白；或者整站每一頁都掛同一句公司簡介。
              網站上線之後沒人回頭看這些，就一直放著。
            </p>

            <h2 className="mt-11 text-[24px] md:text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              健檢會把爬到的每一頁的 &lt;title&gt; 跟 meta description 抓出來，逐頁列出哪一頁哪裡有問題：
            </p>
            <div className="report-preview">
              {"每頁的標題與描述完不完整　可優化\n40 頁裡有 9 頁要修：標題留空 0 頁、太長 4 頁；描述留空 5 頁、太長 0 頁。\n\n/products/item-2031\n  描述留空\n/blog/2026-spring-campaign\n  標題太長（估算 740px，安全上限 600px，搜尋結果會被切掉）\n/about\n  描述留空"}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              三種狀況：
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              <strong>標題留空。</strong>Google 會自己拼一個，材料是頁面上的主標題、指向這頁的連結文字、
              og:title，拼出來的不一定是你要的。ChatGPT 的做法寫在 OpenAI 的出版商說明裡：沒有完整爬過、
              但判斷跟問題相關的頁面，可能「只顯示連結跟頁面標題」。標題留空，使用者看到的就是一條網址。
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              <strong>標題太長。</strong>Google 沒有訂字數上限，只說「會依裝置寬度截斷」。所以限制是像素寬度，
              不是字數：中文字比英文字寬一倍，30 個中文字就頂到搜尋結果一行的寬度了。被切掉的是最後面那段，
              品牌名放後面就會不見。
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              <strong>描述留空或太長。</strong>Google 的文件說摘要「主要從頁面內容自動產生」，
              meta description 只有在「比頁面其他部分更能描述這一頁」時才會用。描述影響不了排名，
              它的用處是讓你自己決定搜尋結果那兩行字寫什麼；留空，Google 就從內文挑一段，挑到哪段你管不到。
            </p>

            <h2 className="mt-11 text-[24px] md:text-[30px]">為什麼 AI 也在乎</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              Bing 是 Copilot 的索引，也是 ChatGPT 搜尋用的搜尋供應商之一。它現在這版站長指南把 AI
              答案（文件裡叫 grounding）跟傳統搜尋放在同一套規則下，第 13 條寫：標題與描述「缺漏、重複或過短」，
              會降低被收錄、排名，以及被 grounding 結果與引用選中的資格。同一份文件還提到，頁面設了 nocache
              的話，Copilot 只能用「網址、標題跟摘要」來引用你，AI 手上關於這頁的資料就只剩這些。
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              Bing 第 17 條要求「標題、主標題、內容意圖一致」，Google 的標題文件列了同樣的事：&lt;title&gt;
              跟頁面上的 h1 講不同的東西、每頁都塞同一段品牌口號、標題語言跟正文語言不同，Google 會改寫你的標題。
              ChatGPT、Perplexity 沒有公開這麼細的規則，讀的是同一份 HTML。
            </p>

            <h2 className="mt-11 text-[24px] md:text-[30px]">健檢怎麼判</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              標題長度用像素寬度估，不用字數：全形字算 20px、半形字算 10px，超過 600px 標「太長」。
              「30 字」「60 字元」這種門檻對中英混排的標題會誤判，像素估法不會。描述以 80 個字為門檻，留空另外算。
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              判定看比例，一頁出錯不會整項變紅：標題留空的頁面達一成以上，或有問題的頁面超過一半，
              才是 <span className="t-fail">需處理</span>；其餘有問題的情況是 <span className="t-warn">可優化</span>。
              留空跟太長分開計，因為留空是這一頁沒有自我介紹，太長只是被切掉一截。
            </p>

            <h2 className="mt-11 text-[24px] md:text-[30px]">怎麼修</h2>
            <div className="mt-[18px]">
              {STEPS.map((s) => (
                <div key={s.name} className="list-row list-row--step">
                  <div className="nm">{s.name}</div>
                  <div className="st">{s.tag}</div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              寫法的標準：一個沒看過這頁的人，光看標題跟描述就知道這頁在講什麼、跟隔壁那頁差在哪。
              「首頁｜XX 公司」「關於我們」這種不算，換成任何一家公司都成立。主題放前面、品牌放後面，
              因為截斷從尾巴開始切，切掉品牌名總比切掉主題好。
            </p>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              幾百頁的商品站不用手寫，Google 的文件寫明資料庫驅動的網站可以用程式產生描述。
              樣板要帶進每頁不同的資訊（商品名、規格、價格、適用對象），每頁套同一句等於沒寫。
            </p>

            <h2 className="mt-11 text-[24px] md:text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，「每頁的標題與描述完不完整」的逐頁清單會變短，
              全部修完就是 <span className="t-ok">正常</span>。要看 Google 實際顯示什麼，用 Search Console
              的網址檢查工具；AI 那邊拿一個跟這頁相關的問題去問 ChatGPT 搜尋或 Perplexity，
              看引用卡片上的標題是不是你寫的那一個。
            </p>
            <p className="note">
              （標題跟描述寫好，AI 引用你的時候不會講錯；要不要引用你，看的是內容本身跟品牌權威，
              是另外幾項檢測在管的事。）
            </p>

            <div className="k mt-11">參考來源</div>
            <div className="mt-3.5 grid gap-2.5 text-[13.5px]">
              {SOURCES.map((s) => (
                <div key={s.href}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-ink2">
                    {s.name}
                  </a>
                  <span className="mono ml-2 text-[11.5px] text-ink3">{s.date}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">每頁的標題與描述完不完整</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                正常 / 可優化 / 需處理
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
