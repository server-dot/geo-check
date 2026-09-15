import type { Metadata } from "next";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";
import FaqAccordion from "@/components/marketing/FaqAccordion";
import FaqJsonLd from "@/components/seo/FaqJsonLd";

export const metadata: Metadata = {
  title: "判斷標準",
  description: "七個檢測層、三種判定加一種不判定、總分怎麼算、深度健檢的五個分類。",
  alternates: { canonical: "/scoring" },
};

const LAYERS = [
  {
    name: "AI 爬蟲的存取權限",
    what: "GPTBot、ClaudeBot、PerplexityBot 等 8 家爬蟲的實際請求結果",
    how: "讀 robots.txt 的規則，再用各家 UA 實際發一次請求對照",
    verdicts: "可存取 / 被擋 / 無法判定 / 政策允許但實測被擋",
  },
  {
    name: "AI 讀到的內容",
    what: "關掉 JavaScript 後量得到的可讀字數、title、h1、JSON-LD 型別",
    how: "字數偏少會標成內容單薄，並列出腳本數與 HTML 長度作為證據",
    verdicts: "正常 / 內容單薄",
  },
  {
    name: "內容使用授權（Content Signals）",
    what: "search、ai-input、ai-train 三項的表態",
    how: "解析 robots.txt 裡的 Content-Signal 字串，原文照貼",
    verdicts: "允許 / 不允許 / 未表態",
  },
  {
    name: "llms.txt",
    what: "有沒有這個檔、格式完不完整、裡面的連結解不解得開",
    how: "解析標題、摘要與連結清單，可展開看實際內容",
    verdicts: "沒有 / 內容單薄 / 格式完整",
  },
  {
    name: "AI 認不認得你（實際去問）",
    what: "Perplexity 與 ChatGPT 對你的品牌的回答與引用來源",
    how: "實際送出提問，原話與引用連結原封不動貼給你，指向你自己網域的加 ★",
    verdicts: "★ 引用自己 / 沒有引用你",
  },
  {
    name: "AI 推不推薦你（自動問的推薦題）",
    what: "三個「找這類服務的人會問 AI 的問題」，以及各引擎回答裡點名推薦了誰",
    how: "先讓模型讀首頁猜出三個不含品牌名的推薦題，實際問過後把被點名的對象整理成名單",
    verdicts: "★ 引用自己 / 沒有引用你",
  },
  {
    name: "多頁 SEO + GEO 深度健檢",
    what: "結構化資料、索引與技術、網站健康、外部權威等 21 項",
    how: "多頁取樣，每項附上量到的值與建議做法、可查看有問題的頁面",
    verdicts: "正常 / 可優化 / 需處理",
  },
];

const VERDICTS = [
  { label: "🟢 正常", rule: "量到的值符合標準，不需要動", example: "正常" },
  { label: "🟡 可優化", rule: "能用，但體質不夠好，AI 引用你的機率會被拉低", example: "可優化" },
  { label: "🔴 需處理", rule: "會直接讓 AI 讀不到或不引用你", example: "需處理" },
  { label: "⚪ 無法判定", rule: "我們讀不到答案，會告訴你怎麼自己確認", example: "無法判定" },
];

const CATEGORIES = [
  { name: "AI 可達性", contains: "爬蟲存取 8 項 + Content Signals + llms.txt", count: "10 項" },
  { name: "內容與追蹤", contains: "重複內容、引用外部來源、流量分析工具、每頁標題與描述", count: "4 項" },
  { name: "結構化資料", contains: "結構化資料完整度、店家資訊標示", count: "2 項" },
  {
    name: "技術與索引",
    contains: "網站地圖、robots.txt、收錄設定、大小標題、llms.txt、失效頁面、手機排版、頁面位置標示、內部連結、首頁、圖片說明與格式",
    count: "13 項",
  },
  { name: "品牌與權威", contains: "網站可信度、分類層級", count: "2 項" },
];

const FAQS = [
  {
    q: "「無法判定」是什麼意思？",
    a: "有些情況我們讀不到答案，例如站方的 WAF 把我們的請求一起擋掉。這時候會標成 ⚪ 無法判定，並告訴你怎麼自己確認。",
  },
  {
    q: "這跟一般 SEO 檢測有什麼不同？",
    a: "除了 SEO 該看的東西，我們會用 GPTBot、ClaudeBot 等爬蟲的身分實際請求你的頁面，還會實際去問 AI 引擎一個問題，看它答得出你的品牌嗎、引用的是誰的網站。",
  },
  {
    q: "可優化為什麼只算半分，不是不給分？",
    a: "可優化代表「能用，但體質不夠好」——AI 讀得到，只是會讀得比較吃力或判斷得比較沒把握，跟需處理的「直接卡住」不一樣。所以算 0.5 分，需處理算 0 分。這是目前採用的算法，之後調整會同步改這一頁。",
  },
  {
    q: "AI 沒推薦我，會扣分嗎？",
    a: "不會。AI 認不認得你、推不推薦你這兩層不計入總分。那是當下的現況快照，背後的原因可能是內容深度、品牌知名度、外部提及——把它折成分數，等於暗示「你補了 llms.txt 就會被推薦」，那是假因果。",
  },
  {
    q: "我 SEO 做得好，為什麼分數不高？",
    a: "分數看的是 AI 能不能讀到、抽得出、敢引用你的內容——結構化資料、可讀字數、Content Signals、llms.txt 這些排名工具不查的東西。排名好不等於容易被引用。",
  },
  {
    q: "那三個推薦題是誰決定的？",
    a: "模型讀過你的首頁之後猜的，規則是「不能出現你的品牌名」——要問的是這一類，不是這一家。這是推估，不是真實搜尋量，要自己對照主推的服務看題目合不合。想查別的主題，報告下面可以自己加關鍵字。",
  },
  {
    q: "過幾天重跑，分數會不一樣嗎？",
    a: "會。頁面改了、標記補了，分數就會動。另外深度健檢是多頁取樣，這次取樣到的頁面和上次不同時，總分不適合直接相比，看個別項目的變化比較準。",
  },
  {
    q: "我不懂技術，看得懂報告嗎？",
    a: "每一項只有 正常 / 可優化 / 需處理 三種結果，旁邊寫著實際量到的數值和該怎麼改。要動到程式的部分可以把報告直接貼給工程師。",
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
        lede="用 GPTBot 等身分實際發送請求、把問題丟給 Perplexity 和 ChatGPT 問一次、再問幾個不含品牌名的推薦題，最後跑一次多頁深度健檢，共七個檢測層。判定只有三種：正常、可優化、需處理；讀不到答案時標成 ⚪ 無法判定，並告訴你怎麼自己確認。"
      />

      <Section k="01" eyebrow="SEVEN LAYERS" title="七個檢測層">
        <p className="prose mt-4">前四層是「AI 進不進得來、讀不讀得到、你有沒有表態」，第五、六層是實際去問 AI——一個問「認不認得你」，一個問「推不推薦你」——第七層是多頁深度健檢。</p>
        <table className="mt-[30px]">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>檢測層</th>
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

      <Section k="02" eyebrow="THREE VERDICTS" title="三種判定，加一種不判定">
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
        <p className="note">爬蟲一致時清單會收成一行；不一致才逐項展開。政策允許但實測被擋會獨立標示，不會併進「可存取」。</p>
      </Section>

      <Section k="03" eyebrow="THE SCORE" title="總分怎麼算">
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
          AI 認不認得你、AI 推不推薦你這兩層不計入總分。那是現況快照，不是你的網站做錯了什麼——把它折成分數會變成假因果。
        </p>
      </Section>

      <Section k="04" eyebrow="FIVE CATEGORIES" title="深度健檢的五個分類">
        <p className="prose mt-4">21 項深度健檢歸進五個分類（AI 可達性另外算，不計入這 21 項），總覽圖與雷達圖用的是同一套分類。通過率算法：（正常 × 1 ＋ 可優化 × 0.5）÷ 項目數，四捨五入。</p>
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
