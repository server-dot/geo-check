import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "結構化資料要補哪些欄位，AI 才認得出你是誰？｜AI 搜尋能見度健檢",
  description: "Organization、LocalBusiness、Product、Article 四種型別各自有幾個關鍵欄位，缺了哪些、常見的標記錯誤有哪些。",
};

const STEPS = [
  { name: "確認網站有沒有部署 JSON-LD（原始碼找 <script type=\"application/ld+json\">）", tag: "5 分鐘" },
  { name: "依頁面性質補上 Organization、LocalBusiness、Product 或 Article", tag: "工程師" },
  { name: "把缺漏的關鍵欄位補齊，圖片／Logo 網址一律用完整網址，不要用相對路徑", tag: "工程師" },
];

const RELATED = [
  { title: "llms.txt 要怎麼寫，AI 才看得懂你的網站？", href: "/geo/llms-txt-format" },
  { title: "AI 為什麼引用競爭對手，不是你？", href: "/geo/ai-cites-competitor" },
  { title: "健檢顯示「無法判定」，是防火牆擋住了嗎？", href: "/geo/waf-false-unknown" },
];

export default function SchemaArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 pb-[52px] pt-[60px]">
          <div className="k">POST</div>
          <div>
            <div className="mono text-[11.5px] text-ink3">
              <Link href="/geo">GEO 知識</Link> / 結構化資料
            </div>
            <h1 className="mt-4 max-w-[22em] text-[44px] leading-[1.18] tracking-[-0.035em]">
              結構化資料要補哪些欄位，AI 才認得出你是誰？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              JSON-LD 是網頁裡專門寫給機器看的一段資料，比 AI 自己去猜正文裡誰是品牌名、誰是價格準確得多。
              健檢不只看有沒有部署，會逐欄位核對完不完整。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-07-25</span>
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
              健檢只對四種業務上有意義的型別做逐欄位檢查，其餘像 WebPage、BreadcrumbList
              這類技術性容器節點沒有「必填欄位」可查，不虛構規則。這四種型別各自對到不同的業務性質：
            </p>

            <h2 className="mt-11 text-[30px]">四種型別，各自要補的欄位</h2>
            <div className="excerpt whitespace-pre-wrap">
              {"Organization（幾乎每個網站都該有）\n  名稱、網址、Logo 圖片網址、電話、Email、簡介、社群/外部連結\n\nLocalBusiness 家族（有實體門市或可到訪地點）\n  地址、電話、營業時間、圖片網址\n\nProduct（商品頁）\n  售價/庫存 (offers)、圖片\n\nArticle（文章頁）\n  作者、發布日期"}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              最常見的兩個標記錯誤：圖片／Logo 網址寫成相對路徑（例如 /img/logo.png），Google
              跟 AI 爬蟲的規範都要求絕對網址（http(s):// 開頭），相對路徑爬蟲抓不到，等於沒填；
              另一個是 LocalBusiness 的營業時間漏填，這欄位很容易被當成「加分項」跳過，但它是 AI
              判斷「這是不是一間可以實際去的店」的關鍵訊號。
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
              純線上服務不用勉強加 LocalBusiness——這個型別是給有實體可到訪地點的商家用的加分標籤，
              沒有實體門市硬加反而是錯誤資訊。健檢的判定也會考慮這一點：查不到地址時只會給提醒（可優化），
              不會當成扣分的硬性缺失。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，「結構化資料」這一項會列出每個型別欄位完整度，
              健檢報告的結構化資料區塊會依你的業務型別各給一張卡片，逐欄位標示哪些已經填、哪些還缺，
              不用自己一個一個對照 schema.org 文件。
            </p>
            <p className="note">
              （欄位完整只代表機器讀得懂；內容本身寫得好不好、有沒有吸引力，還是要靠人工複核。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">結構化資料 (Schema)</p>
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

      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
          <h2 className="max-w-[20em] text-[34px] tracking-[-0.035em]">看看你的結構化資料缺了哪些欄位。</h2>
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
