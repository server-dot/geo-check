import type { Metadata } from "next";
import { PROBED_BOT_COUNT } from "@/lib/geo-ai-crawlers";
import { DEEP_AUDIT_KEYS } from "@/lib/geo-audit-rules";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";
import FaqAccordion from "@/components/marketing/FaqAccordion";
import FaqJsonLd from "@/components/seo/FaqJsonLd";

export const metadata: Metadata = {
  title: "判斷標準",
  description: "GEO、SEO 健檢各檢查什麼、怎麼判定、SEO 總分怎麼算、五個分類各看哪些項目。",
  alternates: { canonical: "/scoring" },
};

const LAYERS = [
  {
    name: "AI 推不推薦你（推薦題）",
    what: "你勾的最多三題，三家 AI（Perplexity、ChatGPT、Google AI 摘要）的回答點名推薦了誰",
    how: "先列出網友在論壇問過的題目和 AI 產生的題目（都不含品牌名），你勾完才實際去問",
    verdicts: "推薦你 / 沒推薦你 / 查詢失敗",
  },
  {
    name: "未被推薦原因",
    what: "你網站最接近這一題的頁、AI 推別人的理由原文、可以補什麼",
    how: "拆出題目的每個需求，逐條到頁面上找原文",
    verdicts: "初步判斷，不是保證",
  },
  {
    name: "競爭對手分析",
    what: "AI 推過的業者各站在哪個市場位置",
    how: "只挑同類同業；描述不夠判斷時不畫圖",
    verdicts: "現況描述，不評分",
  },
  {
    name: "品牌輪廓與評價",
    what: "直接用品牌名問三家 AI：你是誰、評價如何",
    how: "附回答原文與引用連結；回答認成別人時會標出來",
    verdicts: "正面 / 負面，附原句",
  },
  {
    name: "AI 參考網站、網友相關問題",
    what: "AI 回答引用的網頁，以及 Dcard、PTT、Threads、Mobile01、FB 社團的相關問題",
    how: "依網站類型整理，都連到原文",
    verdicts: "現況描述，不評分",
  },
  {
    name: "網站總體健檢：AI 讀取",
    what: "回答客人的 AI（ChatGPT 搜尋、ChatGPT 讀網頁、Perplexity）有沒有被擋、有沒有 llms.txt",
    how: "讀 robots.txt 的規則，再用各家名稱實際連一次。抓資料訓練 AI 的程式被擋只註明，不算問題。我們不是從它們官方的網路連，實際可能不同",
    verdicts: "進得來 / 被擋 / 無法判定",
  },
  {
    name: "網站總體健檢：無障礙",
    what: "依 WCAG 2.2 檢查全站（上限 1,000 頁；翻譯頁、設定不收錄、重複、功能頁不查），共 11 項，例如圖片說明、按鈕名稱、能不能放大",
    how: "只測看原始碼就能判斷的項目；顏色對比、鍵盤操作等要人工看。不等於符合 WCAG 或取得標章",
    verdicts: "只列出問題 / 無法判定",
  },
  {
    name: "SEO 健檢：關鍵字排名",
    what: "你勾的最多三個關鍵字，在台灣 Google 第一頁排第幾",
    how: "拿你最接近的頁跟前面的同業比，寫出可以補的內容",
    verdicts: "第幾名 / 第一頁沒有你",
  },
  {
    name: "SEO 健檢：多頁深度健檢",
    what: `結構化資料、技術與索引、內容與追蹤、品牌與權威等 ${DEEP_AUDIT_KEYS.length} 項`,
    how: "多頁取樣，每項附上量到的值，可查看有問題的頁面",
    verdicts: "正常 / 可優化 / 需處理",
  },
];

const VERDICTS = [
  { label: "🟢 正常", rule: "量到的值符合標準，不需要動", example: "正常" },
  { label: "🟡 可優化", rule: "能用，但還有可以補的地方", example: "可優化" },
  { label: "🔴 需處理", rule: "會影響搜尋引擎或 AI 讀取你的內容", example: "需處理" },
  { label: "⚪ 無法判定", rule: "我們讀不到答案，會告訴你怎麼自己確認", example: "無法判定" },
];

const CATEGORIES = [
  { name: "AI 可達性", contains: `爬蟲存取 ${PROBED_BOT_COUNT} 項、內容使用授權（Content Signals）、llms.txt`, count: `${PROBED_BOT_COUNT + 2} 項` },
  { name: "內容與追蹤", contains: "重複內容、引用外部來源、流量分析工具、每頁標題與描述", count: "4 項" },
  { name: "結構化資料", contains: "結構化資料完整度、店家資訊標示", count: "2 項" },
  {
    name: "技術與索引",
    contains: "網站地圖、robots.txt、收錄設定、大小標題、llms.txt、失效頁面、手機排版、頁面位置標示、網站層級、內部連結、首頁、圖片說明與格式",
    count: "14 項",
  },
  { name: "品牌與權威", contains: "網站可信度、關於我們、聯絡方式", count: "3 項" },
];

const FAQS = [
  {
    q: "「無法判定」是什麼意思？",
    a: "有些情況我們讀不到答案，例如站方的 WAF 把我們的請求一起擋掉。這時候會標成 ⚪ 無法判定，並告訴你怎麼自己確認。",
  },
  {
    q: "這跟一般 SEO 檢測有什麼不同？",
    a: "除了 SEO 該看的東西，我們會用 GPTBot、ClaudeBot 等爬蟲的身分實際請求你的頁面，還會實際去問三家 AI 推薦誰、怎麼說你、參考了哪些網站。",
  },
  {
    q: "可優化為什麼只算半分，不是不給分？",
    a: "可優化代表「能用，但體質不夠好」——AI 讀得到，只是會讀得比較吃力或判斷得比較沒把握，跟需處理的「直接卡住」不一樣。所以算 0.5 分，需處理算 0 分。這是目前採用的算法，之後調整會同步改這一頁。",
  },
  {
    q: "AI 沒推薦我，會扣分嗎？",
    a: "不會。GEO 健檢不打總分，SEO 總分也不看 AI 推不推薦你。那是當下的現況快照，背後的原因可能是內容深度、品牌知名度、外部提及——把它折成分數，等於暗示「你補了 llms.txt 就會被推薦」，那是假因果。",
  },
  {
    q: "我 SEO 做得好，為什麼分數不高？",
    a: "總分是五個分類通過率的平均，看的是網站設定完不完整，不看 Google 排名。排名好的網站也可能缺結構化資料或 llms.txt。",
  },
  {
    q: "推薦題是誰決定的？",
    a: "你自己勾。健檢時會先從你的首頁推出客戶會帶著什麼需求，去 Dcard、PTT、Threads、Mobile01、FB 社團找網友真的問過、在找推薦的問題全部列出來（附原文連結），模型再參考這些網友問題和你的首頁產生 10 題，另外從你首頁的商品分類抓 5 個短關鍵字（像「私密清潔凝露推薦」）。你從裡面勾最多 3 題、也可以自己寫，按「問 AI」才會真的去問。題目不能出現你的品牌名——要問的是這一類，不是這一家。網友問過只代表有人這樣問，不代表很多人這樣問，這不是搜尋量。",
  },
  {
    q: "過幾天重跑，分數會不一樣嗎？",
    a: "會。頁面改了、標記補了，分數就會動。另外深度健檢是多頁取樣，這次取樣到的頁面和上次不同時，總分不適合直接相比，看個別項目的變化比較準。",
  },
  {
    q: "我不懂技術，看得懂報告嗎？",
    a: "每一區先給結果和一句話，點開才是細節。要動到程式的部分，可以把技術細節貼給工程師。",
  },
];

export default function ScoringPage() {
  return (
    <div className="marketing">
      <Masthead active="scoring" />

      <SubpageHero
        k="STD"
        crumb="判斷標準"
        eyebrow="判斷標準 · HOW WE JUDGE"
        heading={
          <>
            每一項都是<mark className="lime-highlight">實測結果。</mark>
          </>
        }
        lede="GEO 健檢實際去問三家 AI，不打總分；SEO 健檢查 Google 排名、跑多頁深度健檢，有 0–100 的總分。讀不到答案時標成無法判定。"
      />

      <Section k="01" eyebrow="WHAT WE CHECK" title="檢查什麼">
        <p className="prose mt-4">前七列是 GEO 健檢，後兩列是 SEO 健檢，兩份分開跑。</p>
        <table className="mt-[30px]">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>項目</th>
              <th style={{ width: "44%" }}>我們查什麼</th>
              <th style={{ width: "34%" }}>判定字彙</th>
            </tr>
          </thead>
          <tbody>
            {LAYERS.map((l) => (
              <tr key={l.name}>
                <td className="item">{l.name}</td>
                <td>
                  {l.what}
                  <span className="fix">{l.how}</span>
                </td>
                <td>{l.verdicts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section k="02" eyebrow="THREE VERDICTS" title="SEO 健檢的三種判定，加一種不判定">
        <ul className="mt-[26px] list">
          {VERDICTS.map((v) => (
            <li key={v.label} className="list-row">
              <div className="nm">{v.label}</div>
              <div className="why">{v.rule}</div>
              <div className="st">{v.example}</div>
            </li>
          ))}
        </ul>
        <div className="report-preview">
          {"⚪ 無法判定：robots.txt 回應 403\n這不代表你的網站對 AI 開放——很可能有 robots.txt 但我們讀不到。\n請直接在瀏覽器打開 https://你的網域/robots.txt 確認。"}
        </div>
        <p className="note">設定允許但實際連線被擋，不會算成進得來。</p>
      </Section>

      <Section k="03" eyebrow="THE SCORE" title="SEO 總分怎麼算">
        <p className="prose mt-4">
          總分不是扣分制，是五個分類各自的通過率平均。每個分類權重相同——不會因為某個分類底下的檢測項目比較多，就讓那個分類主宰總分。
        </p>
        <div className="report-preview">
          {"每個分類的通過率 =（正常 × 1 ＋ 可優化 × 0.5）÷ 該分類項目數 × 100\n總分 = 五個分類通過率的平均，四捨五入到整數\n\n例：95、63、75、82、83 →（95＋63＋75＋82＋83）÷ 5 = 79.6 → 80 分"}
        </div>
        <p className="note">
          報告裡會把這一行算式直接印出來，你可以自己對。需處理的項目算 0 分、可優化算半分——可優化代表「能用但體質不好」，不是完全不通過。
        </p>
        <p className="prose mt-[26px]">等第只是給總分一個講法，門檻是我們自己訂的區間，沒有業界標準可以對照：</p>
        <ul className="mt-[26px] list">
          <li className="list-row"><div className="nm">A 級・優異</div><div className="why">五個分類大致都通過，剩下的是細節</div><div className="st">85–100</div></li>
          <li className="list-row"><div className="nm">B 級・良好</div><div className="why">主要的路都通，有幾個分類明顯拖後腿</div><div className="st">70–84</div></li>
          <li className="list-row"><div className="nm">C 級・普通</div><div className="why">有一半左右的項目沒過，要排優先序處理</div><div className="st">55–69</div></li>
          <li className="list-row"><div className="nm">D 級・待加強</div><div className="why">多數項目沒過，AI 讀你的內容會處處卡住</div><div className="st">40–54</div></li>
          <li className="list-row"><div className="nm">F 級・不合格</div><div className="why">基本的可達性或內容就不成立</div><div className="st">0–39</div></li>
        </ul>
        <p className="note">
          AI 推不推薦你不計入總分。那是現況快照，不是你的網站做錯了什麼——把它折成分數會變成假因果。
        </p>
      </Section>

      <Section k="04" eyebrow="FIVE CATEGORIES" title="深度健檢的五個分類">
        <p className="prose mt-4">{DEEP_AUDIT_KEYS.length} 項深度健檢歸進後四個分類，AI 可達性另外算，總覽圖與雷達圖用的是同一套分類。通過率算法：（正常 × 1 ＋ 可優化 × 0.5）÷ 項目數，四捨五入。</p>
        <ul className="mt-[26px] list">
          {CATEGORIES.map((c) => (
            <li key={c.name} className="list-row">
              <div className="nm">{c.name}</div>
              <div className="why">{c.contains}</div>
              <div className="st">{c.count}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section k="FAQ" eyebrow="FAQ" title="常見問題" noBorder>
        <FaqJsonLd items={FAQS} />
        <FaqAccordion items={FAQS} defaultOpen={0} />
      </Section>

      <Footer />
    </div>
  );
}
