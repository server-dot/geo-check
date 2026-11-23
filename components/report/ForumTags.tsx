"use client";

// 網友相關問題（11-23 小積木：「關鍵字查詢」拿掉，換成網友相關搜尋問題的 tag；客戶偏小白，要大 icon、圖表、好讀）。
// 資料就是健檢時去論壇搜到的那批（跟選題畫面「網友問過的」同一份），不另外查、不花錢。
// 顯示原文標題而不是 AI 改寫過的 question：改寫版會自己補「有推薦的嗎」，不是網友原話。
// 分類是看標題用字的規則，不叫 AI；則數只是這次搜到幾則，不是搜尋量。

import { useState, type ReactNode } from "react";
import type { QuestionCandidates } from "./QuestionPicker";

type Forum = QuestionCandidates["forum"][number];

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const KINDS: { id: string; label: string; test: RegExp | null; color: string; icon: ReactNode }[] = [
  {
    id: "price",
    label: "在意價格",
    test: /價|多少錢|費用|預算|便宜|划算|收費/,
    color: "#8a5a12",
    icon: (
      <>
        <circle cx="24" cy="24" r="17" {...stroke} />
        <path d="M29 18c-1.500-2-9-3-9.500 1.500C19 25 29.500 23 29 28.500 28.500 33 20.500 32 19 29.500M24 13v3.500M24 31.500V35" {...stroke} />
      </>
    ),
  },
  {
    id: "recommend",
    label: "想找推薦",
    test: /推薦|介紹|哪家|哪間|哪一家|有誰/,
    color: "#1f7a4d",
    icon: <path d="M8 22h7v18H8zM15 23l8-15c4 0 5 3 4.500 6l-1 5H37c3 0 4 2 3.500 4.500l-2.500 12c-.5 2.500-2 4.500-5 4.500H15" {...stroke} />,
  },
  {
    id: "experience",
    label: "想聽別人的經驗",
    test: /覺得|心得|評價|好用|好嗎|大家|經驗|有人/,
    color: "#2a78d6",
    icon: (
      <>
        <path d="M6 9h26v18H17l-7 6v-6H6z" {...stroke} />
        <path d="M36 17h6v17h-4v6l-7-6H21" {...stroke} />
      </>
    ),
  },
  {
    id: "howto",
    label: "想知道怎麼做",
    test: /怎麼|怎樣|如何|哪些|什麼|方法|教學|軟體/,
    color: "#6550d2",
    icon: <path d="M17 33c0-5-6-7-6-15a13 13 0 0 1 26 0c0 8-6 10-6 15zM18 38h12M20 43h8" {...stroke} />,
  },
  {
    id: "other",
    label: "其他疑問",
    test: null,
    color: "#5f6a80",
    icon: (
      <>
        <circle cx="24" cy="24" r="18" {...stroke} />
        <path d="M18.500 19c0-7 11-7 11-.5 0 4.500-5.500 4.500-5.500 9M24 33.500v.5" {...stroke} />
      </>
    ),
  },
];

// 平台圓標：字＋底色，不用別人的商標圖
const SITE: Record<string, { mark: string; color: string }> = {
  Dcard: { mark: "D", color: "#0b6a94" },
  PTT: { mark: "P", color: "#303c54" },
  Threads: { mark: "@", color: "#111111" },
  Mobile01: { mark: "01", color: "#3a7a1e" },
  FB: { mark: "f", color: "#1660c4" },
  BabyHome: { mark: "B", color: "#b04a6f" },
};
const siteOf = (s: string) => SITE[s] ?? { mark: s.slice(0, 1), color: "#5f6a80" };

// 「[請益] 電商訂單管理系統」「#發問Line有電話客服嗎？」→ 去掉版上的分類標記
const clean = (f: Forum) => f.source.title.replace(/^\s*(?:\[[^\]]*\]|【[^】]*】|#\S{2}(?=\S))\s*/, "").trim() || f.question;
const kindOf = (f: Forum) => KINDS.find((k) => k.test?.test(clean(f))) ?? KINDS[KINDS.length - 1];

function SiteMark({ site, size }: { site: string; size: number }) {
  const s = siteOf(site);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: s.color, fontSize: size * 0.42 }}
    >
      {s.mark}
    </span>
  );
}

export function ForumTags({ candidates }: { candidates: QuestionCandidates }) {
  const { forum } = candidates;
  const [pick, setPick] = useState<string | null>(null);
  if (forum.length === 0)
    return (
      <p className="text-[15px] text-ink3">
        {candidates.forumFailed ? "這次論壇搜尋失敗，沒查到網友問過的問題（不代表沒人問）。" : "論壇上找不到網友問過的相關問題。"}
      </p>
    );

  const groups = KINDS.map((k) => ({ ...k, list: forum.filter((f) => kindOf(f).id === k.id) }))
    .filter((g) => g.list.length > 0)
    .sort((a, b) => Number(a.id === "other") - Number(b.id === "other") || b.list.length - a.list.length);
  const sites = [...new Set(forum.map((f) => f.source.site))]
    .map((s) => ({ s, n: forum.filter((f) => f.source.site === s).length }))
    .sort((a, b) => b.n - a.n);
  const on = groups.some((g) => g.id === pick) ? pick : null;
  const max = sites[0].n;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-[16px] font-bold text-ink">網友在問什麼</p>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={on === g.id}
                onClick={() => setPick(on === g.id ? null : g.id)}
                className={`flex flex-col items-center rounded-xl border-2 px-3 py-4 text-center ${on === g.id ? "border-ink bg-paper" : "border-transparent bg-paper hover:border-line"}`}
              >
                <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full" style={{ background: `${g.color}1f`, color: g.color }}>
                  <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
                    {g.icon}
                  </svg>
                </span>
                <span className="mt-2.5 text-[15px] font-semibold text-ink">{g.label}</span>
                <span className="mt-0.5 text-[24px] font-bold leading-tight tabular-nums text-ink">
                  {g.list.length}
                  <span className="ml-1 text-[14px] font-normal text-ink3">則</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-[16px] font-bold text-ink">在哪裡問</p>
          <ul className="mt-4 space-y-3">
            {sites.map(({ s, n }) => (
              <li key={s} className="flex items-center gap-3">
                <SiteMark site={s} size={40} />
                <span className="w-[78px] shrink-0 text-[15px] font-medium text-ink">{s}</span>
                <span className="h-4 min-w-0 flex-1">
                  <span className="block h-full rounded" style={{ width: `${(n / max) * 100}%`, background: siteOf(s).color }} />
                </span>
                <span className="w-[40px] shrink-0 text-right text-[15px] font-semibold tabular-nums text-ink">{n} 則</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {groups
        .filter((g) => !on || g.id === on)
        .map((g) => (
          <div key={g.id} className="flex gap-5 rounded-xl border border-line bg-card p-5">
            <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full" style={{ background: `${g.color}1f`, color: g.color }}>
              <svg viewBox="0 0 48 48" width="32" height="32" aria-hidden="true">
                {g.icon}
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-ink">{g.label}</p>
              <ul className="mt-2.5 flex flex-wrap gap-2.5">
                {g.list.map((f) => (
                  <li key={f.source.link} className="max-w-full">
                    <a
                      href={f.source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="plain-link inline-flex max-w-full items-center gap-2.5 rounded-full border border-line bg-paper py-1.5 pr-4 pl-1.5 text-[15px] text-ink hover:border-lime-dark"
                    >
                      <SiteMark site={f.source.site} size={28} />
                      <span className="sr-only">{f.source.site}：</span>
                      <span className="min-w-0">{clean(f)}</span>
                      <span aria-hidden="true" className="shrink-0 text-ink3">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      <p className="text-[13px] text-ink3">則數是這次搜到的文章數，不是搜尋量。分類依標題用字判斷，點標籤看原文。</p>
    </div>
  );
}
