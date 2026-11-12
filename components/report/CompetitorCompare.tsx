"use client";

// ── 競爭對手分析 ───────────────────────────────────────────
// 只比「被點名幾次」是拙劣的分析（2026-11-02 小積木）。這區回答兩件事：
// 1. AI 怎麼形容你、怎麼形容它（定位差在哪）
// 2. AI 推了它、沒推你的那幾次，看的是哪些網頁（你缺席的地方）
// 11-12 拿掉：推薦次數 vs、各平台蝴蝶圖、逐題比較（一題 3 個回答，次數跟「品牌推薦排名」重複又是雜訊），
// 以及「你跟它哪個好」的直接比較（只有切到的那家會問，其他家沒問，畫面不一致；答案多半是「看需求」）。

import { useState } from "react";
import { brandSlugs, classifySource, SOURCE_LABEL } from "@/lib/geo-source-type";
import type { BrandTable } from "./ReportOverview";

interface ResultLike {
  engine: string;
  namedSelf?: boolean;
  citations?: { url: string; title: string; isSelf: boolean }[];
}

interface PositioningLike {
  brand: string;
  isSelf: boolean;
  traits: { text: string; quote: string; engine: string }[];
}

function tokens(name: string): string[] {
  return [...new Set(name.toLowerCase().match(/[a-z0-9]{2,}|[一-鿿]{2,}/g) ?? [])];
}

function sameBrand(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  return ta.some((t) => tb.includes(t));
}

function TraitList({ title, traits, highlight }: { title: string; traits: PositioningLike["traits"]; highlight?: boolean }) {
  return (
    <div className={`rounded-[10px] border p-4 ${highlight ? "border-lime/60 bg-lime/[.06]" : "border-line bg-card"}`}>
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {traits.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink3">AI 這次沒有具體描述</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {traits.map((t) => (
            <li key={t.text}>
              <p className="text-[15px] font-medium text-ink">{t.text}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-ink3">
                {t.engine}：「{t.quote}」
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompetitorCompare({
  table,
  questions,
  positioning,
}: {
  table: BrandTable;
  questions: { question: string; results: ResultLike[] }[];
  positioning?: PositioningLike[] | null;
}) {
  // 只列前 4 家：定位描述只整理前 4 名（lib/geo-positioning MAX_RIVALS），列更多的話後面幾家會是空的
  const rivals = table.rows.filter((r) => !r.isSelf && r.count > 0 && r.hits).slice(0, 4);
  const self = table.rows.find((r) => r.isSelf);
  const [pick, setPick] = useState(rivals[0]?.name ?? "");
  const rival = rivals.find((r) => r.name === pick) ?? rivals[0];
  if (!self || !rival) return <p className="text-[15px] text-ink3">這次 AI 沒有點名其他品牌，沒有對手可以比。</p>;

  const flatResults = questions.flatMap((q) => q.results);
  const selfHits = new Set(self.hits ?? []);
  // AI 推了對手、卻沒推你的回答
  const rivalOnly = (rival.hits ?? []).filter((i) => !selfHits.has(i));

  // 那些回答引用的網頁（排除你自己的）
  const selfSlugs = brandSlugs([self.name]);
  const pages = new Map<string, { url: string; title: string; host: string; n: number }>();
  for (const i of rivalOnly) {
    for (const c of flatResults[i]?.citations ?? []) {
      let host = "";
      try {
        host = new URL(c.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (c.isSelf || selfSlugs.some((s) => host.split(".")[0].includes(s))) continue;
      const key = host + new URL(c.url).pathname.replace(/\/$/, "");
      const p = pages.get(key) ?? { url: c.url, title: c.title, host, n: 0 };
      p.n += 1;
      pages.set(key, p);
    }
  }
  // 所有對手的官網都要認得出來（不只目前選的這個），不然 saugella.com.tw 會被標成「其他網站」
  const rivalSlugs = brandSlugs(table.rows.filter((r) => !r.isSelf).map((r) => r.name)).filter((x) => !selfSlugs.includes(x));
  const gapPages = [...pages.values()].sort((a, b) => b.n - a.n).slice(0, 6);

  const selfPos = positioning?.find((p) => p.isSelf) ?? positioning?.find((p) => sameBrand(p.brand, self.name));
  const rivalPos = positioning?.find((p) => !p.isSelf && sameBrand(p.brand, rival.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-ink2">比較對象：</span>
        {rivals.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => setPick(r.name)}
            className={`rounded-full border px-3 py-1 text-[14px] ${
              r.name === rival.name ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-card text-ink2 hover:border-ink3"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* 1. 定位 */}
      {positioning && (
        <div>
          <p className="mb-2 text-[15px] font-bold text-ink">品牌定位比較</p>
          <div className="grid gap-3 grid-cols-2">
            <TraitList title={`你（${self.name}）`} traits={selfPos?.traits ?? []} highlight />
            <TraitList title={rival.name} traits={rivalPos?.traits ?? []} />
          </div>
        </div>
      )}

      {/* 2. 缺席的地方 */}
      <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
        <p className="border-b border-line px-4 py-2.5 text-[15px] font-bold text-ink">
          競品獨占回答的引用來源
        </p>
        {gapPages.length === 0 ? (
          <p className="px-4 py-3 text-[15px] text-ink3">
            {rivalOnly.length === 0 ? `每次推 ${rival.name} 的回答也都有推你。` : "這幾次回答沒有附引用網址。"}
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-[15px]">
            <tbody>
              {gapPages.map((p) => (
                <tr key={p.url} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-2.5">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="report-table-link line-clamp-1 font-medium">
                      {p.title || p.host}
                    </a>
                    <p className="mono mt-0.5 text-[14px] text-ink3">{p.host}</p>
                  </td>
                  <td className="w-[100px] px-3 py-2.5 text-[14px] text-ink2">{SOURCE_LABEL[classifySource(p.host, false, rivalSlugs)]}</td>
                  <td className="mono w-[70px] px-3 py-2.5 text-right text-[14px] text-ink2">{p.n} 次</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
