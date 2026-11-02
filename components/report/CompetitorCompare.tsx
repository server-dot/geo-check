"use client";

// ── 競爭對手分析 ───────────────────────────────────────────
// 只比「被點名幾次」是拙劣的分析（2026-11-02 小積木）。這區回答三件事：
// 1. 你跟這個對手各被推幾次（只寫次數；一題 3 個回答，差 1 次是雜訊，不判輸贏）
// 2. AI 怎麼形容你、怎麼形容它（定位差在哪）
// 3. AI 推了它、沒推你的那幾次，看的是哪些網頁（你缺席的地方）

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
      <p className="text-[13px] font-bold text-ink">{title}</p>
      {traits.length === 0 ? (
        <p className="mt-2 text-sm text-ink3">AI 這次沒有具體描述</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {traits.map((t) => (
            <li key={t.text}>
              <p className="text-sm font-medium text-ink">{t.text}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink3">
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
  const rivals = table.rows.filter((r) => !r.isSelf && r.count > 0 && r.hits).slice(0, 6);
  const self = table.rows.find((r) => r.isSelf);
  const [pick, setPick] = useState(rivals[0]?.name ?? "");
  const rival = rivals.find((r) => r.name === pick) ?? rivals[0];
  if (!self || !rival) return <p className="text-sm text-ink3">這次 AI 沒有點名其他品牌，沒有對手可以比。</p>;

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

  const perQ = (hits: number[] | null, qi: number) => (hits ?? []).filter((i) => table.flat[i]?.qi === qi).length;
  const rows = questions.map((q, qi) => ({
    q: q.question,
    me: perQ(self.hits, qi),
    them: perQ(rival.hits, qi),
    total: table.flat.filter((f) => f.qi === qi).length,
  }));

  const selfPos = positioning?.find((p) => p.isSelf) ?? positioning?.find((p) => sameBrand(p.brand, self.name));
  const rivalPos = positioning?.find((p) => !p.isSelf && sameBrand(p.brand, rival.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink2">跟誰比：</span>
        {rivals.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => setPick(r.name)}
            className={`rounded-full border px-3 py-1 text-[13px] ${
              r.name === rival.name ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-card text-ink2 hover:border-ink3"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* 1. 次數 */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[13px] text-ink2">被 AI 推薦的次數</p>
          <p className="mt-1.5 text-[26px] font-bold leading-none text-ink tabular-nums">
            {self.count}
            <span className="mx-2 text-base font-normal text-ink3">vs</span>
            {rival.count}
          </p>
          <p className="mt-1.5 text-xs text-ink3">
            你 vs {rival.name}（{table.total} 次回答中）
          </p>
        </div>
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[13px] text-ink2">推了 {rival.name}、沒推你</p>
          <p className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${rivalOnly.length > 0 ? "text-fail" : "text-ink"}`}>
            {rivalOnly.length}
            <span className="ml-1.5 text-base font-normal text-ink3">次回答</span>
          </p>
          <p className="mt-1.5 text-xs text-ink3">這幾次 AI 看的網頁列在下面</p>
        </div>
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[13px] text-ink2">各家 AI（你 vs {rival.name}）</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            {table.engines.map((e) => (
              <li key={e} className="flex items-center justify-between gap-2">
                <span className="text-ink2">{e}</span>
                <span className="mono text-xs text-ink2 tabular-nums">
                  {self.byEngine?.[e] ?? 0} vs {rival.byEngine?.[e] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 2. 定位 */}
      {positioning && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink">AI 怎麼形容你們</p>
          <div className="grid gap-3 md:grid-cols-2">
            <TraitList title={`你（${self.name}）`} traits={selfPos?.traits ?? []} highlight />
            <TraitList title={rival.name} traits={rivalPos?.traits ?? []} />
          </div>
        </div>
      )}

      {/* 3. 缺席的地方 */}
      <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
        <p className="border-b border-line px-4 py-2.5 text-sm font-bold text-ink">
          AI 推 {rival.name} 沒推你的時候，看的是這些網頁
        </p>
        {gapPages.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink3">
            {rivalOnly.length === 0 ? `每次推 ${rival.name} 的回答也都有推你。` : "這幾次回答沒有附引用網址。"}
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <tbody>
              {gapPages.map((p) => (
                <tr key={p.url} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-2.5">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="report-table-link line-clamp-1 font-medium">
                      {p.title || p.host}
                    </a>
                    <p className="mono mt-0.5 text-[11.5px] text-ink3">{p.host}</p>
                  </td>
                  <td className="w-[100px] px-3 py-2.5 text-xs text-ink2">{SOURCE_LABEL[classifySource(p.host, false, rivalSlugs)]}</td>
                  <td className="mono w-[70px] px-3 py-2.5 text-right text-xs text-ink2">{p.n} 次</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 逐題次數：不判輸贏，差 2 次以上才標領先 */}
      <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line bg-inset/60 text-left text-xs text-ink3">
              <th className="px-4 py-2.5 font-medium">題目</th>
              <th className="w-[80px] px-3 py-2.5 text-right font-medium">你</th>
              <th className="w-[110px] px-3 py-2.5 text-right font-medium">{rival.name}</th>
              <th className="w-[140px] px-3 py-2.5 font-medium">差距</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.me - r.them;
              return (
                <tr key={r.q} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-2.5 text-ink">{r.q}</td>
                  <td className="mono px-3 py-2.5 text-right text-xs text-ink2">
                    {r.me}/{r.total}
                  </td>
                  <td className="mono px-3 py-2.5 text-right text-xs text-ink2">
                    {r.them}/{r.total}
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">
                    {d >= 2 ? (
                      <span className="font-semibold text-ok">你明顯領先</span>
                    ) : d <= -2 ? (
                      <span className="font-semibold text-fail">{rival.name}明顯領先</span>
                    ) : (
                      <span className="text-ink3">差不多</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2 text-xs text-ink3">一題只問 3 家 AI 各一次，差 1 次可能只是這次運氣，差 2 次以上才算明顯。</p>
      </div>
    </div>
  );
}
