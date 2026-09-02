import type { Metadata } from "next";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";

export const metadata: Metadata = {
  title: "GEO 知識｜AI 搜尋能見度健檢",
  description: "GEO 是什麼、跟 SEO 差在哪、AI 找不到你通常是哪三種情況。",
};

const COMPARISON = [
  { aspect: "目標", seo: "搜尋結果的排名位置", geo: "被 AI 回答引用、推薦" },
  { aspect: "核心信號", seo: "連結、關鍵字、技術面", geo: "結構化資料、可讀內容、爬蟲授權" },
  { aspect: "主要介面", seo: "Google 搜尋結果頁", geo: "ChatGPT、Perplexity、AI Overviews" },
  { aspect: "衡量方式", seo: "排名、點擊率", geo: "有沒有被點名、引用的是不是你的網域" },
  { aspect: "看得到嗎", seo: "Search Console 看得到", geo: "得用 AI 爬蟲的身分實際讀一次" },
];

const PROBLEMS = [
  {
    title: "robots.txt 把 AI 爬蟲一起擋掉了",
    body: "網站對 Google 開放，但 GPTBot、ClaudeBot 被同一條規則擋在門外。AI 引擎不會抓到你的內容，你也不會出現在它的答案裡。",
    evidence: "User-agent: GPTBot\nDisallow: /",
    status: "被擋",
  },
  {
    title: "內容要等 JavaScript 才長出來",
    body: "爬蟲拿到的 HTML 裡沒有產品說明、沒有價格、沒有案例，只有一層框架。人看得到，AI 讀到的是空殼。",
    evidence: "AI 爬蟲只讀到 412 個字；頁面有 14 個腳本、HTML 共 68420 字元",
    status: "需處理",
  },
  {
    title: "AI 講得出你的產業，引用的卻是別人",
    body: "同一個問題，AI 引用了競爭對手的頁面。它知道這件事，只是不是從你這裡知道的。",
    evidence: "引用來源 6 筆，指向你的網域 0 筆",
    status: "可優化",
  },
];

export default function GeoGuidePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <SubpageHero
        k="GEO"
        eyebrow="GEO 知識 · WHAT IS GEO"
        heading={
          <>
            AI 直接給答案的時候，<mark className="lime-highlight">你在不在那段答案裡。</mark>
          </>
        }
        lede="這一頁講三件事：GEO 是什麼、和 SEO 差在哪、AI 找不到你通常是哪三種情況。看完想知道自己的網站現在如何，回首頁跑一次健檢就好。"
      />

      <Section k="01" eyebrow="WHAT IS GEO" title="什麼是 GEO？">
        <p className="prose mt-4">
          GEO 是 Generative Engine Optimization——針對 ChatGPT、Perplexity、Google AI Overviews
          這類會直接給答案的引擎做的優化。使用者不再看十筆搜尋結果，而是看一段回答；你在不在那段回答裡，
          取決於引擎讀不讀得到你的內容、敢不敢引用你。
        </p>
        <p className="prose mt-4">
          這件事的地基和 SEO 重疊，但檢查方式不同：排名可以在 Search Console 看到，AI 讀到什麼不會。
          要知道 AI 眼中的你長什麼樣，得用 AI 爬蟲的身分實際讀一次，再實際去問一次。
        </p>
      </Section>

      <Section k="02" eyebrow="GEO VS SEO" title="和 SEO 差在哪">
        <p className="prose mt-4">兩者不是二選一，地基是同一套。差別在最後一哩：SEO 爭的是版位，GEO 爭的是被引用。</p>
        <table className="mt-[30px]">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>比較項目</th>
              <th style={{ width: "39%" }}>SEO</th>
              <th style={{ width: "39%" }}>GEO</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.aspect}>
                <td className="item">{row.aspect}</td>
                <td>{row.seo}</td>
                <td className="text-left font-sans text-[15px] text-ink">{row.geo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section k="03" eyebrow="THE PROBLEM" title="AI 找不到你，通常是這三種情況" noBorder>
        <p className="prose mt-4">
          三種都不會出現在你的 Google Search Console 裡，也不會讓網站看起來壞掉。要知道有沒有發生，
          只能用 AI 爬蟲的身分實際讀一次。
        </p>
        <ul className="mt-8">
          {PROBLEMS.map((p) => (
            <li key={p.title} className="todo-row">
              <div>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
                <div className="excerpt mt-3.5 max-w-[38em] whitespace-pre-wrap">{p.evidence}</div>
              </div>
              <div className="st">{p.status}</div>
            </li>
          ))}
        </ul>
        <p className="note">
          每一項在健檢裡怎麼判定、扣幾分，寫在{" "}
          <a href="/scoring">判斷標準</a>。
        </p>
      </Section>
    </div>
  );
}
