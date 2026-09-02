import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";
import FaqAccordion from "@/components/marketing/FaqAccordion";

export const metadata: Metadata = {
  title: "判斷標準｜AI 搜尋能見度健檢",
  description: "六個檢測層、三種判定加一種不判定、總分怎麼算、深度健檢的五個分類。",
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
  { label: "⚪ 無法判定", rule: "我們讀不到答案，不會當成通過，會告訴你怎麼自己確認", example: "無法判定" },
];

const CATEGORIES = [
  { name: "AI 可達性", contains: "爬蟲存取 8 項 + Content Signals + llms.txt", count: "10 項" },
  { name: "內容與追蹤", contains: "重複內容、外部連結、追蹤碼、title/description 長度", count: "4 項" },
  { name: "結構化資料", contains: "結構化資料完整度、Local Business 標籤設定", count: "2 項" },
  {
    name: "技術與索引",
    contains: "sitemap、robots、索引、h1/h2、llms.txt、404、viewport、麵包屑、內外部連結、首頁、圖片 alt/格式",
    count: "13 項",
  },
  { name: "品牌與權威", contains: "E-E-A-T、分類層級是否清楚", count: "2 項" },
];

const FAQS = [
  {
    q: "「無法判定」是什麼意思？",
    a: "有些情況我們讀不到答案，例如站方的 WAF 把我們的請求一起擋掉。這時候會標成 ⚪ 無法判定，並告訴你怎麼自己確認，不會把不確定的事寫成通過。",
  },
  {
    q: "這跟一般 SEO 檢測有什麼不同？",
    a: "除了 SEO 該看的東西，我們會用 GPTBot、ClaudeBot 等爬蟲的身分實際請求你的頁面，還會實際去問 AI 引擎一個問題，看它答得出你的品牌嗎、引用的是誰的網站。",
  },
  {
    q: "扣分權重為什麼是 −4 / −0.5？",
    a: "需處理代表 AI 讀取或引用會直接卡住，可優化是體質問題。權重是目前採用的算法，之後調整會同步改這一頁。",
  },
  {
    q: "我 SEO 做得好，為什麼分數不高？",
    a: "分數看的是 AI 能不能讀到、抽得出、敢引用你的內容——結構化資料、可讀字數、Content Signals、llms.txt 這些排名工具不查的東西。排名好不等於容易被引用。",
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
        eyebrow="判斷標準 · HOW WE JUDGE"
        heading={
          <>
            每一項都是<mark className="lime-highlight">實際量到的值，不是打勾。</mark>
          </>
        }
        lede="健檢分成六個檢測層與一份多頁深度健檢。判定只有三種：正常、可優化、需處理。我們讀不到答案的時候會標成 ⚪ 無法判定，不會把不確定的事寫成通過。"
      />

      <Section k="01" eyebrow="SIX LAYERS" title="六個檢測層">
        <p className="prose mt-4">前四層是「AI 進不進得來、讀不讀得到、你有沒有表態」，第五層是實際去問 AI，第六層是多頁深度健檢。</p>
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
        <ul className="mt-[26px] max-w-[52em]">
          {VERDICTS.map((v) => (
            <li key={v.label} className="list-row">
              <div className="nm">{v.label}</div>
              <div className="why">{v.rule}</div>
              <div className="st">{v.example}</div>
            </li>
          ))}
        </ul>
        <div className="excerpt max-w-[44em] whitespace-pre-wrap">
          {"⚪ 無法判定：robots.txt 回應 403\n這不代表你的網站對 AI 開放——很可能有 robots.txt 但我們讀不到。\n請直接在瀏覽器打開 https://你的網域/robots.txt 確認。"}
        </div>
        <p className="note">爬蟲一致時清單會收成一行；不一致才逐項展開。政策允許但實測被擋會獨立標示，不會併進「可存取」。</p>
      </Section>

      <Section k="03" eyebrow="THE SCORE" title="總分怎麼算">
        <p className="prose mt-4">從 100 分開始扣。只有深度健檢的項目會扣分，AI 引擎層（爬蟲存取、內容可讀、Content Signals、llms.txt）全部通過時不扣分。</p>
        <div className="excerpt max-w-[40em] whitespace-pre-wrap">
          {"起始 100 分\n每個需處理（fail）的深度健檢項目   −4 分\n每個可優化（warn）的深度健檢項目   −0.5 分\nAI 引擎層全部通過時不扣分\n四捨五入到整數"}
        </div>
        <dl className="figs mt-[26px] grid-cols-3">
          <div>
            <b>100</b>
            <span>起始分數</span>
          </div>
          <div>
            <b>−4</b>
            <span>每個需處理項目</span>
          </div>
          <div>
            <b>−0.5</b>
            <span>每個可優化項目</span>
          </div>
        </dl>
        <p className="note">四捨五入到整數。例：21 項深度健檢中 4 項需處理、5 項可優化 → 100 − 16 − 2.5 = 81.5 → 82 分。</p>
      </Section>

      <Section k="04" eyebrow="FIVE CATEGORIES" title="深度健檢的五個分類">
        <p className="prose mt-4">21 項深度健檢歸進五個分類（AI 可達性另外算，不計入這 21 項），總覽圖與雷達圖用的是同一套分類。通過率算法：（正常 × 1 ＋ 可優化 × 0.5）÷ 項目數，四捨五入。</p>
        <ul className="mt-[26px] max-w-[52em]">
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
        <FaqAccordion items={FAQS} defaultOpen={0} />
      </Section>

      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
          <h2 className="max-w-[20em] text-[34px] tracking-[-0.035em]">標準看完了，跑一次看你的分數。</h2>
          <div className="mt-7 flex gap-3">
            <Link href="/" className="btn-lime no-underline">
              開始檢測
            </Link>
            <Link href="/pricing" className="btn-line-dark">
              看費用
            </Link>
          </div>
          <div className="mono mt-9 flex flex-wrap gap-7 text-[11.5px] text-[#8b968d]">
            <span>約 40 秒</span>
            <span>只讀取公開可存取的內容</span>
            <span>不儲存你的網站內容</span>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
