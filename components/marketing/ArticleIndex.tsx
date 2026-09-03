"use client";

import Link from "next/link";
import { useState } from "react";

type Post = { cat: string; title: string; excerpt: string; href: string | null };

const POSTS: Post[] = [
  {
    cat: "AI 可達性",
    title: "robots.txt 擋掉 GPTBot 之後，你在 AI 答案裡就不存在了",
    excerpt: "最常見的需處理項目，也是最快能修好的一項。哪幾行要改、改完怎麼複驗。",
    href: "/geo/robots-txt-blocking-ai",
  },
  {
    cat: "內容品質",
    title: "AI 爬蟲讀到的是空殼：JavaScript 渲染怎麼修",
    excerpt: "關掉 JavaScript 之後只剩 412 個字，代表 AI 讀不到你的產品說明。SSR 與預先渲染怎麼選。",
    href: null,
  },
  {
    cat: "AI 可達性",
    title: "Content Signals 是什麼，要不要表態",
    excerpt: "search / ai-input / ai-train 三項的差別，以及「未表態」對引用機率的影響。",
    href: null,
  },
  {
    cat: "AI 可達性",
    title: "llms.txt 要不要做？做了要寫什麼",
    excerpt: "格式、放哪裡、要列哪些連結，以及健檢怎麼判定「內容單薄」。",
    href: null,
  },
  {
    cat: "結構化資料",
    title: "JSON-LD 補哪幾個 Schema 最有感",
    excerpt: "Organization、Product、FAQPage 的優先順序，以及常見的標記錯誤。",
    href: null,
  },
  {
    cat: "品牌與權威",
    title: "AI 引用了競爭對手，不是你：引用來源怎麼搶回來",
    excerpt: "從實際去問 AI 的結果反推缺的是內容、權威還是一致性。",
    href: null,
  },
  {
    cat: "技術與索引",
    title: "「無法判定」不是通過：WAF 把 AI 爬蟲一起擋掉的情況",
    excerpt: "為什麼健檢會標成 ⚪ 無法判定，以及你要怎麼自己確認。",
    href: null,
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

// GEO 知識分享：依健檢項目分類篩選文章。多數標題目前只是規劃中的主題（href 是 null），
// 只有 robots.txt 那篇真的寫了——所以不包成連結，避免點進死連結；等文章生出來，
// 在這裡把對應的 href 補上就會自動變成可點的列。
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
                <p className="mt-1.5 max-w-[40em] text-[14.5px] text-ink2">{p.excerpt}</p>
              </div>
              <div className="mono text-right text-[11.5px] text-ink3">{p.cat} · （日期待填）</div>
            </>
          );
          return p.href ? (
            <Link
              key={p.title}
              href={p.href}
              className="grid grid-cols-[1fr_200px] items-baseline gap-x-8 border-t border-line py-[22px] no-underline"
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
      <p className="note">
        文章標題與摘要是建議主題，實際內容待填。不知道從哪一篇開始，先跑一次健檢，報告會告訴你哪幾項需處理。
      </p>
    </div>
  );
}
