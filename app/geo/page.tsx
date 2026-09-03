import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";
import ArticleIndex from "@/components/marketing/ArticleIndex";

export const metadata: Metadata = {
  title: "GEO 知識｜AI 搜尋能見度健檢",
  description: "GEO 是什麼、跟 SEO 差在哪，以及依健檢項目分類的知識文章。",
};

const COMPARISON = [
  { aspect: "目標", seo: "搜尋結果的排名位置", geo: "被 AI 回答引用、推薦" },
  { aspect: "核心信號", seo: "連結、關鍵字、技術面", geo: "結構化資料、可讀內容、爬蟲授權" },
  { aspect: "主要介面", seo: "Google 搜尋結果頁", geo: "ChatGPT、Perplexity、AI Overviews" },
  { aspect: "衡量方式", seo: "排名、點擊率", geo: "有沒有被點名、引用的是不是你的網域" },
  { aspect: "看得到嗎", seo: "Search Console 看得到", geo: "得用 AI 爬蟲的身分實際讀一次" },
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
        lede="先講 GEO 是什麼、和 SEO 差在哪，後面是知識文章分享，依健檢項目分類。想知道自己的網站現在如何，回首頁跑一次健檢就好。"
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

      <Section k="03" eyebrow="ARTICLES" title="GEO 知識分享" noBorder>
        <p className="prose mt-4">健檢報告上標成需處理的項目，這裡一項一篇：為什麼會被判成需處理、怎麼改、改完怎麼複驗。</p>
        <ArticleIndex />
      </Section>

      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
          <h2 className="max-w-[20em] text-[34px] tracking-[-0.035em]">看看這些情況在你的網站上是什麼結果。</h2>
          <div className="mt-7 flex gap-3">
            <Link href="/" className="btn-lime no-underline">
              開始檢測
            </Link>
            <Link href="/scoring" className="btn-line-dark">
              看判斷標準
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
