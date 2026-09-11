"use client";

import Link from "next/link";
import { useState } from "react";
import { POSTS } from "@/lib/geo-posts";

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
