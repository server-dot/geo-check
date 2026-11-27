"use client";

// ── AI 怎麼比較你和對手：原文並排，標明是 AI 的看法（11-25）──────────
import { useState } from "react";
import type React from "react";
import type { AiCompare } from "@/lib/geo-compare";
import type { RivalMapLike } from "./CompetitorCompare";

const ASPECTS = ["價格", "成分配方", "適合誰", "優點", "缺點或限制"];
const ENGINE = (e: string) => (e.startsWith("ChatGPT") ? "ChatGPT" : e.startsWith("Google") ? "Google" : e.split(/[（(]/)[0]);
const CHIP: Record<string, string> = { ChatGPT: "#1f7a4d", Perplexity: "#2a78d6", Google: "#6550d2" };

// 跟查到的售價對不上的說法：只抓「最貴、最便宜、平價」這種明確的
function priceConflict(quote: string, brand: string, map: RivalMapLike | null | undefined): string {
  if (map?.v !== 3 || map.axes?.[0]?.low !== "單價低") return "";
  const rows = [{ name: "__self", d: map.self.dims?.[0] }, ...map.points.map((p) => ({ name: p.name, d: p.dims?.[0] }))].filter((x) => x.d);
  const key = (n: string) => n.toLowerCase().replace(/\s/g, "");
  const me = rows.find((x) => key(x.name) === key(brand) || key(x.name).includes(key(brand.split(" ")[0])));
  const row = me ?? (map.self.dims?.[0] && brand === "__self" ? rows[0] : undefined);
  if (!row?.d) return "";
  const sorted = [...rows].sort((a, b) => b.d!.v - a.d!.v);
  const rank = sorted.indexOf(row);
  if (/最貴|單價最高|價格最高/.test(quote) && rank !== 0) return `查到的單價不是最高（${row.d.label}）`;
  if (/平價|便宜|親民|最低/.test(quote) && rank < sorted.length / 3) return `查到的單價偏高（${row.d.label}）`;
  return "";
}

// 面向的圖示
const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
    {d}
  </svg>
);
const ICON: Record<string, React.ReactNode> = {
  價格: svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9c-.8-1-4.5-1.5-4.7.6-.2 2.3 4.900 1.5 4.7 3.900-.2 2-3.900 1.800-5 .5M12 6.5v11" /></>),
  成分配方: svg(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7.5 15h9" /></>),
  服務內容: svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18" /></>),
  適合誰: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></>),
  優點: svg(<path d="M4 11h3v9H4zM7 12l4-8c2 0 3 1.5 2.5 3.5L13 10h6c1.5 0 2 1 1.800 2.200l-1.3 6c-.2 1.200-1 1.800-2.5 1.800H7" />),
  缺點或限制: svg(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>),
};

// 一眼看得懂的短句（都是原文的一段）：價格抓金額那一段；其他取分句，開頭是「以、但、對、若」這種話沒講完的就接下一句
const HANGING = /^(以|但|對|若|如果|要|因為|由於|相較|想|在|雖|不過)/;
function clip(c: AiCompare["cells"][number]): string {
  if (c.aspect === "價格") {
    const sale = c.quote.match(/(促銷價|優惠價|特價)[^，。；\d]{0,6}NT\$\s?[\d,]+/);
    if (sale) return sale[0];
    const m = c.quote.match(/(\d+\s*(ml|g)[^，。；]{0,12})?NT\$\s?[\dx,]+(\s?[–～~-]\s?(NT\$)?[\dx,]+)?/i);
    if (m) return m[0].replace(/^[／/\s]+/, "").trim();
  }
  const parts = c.quote.split(/(?<=[，。；;])/);
  let t = "";
  for (const part of parts) {
    t += part;
    const done = t.replace(/[，。；;]$/, "");
    if (done.length >= 8 && !(HANGING.test(t) && parts.length > 1 && t === parts[0])) break;
  }
  t = t.replace(/[，。；;]$/, "").trim();
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}
function short(list: AiCompare["cells"]): { text: string; by: string }[] {
  const out: { text: string; by: string }[] = [];
  // 價格有金額的優先，其他短的優先
  const all = list.map((c) => ({ text: clip(c), by: ENGINE(c.engine) })).sort((a, b) => Number(/NT\$/.test(b.text)) - Number(/NT\$/.test(a.text)) || a.text.length - b.text.length);
  for (const x of all) if (out.length < 2 && !out.some((o) => o.by === x.by)) out.push(x);
  return out;
}

function Cell({ list, map, brand }: { list: AiCompare["cells"]; map?: RivalMapLike | null; brand: string }) {
  if (list.length === 0) return <span className="text-ink3">AI 沒講到</span>;
  const bad = list.map((c) => (c.aspect === "價格" ? priceConflict(c.quote, brand, map) : "")).find(Boolean);
  return (
    <div className="space-y-1">
      {short(list).map((x) => (
        <p key={x.text} className="flex items-baseline gap-2">
          <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: CHIP[x.by] ?? "#5f6a80" }} title={x.by} />
          <span>{x.text}</span>
        </p>
      ))}
      {bad && <p className="text-[14px] font-semibold text-warn">! {bad}</p>}
      <details>
        <summary className="cursor-pointer text-[13px] text-ink3 hover:text-ink">看原文（{list.length} 句）</summary>
        <ul className="mt-2 space-y-2 text-[14px] text-ink2">
          {list.map((c, i) => (
            <li key={i}>
              <span className="mr-1.5 font-semibold" style={{ color: CHIP[ENGINE(c.engine)] }}>{ENGINE(c.engine)}</span>
              {c.quote}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// 還沒問過：按了才問（約 1 分鐘）
export function AskCompare({ jobId, onDone }: { jobId: string | null; onDone: (d: { aiCompare?: AiCompare; rivalMap?: RivalMapLike }) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!jobId) return null;
  async function go() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/geo/rival-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, compare: true }) });
      const d = (await res.json()) as { aiCompare?: AiCompare; rivalMap?: RivalMapLike; error?: string };
      if (!res.ok || !d.aiCompare) throw new Error(d.error || "問 AI 失敗，請稍後再試。");
      onDone(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "問 AI 失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-[10px] border border-line bg-card p-5">
      <p className="text-[17px] font-bold text-ink">AI 怎麼比較你和對手</p>
      <button type="button" onClick={go} disabled={busy} className="mt-3 rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-paper disabled:opacity-50">
        {busy ? "正在問三家 AI，約 1～2 分鐘…" : "問三家 AI 比較"}
      </button>
      {err && <p className="mt-2 text-[15px] text-fail">✗ {err}</p>}
    </div>
  );
}

export function AiCompareView({ data, map }: { data: AiCompare; map?: RivalMapLike | null }) {
  const [me, ...rivals] = data.brands;
  const [pick, setPick] = useState(rivals[0] ?? "");
  const of = (brand: string, aspect: string) => data.cells.filter((c) => c.brand === brand && c.aspect === aspect);
  return (
    <div className="rounded-[10px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[17px] font-bold text-ink">AI 怎麼比較你和對手</p>
        <p className="flex flex-wrap gap-4 text-[14px] text-ink2">
          {Object.entries(CHIP).map(([n, c]) => (
            <span key={n} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
              {n}
            </span>
          ))}
          <span className="text-ink3">AI 的看法，不一定對</span>
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {rivals.map((n) => (
          <button key={n} type="button" aria-pressed={n === pick} onClick={() => setPick(n)} className={`rounded-full border px-3.5 py-1.5 text-[15px] ${n === pick ? "border-ink bg-ink font-semibold text-paper" : "border-line text-ink2 hover:border-ink"}`}>
            {n}
          </button>
        ))}
      </div>
      <table className="mt-4 w-full table-fixed text-left text-[15px] leading-relaxed">
        <thead>
          <tr className="border-b border-line">
            <th className="w-[10em] py-2 font-normal text-ink3" />
            <th className="py-2 pr-6 font-bold text-[var(--goldInk)]"><span className="mr-2 inline-block h-[12px] w-[12px] rounded-full border-[1.5px] border-[var(--goldInk)] bg-lime" />{me}</th>
            <th className="py-2 font-bold text-ink"><span className="mr-2 inline-block h-[12px] w-[12px] rounded-full bg-ink" />{pick}</th>
          </tr>
        </thead>
        <tbody>
          {(data.aspects ?? ASPECTS).map((a) => (
            <tr key={a} className="border-b border-line align-top last:border-b-0">
              <th className="py-4 font-semibold text-ink"><span className="flex items-center gap-2">{ICON[a]}{a}</span></th>
              <td className="py-3 pr-6 text-ink"><Cell list={of(me, a)} map={map} brand={me} /></td>
              <td className="py-3 text-ink"><Cell list={of(pick, a)} map={map} brand={pick} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-[15px] font-semibold text-ink2 hover:text-ink">看三家 AI 的完整回答和引用來源</summary>
        <p className="mt-3 text-[14px] text-ink3">問題：{data.question}</p>
        {data.answers.map((x) => (
          <div key={x.engine} className="mt-4">
            <p className="text-[15px] font-bold text-ink">{x.engine}</p>
            <p className="mt-1 max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-paper p-4 text-[14px] leading-relaxed text-ink2">{x.answer}</p>
            <p className="mt-2 text-[13px]">
              {x.citations.slice(0, 12).map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer" className="report-table-link mr-3 inline-block max-w-[300px] truncate align-bottom">
                  {c.title || c.url} ↗
                </a>
              ))}
            </p>
          </div>
        ))}
      </details>
    </div>
  );
}
