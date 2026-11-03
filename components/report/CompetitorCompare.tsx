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

// 蝴蝶圖一列：你在左（金）、對手在右（深灰），長度＝次數
function Butterfly({ label, me, them, max, sub }: { label: string; me: number; them: number; max: number; sub?: string }) {
  const w = (n: number) => `${(n / Math.max(1, max)) * 100}%`;
  return (
    <div className="grid grid-cols-[1fr_minmax(0,1.3fr)_1fr] items-center gap-3 py-1.5">
      <div className="flex items-center justify-end gap-2">
        <span className={`mono text-[14px] tabular-nums ${me > them ? "font-bold text-ink" : "text-ink2"}`}>{me}</span>
        <div className="flex h-3 w-full justify-end overflow-hidden rounded-l-full bg-inset">
          <div className="rounded-l-full bg-lime" style={{ width: w(me) }} />
        </div>
      </div>
      <div className="min-w-0 text-center">
        <p className="truncate text-[14px] text-ink">{label}</p>
        {sub && <p className="text-[14px] text-ink3">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-r-full bg-inset">
          <div className="rounded-r-full bg-ink/70" style={{ width: w(them) }} />
        </div>
        <span className={`mono text-[14px] tabular-nums ${them > me ? "font-bold text-ink" : "text-ink2"}`}>{them}</span>
      </div>
    </div>
  );
}

interface CompareLike {
  rival: string;
  query: string;
  verdicts: { engine: string; favors: "self" | "rival" | "tie"; reason: string; quote: string }[];
  dimensions: { name: string; winner: "self" | "rival" | "tie"; quote: string; engine: string }[];
}

// 直接比較題：每家 AI 偏向誰＋每個比較標準誰勝（拔河條）
export function HeadToHead({ selfName, cmp }: { selfName: string; cmp: CompareLike }) {
  const favor = (f: "self" | "rival" | "tie") =>
    f === "self" ? { t: `偏向你`, cls: "bg-lime text-ink" } : f === "rival" ? { t: `偏向${cmp.rival}`, cls: "bg-ink text-paper" } : { t: "看需求，不分高下", cls: "bg-inset text-ink2" };
  return (
    <div className="rounded-[10px] border border-line bg-card p-5">
      <p className="text-[15px] font-bold text-ink">直接比較：{cmp.query}？</p>
      <div className="mt-3 grid gap-2 grid-cols-3">
        {cmp.verdicts.map((v) => {
          const f = favor(v.favors);
          return (
            <div key={v.engine} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] text-ink2">{v.engine}</span>
                <span className={`rounded-full px-2 py-0.5 text-[14px] font-semibold ${f.cls}`}>{f.t}</span>
              </div>
              <p className="mt-1.5 text-[14px] text-ink">{v.reason}</p>
            </div>
          );
        })}
      </div>
      {cmp.dimensions.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 grid grid-cols-[1fr_auto_1fr] text-[14px] text-ink3">
            <span className="font-semibold text-ink">← {selfName} 較好</span>
            <span>比較標準</span>
            <span className="text-right font-semibold text-ink">{cmp.rival} 較好 →</span>
          </div>
          {cmp.dimensions.map((d) => (
            <div key={d.name} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-line py-2 first:border-t-0">
              <div className="flex h-3 justify-end overflow-hidden rounded-l-full bg-inset">
                {d.winner === "self" && <div className="w-full rounded-l-full bg-lime" />}
                {d.winner === "tie" && <div className="w-1/2 bg-ink3/30" />}
              </div>
              <span className="w-[84px] text-center text-[14px] font-medium text-ink" title={`${d.engine}：「${d.quote}」`}>
                {d.name}
              </span>
              <div className="flex h-3 overflow-hidden rounded-r-full bg-inset">
                {d.winner === "rival" && <div className="w-full rounded-r-full bg-ink/70" />}
                {d.winner === "tie" && <div className="w-1/2 bg-ink3/30" />}
              </div>
            </div>
          ))}
          <p className="mt-1 text-[14px] text-ink3">滑鼠移到標準上可以看 AI 的原句。</p>
        </div>
      )}
    </div>
  );
}

export function CompetitorCompare({
  table,
  questions,
  positioning,
  defaultRival,
}: {
  table: BrandTable;
  questions: { question: string; results: ResultLike[] }[];
  positioning?: PositioningLike[] | null;
  defaultRival?: string; // 直接比較題比的那一家，選擇器預設跟它一致
}) {
  const rivals = table.rows.filter((r) => !r.isSelf && r.count > 0 && r.hits).slice(0, 6);
  const self = table.rows.find((r) => r.isSelf);
  const initial = (defaultRival && rivals.find((r) => sameBrand(r.name, defaultRival))?.name) || rivals[0]?.name || "";
  const [pick, setPick] = useState(initial);
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

      <p className="flex items-center gap-4 text-[14px] text-ink3">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-lime" />你</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/70" />{rival.name}</span>
      </p>

      {/* 1. 次數 */}
      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[14px] text-ink2">推薦次數</p>
          <p className="mt-1.5 text-[26px] font-bold leading-none text-ink tabular-nums">
            {self.count}
            <span className="mx-2 text-base font-normal text-ink3">vs</span>
            {rival.count}
          </p>
          <p className="mt-1.5 text-[14px] text-ink3">
            你 vs {rival.name}（{table.total} 次回答中）
          </p>
        </div>
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[14px] text-ink2">競品獨占回答</p>
          <p className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${rivalOnly.length > 0 ? "text-fail" : "text-ink"}`}>
            {rivalOnly.length}
            <span className="ml-1.5 text-base font-normal text-ink3">次回答</span>
          </p>
        </div>
        <div className="rounded-[10px] border border-line bg-card px-4 py-3">
          <p className="mb-1 text-[14px] text-ink2">各平台推薦次數</p>
          {table.engines.map((e) => (
            <Butterfly key={e} label={e} me={self.byEngine?.[e] ?? 0} them={rival.byEngine?.[e] ?? 0} max={table.engineTotals[e] ?? 3} />
          ))}
        </div>
      </div>

      {/* 2. 定位 */}
      {positioning && (
        <div>
          <p className="mb-2 text-[15px] font-bold text-ink">品牌定位比較</p>
          <div className="grid gap-3 grid-cols-2">
            <TraitList title={`你（${self.name}）`} traits={selfPos?.traits ?? []} highlight />
            <TraitList title={rival.name} traits={rivalPos?.traits ?? []} />
          </div>
        </div>
      )}

      {/* 3. 缺席的地方 */}
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

      {/* 逐題：蝴蝶圖，不判輸贏 */}
      <div className="rounded-[10px] border border-line bg-card px-4 py-3">
        <div className="mb-1 grid grid-cols-[1fr_minmax(0,1.3fr)_1fr] text-[14px] text-ink3">
          <span className="text-right font-semibold text-ink">你</span>
          <span className="text-center">推薦題</span>
          <span className="font-semibold text-ink">{rival.name}</span>
        </div>
        {rows.map((r, i) => (
          <Butterfly key={r.q} label={`第 ${i + 1} 題`} sub={r.q} me={r.me} them={r.them} max={r.total} />
        ))}
        <p className="mt-1 border-t border-line pt-2 text-[14px] text-ink3">每題的回答不多，差 1 次可能只是剛好。</p>
      </div>
    </div>
  );
}
