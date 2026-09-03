"use client";

import Link from "next/link";
import { useState } from "react";

type Post = { cat: string; title: string; excerpt: string; href: string | null; date: string };

const POSTS: Post[] = [
  {
    cat: "AI 可達性",
    title: "robots.txt 要怎麼寫，AI 爬蟲才進得來？",
    excerpt: "robots.txt 擋掉 GPTBot 之後，你在 AI 答案裡就不存在了——這是最常見的需處理項目，也是最快能修好的一項。哪幾行要改、改完怎麼複驗。",
    href: "/geo/robots-txt-blocking-ai",
    date: "2026-05-14",
  },
  {
    cat: "內容品質",
    title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？",
    excerpt: "AI 爬蟲讀到的是空殼，你寫的產品介紹它一個字都看不到。主流 AI 爬蟲不執行 JavaScript，純前端渲染的網站在 AI 眼中可能只是空的 <div>。判定門檻、怎麼修。",
    href: "/geo/js-rendering-empty-shell",
    date: "2026-06-02",
  },
  {
    cat: "AI 可達性",
    title: "要讓 AI 引用你的內容，該怎麼表態？",
    excerpt: "沒說清楚能不能被 AI 引用，AI 乾脆不引用你的內容。search / ai-input / ai-train 三項的差別，以及「未表態」對引用機率的影響。",
    href: "/geo/content-signals-declare",
    date: "2026-06-19",
  },
  {
    cat: "AI 可達性",
    title: "llms.txt 要怎麼寫，AI 才看得懂你的網站？",
    excerpt: "沒有給 AI 看的網站導覽，AI 只能自己亂猜你在做什麼。格式、放哪裡、要列哪些連結，以及健檢怎麼判定「內容單薄」。",
    href: "/geo/llms-txt-format",
    date: "2026-07-08",
  },
  {
    cat: "結構化資料",
    title: "結構化資料要補哪些欄位，AI 才認得出你是誰？",
    excerpt: "結構化資料缺這幾個欄位，AI 認不出你是誰。Organization、LocalBusiness、Product、Article 四種型別各自要補的關鍵欄位，以及常見的標記錯誤。",
    href: "/geo/schema-priority",
    date: "2026-07-25",
  },
  {
    cat: "品牌與權威",
    title: "AI 為什麼引用競爭對手，不是你？",
    excerpt: "AI 引用了競爭對手，不是你：引用來源怎麼搶回來？從實際去問 AI 的結果反推缺的是內容、權威還是一致性。",
    href: "/geo/ai-cites-competitor",
    date: "2026-08-11",
  },
  {
    cat: "技術與索引",
    title: "健檢顯示「無法判定」，是防火牆擋住了嗎？",
    excerpt: "「無法判定」不是通過：防火牆可能把 AI 爬蟲一起擋掉了。為什麼健檢會標成 ⚪ 無法判定，以及你要怎麼自己確認。",
    href: "/geo/waf-false-unknown",
    date: "2026-08-29",
  },
];

const CATEGORIES = ["全部", "AI 可達性", "內容品質", "結構化資料", "技術與索引", "品牌與權威"] as const;

const NOTES: Record<string, string> = {
  全部: "全部文章，依健檢項目分類。",
  "AI 可達性": "AI 爬蟲進不進得來：robots.txt、Content Signals、llms.txt。",
  內容品質: "爬蟲讀到什麼：可讀字數、標題結構、單薄與重複內容。",
  結構化資料: "JSON-LD 標記：Organization、Product、FAQPage。",
  技術與索引: "sitemap、canonical、404、WAF 與行動裝置友善。",
  品牌與權威: "AI 認不認得你、引用的是誰的網域。",
};

// GEO 知識分享：依健檢項目分類篩選文章。七篇都已經寫完、href 都指到真的文章頁；
// href 允許 null 是留給以後新增規劃中主題用的——還沒寫完的文章先不包成連結，
// 避免點進死連結，等文章生出來，在這裡把對應的 href 補上就會自動變成可點的列。
export default function ArticleIndex() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("全部");
  const visible = POSTS.filter((p) => cat === "全部" || p.cat === cat);

  return (
    <div>
      <div className="mt-[30px] flex flex-wrap gap-1 border-b border-line">
        {CATEGORIES.map((c) => {
          const active = c === cat;
          const count = c === "全部" ? POSTS.length : POSTS.filter((p) => p.cat === c).length;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`flex items-baseline gap-2 px-3.5 py-2.5 pb-3 text-[14.5px] ${
                active ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--lime)]" : "text-ink2 shadow-[inset_0_-2px_0_transparent]"
              }`}
            >
              {c}
              <span className="mono text-[11.5px] text-ink3">{count}</span>
            </button>
          );
        })}
      </div>
      <p className="mono mt-4 text-[12.5px] text-ink3">{NOTES[cat]}</p>
      <div className="mt-5">
        {visible.map((p) => {
          const row = (
            <>
              <div>
                <h4 className="text-[19px]">{p.title}</h4>
                <p className="mt-1.5 text-[14.5px] text-ink2">{p.excerpt}</p>
              </div>
              <div className="mono text-right text-[11.5px] text-ink3">{p.cat} · {p.date}</div>
            </>
          );
          return p.href ? (
            <Link
              key={p.title}
              href={p.href}
              className="article-row grid grid-cols-[1fr_200px] items-baseline gap-x-8 border-t border-line py-[22px]"
            >
              {row}
            </Link>
          ) : (
            <div key={p.title} className="grid grid-cols-[1fr_200px] items-baseline gap-x-8 border-t border-line py-[22px]">
              {row}
            </div>
          );
        })}
      </div>
      <p className="note">不知道從哪一篇開始，先跑一次健檢，報告會告訴你哪幾項需處理。</p>
    </div>
  );
}
