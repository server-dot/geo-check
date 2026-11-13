"use client";

// ── 品牌輪廓 ─────────────────────────────────────────────
// 2026-11-03 小積木：表格「不夠有 AI 如何了解你的品牌輪廓的感」→ 改成關鍵詞＋每家 AI 一張卡。
// 2026-11-12 又嫌三張卡「易讀性太低」，要「心智圖的感覺」（11-13 看過 ASCII 樣稿說好）：
// 中間品牌名，五個分支（品類／產品服務／特色／價格／通路），葉子是 AI 的說法，點點＝幾家 AI 這樣講。
// 每家 AI 開口第一句收在下面的展開區。上方關鍵詞雲拿掉（心智圖已經涵蓋），總覽頁仍用 KeywordCloud。

import type { BrandProfile as Profile, ProfileKeyword, ProfileRow } from "@/lib/geo-brand-profile";

function chips(value: string): string[] {
  return value
    .split(/[、，／/]+|,(?!\d)/) // 千分位逗號不切（NT$1,000）
    .map((s) => s.trim())
    .filter(Boolean);
}

function kwStyle(n: number, total: number) {
  if (n >= total) return "bg-ink text-white text-[18px] font-bold px-4 py-2";
  if (n >= 2) return "bg-lime/25 text-ink text-[16px] font-semibold px-3.5 py-1.5 border border-lime";
  return "bg-card text-ink2 text-[15px] px-3 py-1.5 border border-line";
}

export function KeywordCloud({ keywords, total, size = "lg" }: { keywords: ProfileKeyword[]; total: number; size?: "lg" | "sm" }) {
  return (
    <div>
      <div className={`flex flex-wrap items-center ${size === "lg" ? "gap-3" : "gap-2"}`}>
        {keywords.map((k) => (
          <span key={k.word} title={`${k.engines.join("、")}`} className={`rounded-full ${kwStyle(k.engines.length, total)}`}>
            {k.word}
            <span className="ml-1.5 text-[14px] font-normal opacity-70">{k.engines.length}/{total}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-5 text-[14px] text-ink3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-ink" />
          {total} 家都這樣說
        </span>
        {total > 2 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border border-lime bg-lime/25" />2 家
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-line bg-card" />1 家
        </span>
      </div>
    </div>
  );
}

interface Leaf {
  word: string;
  engines: string[];
}

function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s，,、／/（）()「」：:]/g, "").toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

// 11-13 前存的報告，關鍵詞沒標屬於哪一支：拿關鍵詞跟「講這個詞的那幾家 AI」在各分支的原話比字，最像的那支
function guessField(k: ProfileKeyword, rows: ProfileRow[], engines: string[]): ProfileRow["key"] | null {
  const kb = bigrams(k.word);
  let best: { key: ProfileRow["key"]; score: number } | null = null;
  for (const r of rows) {
    let score = 0;
    for (const e of k.engines) {
      const v = r.cells[engines.indexOf(e)]?.value ?? "";
      const vb = bigrams(v);
      kb.forEach((b) => vb.has(b) && score++);
    }
    if (score > 0 && (!best || score > best.score)) best = { key: r.key, score };
  }
  return best?.key ?? null;
}

// 每一支的葉子：優先用合併過的關鍵詞（意思相同已合併、標好幾家講）；
// 某一支一個關鍵詞都沒分到，就直接拿各家原話切開（同一句話才合併）
function leavesOf(profile: Profile): Record<string, Leaf[]> {
  const { engines, rows } = profile;
  const out: Record<string, Leaf[]> = Object.fromEntries(rows.map((r) => [r.key, []]));
  for (const k of profile.keywords ?? []) {
    const f = k.field ?? guessField(k, rows, engines);
    if (f && out[f]) out[f].push({ word: k.word, engines: k.engines });
  }
  for (const r of rows) {
    if (out[r.key].length > 0) continue;
    const merged = new Map<string, string[]>();
    r.cells.forEach((c, i) => {
      if (!c.value) return;
      for (const w of chips(c.value)) merged.set(w, [...(merged.get(w) ?? []), engines[i]]);
    });
    out[r.key] = [...merged].map(([word, es]) => ({ word, engines: es }));
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.engines.length - a.engines.length);
  return out;
}

// 配色跟積木官網：金色實心＝共識、米白金框＝兩家、白底灰框＝一家；字一律深藍灰（金色不當文字）
function leafStyle(n: number, total: number) {
  if (n >= total && total > 1) return "bg-lime text-ink font-bold border-2 border-ink";
  if (n >= 2) return "bg-[var(--limeTint)] text-ink font-semibold border border-lime-dark";
  return "bg-card text-ink2 border border-line";
}

function Dots({ n, total, light }: { n: number; total: number; light?: boolean }) {
  return (
    <span className="ml-2 inline-flex gap-[3px] align-middle" aria-label={`${total} 家裡有 ${n} 家這樣說`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-[7px] w-[7px] rounded-full ${i < n ? "bg-ink" : light ? "bg-ink/25" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

const BRANCH: Record<string, string> = { category: "品類", products: "產品服務", features: "特色", price: "價格", channels: "通路" };

// 樹狀連接線：每支自己畫靠主幹那側的直線＋一小段橫線，對齊分支標籤（距頂 25px），不對齊整列中間。
// 心智圖左右兩邊都有分支，左邊那組線畫在右側（鏡像）
const LI_R =
  "relative py-2 pl-6 before:absolute before:left-0 before:top-[25px] before:h-px before:w-6 before:bg-lime-dark " +
  "after:absolute after:left-0 after:top-0 after:bottom-0 after:w-px after:bg-lime-dark first:after:top-[25px] last:after:bottom-auto last:after:h-[25px]";
const LI_L =
  "relative py-2 pr-6 before:absolute before:right-0 before:top-[25px] before:h-px before:w-6 before:bg-lime-dark " +
  "after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-lime-dark first:after:top-[25px] last:after:bottom-auto last:after:h-[25px]";

// 舊報告沒有 AI 寫的每家摘要：拿這家 AI 在五支裡的說法拼一段（不花錢）
function fallbackSummary(profile: Profile, i: number): string {
  const v = (k: string) => profile.rows.find((r) => r.key === k)?.cells[i]?.value ?? "";
  const parts = [
    v("category") && `介紹成${v("category")}`,
    v("products") && `主打${v("products")}`,
    v("features") && `特色是${v("features")}`,
    v("price") ? `價格${v("price").replace(/^價格/, "")}` : "沒提到價格",
    v("channels") ? `通路是${v("channels")}` : "沒提到通路",
  ].filter(Boolean);
  return `${parts.join("，")}。`;
}

export function BrandProfileView({ profile, brandName }: { profile: Profile; brandName: string }) {
  const total = profile.engines.length;
  const leaves = leavesOf(profile);
  const conflicts = profile.rows.filter((r) => r.conflict);
  const mismatches = profile.rows.flatMap((r) => r.cells.filter((c) => c.siteMismatch).map((c) => ({ label: BRANCH[r.key] ?? r.label, c })));

  // 左右兩邊分支：照葉子數量對半分，左邊放前幾支
  const counts = profile.rows.map((r) => Math.max(1, (leaves[r.key] ?? []).length));
  const half = counts.reduce((a, b) => a + b, 0) / 2;
  let acc = 0;
  let split = 0;
  while (split < counts.length - 1 && acc + counts[split] <= half) acc += counts[split++];
  if (split === 0) split = 1;
  const leftRows = profile.rows.slice(0, split);
  const rightRows = profile.rows.slice(split);

  // 滑鼠移上去看：哪幾家講的、各家原話
  const tip = (r: ProfileRow, l: Leaf) =>
    l.engines
      .map((e) => {
        const c = r.cells[profile.engines.indexOf(e)];
        return `${e}：${c?.quote || c?.value || ""}`;
      })
      .join("\n");

  const branch = (r: ProfileRow, side: "l" | "r") => {
    const ls = leaves[r.key] ?? [];
    return (
      <li key={r.key} className={side === "r" ? LI_R : LI_L}>
        <div className={`flex items-start ${side === "l" ? "flex-row-reverse" : ""}`}>
          <span className="w-[92px] shrink-0 rounded-lg border-2 border-ink bg-card px-3 py-1 text-center text-[15px] font-bold text-ink">
            {BRANCH[r.key] ?? r.label}
            {r.conflict && <span className="ml-1 text-warn">⚠</span>}
          </span>
          <div className="mt-[17px] h-px w-4 shrink-0 bg-lime-dark" />
          <div className={`flex min-w-0 flex-1 flex-wrap gap-2 py-0.5 ${side === "l" ? "justify-end" : ""}`}>
            {ls.length > 0 ? (
              ls.map((l) => (
                <span
                  key={l.word}
                  title={tip(r, l)}
                  className={`inline-flex cursor-default items-center rounded-full px-3 py-1 text-[15px] ${leafStyle(l.engines.length, total)}`}
                >
                  {r.key === "price" ? l.word.replace(/^價格(?=.)/, "") : l.word}
                  <Dots n={l.engines.length} total={total} light={l.engines.length >= total && total > 1} />
                </span>
              ))
            ) : (
              <span className="py-1 text-[15px] text-ink3">沒有 AI 提到</span>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="rounded-xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(48,60,84,.07)]">
      {/* 心智圖：品牌在正中間，分支往左右兩邊長，只放關鍵詞 */}
      <div className="grid items-center gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <ul className="order-2 min-w-0 lg:order-1">{leftRows.map((r) => branch(r, "l"))}</ul>
        <div className="order-1 flex items-center justify-center lg:order-2">
          <div className="hidden h-px w-6 bg-lime-dark lg:block" />
          <div className="rounded-xl border-2 border-ink bg-lime px-6 py-4 text-[20px] font-bold whitespace-nowrap text-ink shadow-[4px_4px_0_var(--ink)]">{brandName}</div>
          <div className="hidden h-px w-6 bg-lime-dark lg:block" />
        </div>
        <ul className="order-3 min-w-0">{rightRows.map((r) => branch(r, "r"))}</ul>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-5 text-[14px] text-ink3">
        <span className="flex items-center">
          <Dots n={total} total={total} />
          <span className="ml-1.5">{total} 家都這樣說</span>
        </span>
        {total > 2 && (
          <span className="flex items-center">
            <Dots n={2} total={total} />
            <span className="ml-1.5">2 家</span>
          </span>
        )}
        <span className="flex items-center">
          <Dots n={1} total={total} />
          <span className="ml-1.5">1 家</span>
        </span>
      </div>

      {/* 每家 AI 怎麼介紹你：各一段摘要（原文在下面「各平台回答原文」） */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {profile.engines.map((e, i) => (
          <div key={e} className="rounded-xl border-2 border-ink bg-gradient-to-b from-card to-[var(--limeTint)] px-5 py-4">
            <p className="text-[15px] font-bold text-ink">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-lime align-middle" />
              {e} 怎麼介紹你
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{profile.summaries?.[i] || fallbackSummary(profile, i)}</p>
          </div>
        ))}
      </div>

      {(mismatches.length > 0 || conflicts.length > 0) && (
        <div className="mt-4 space-y-1.5 text-[14px] text-ink2">
          {mismatches.map(({ label, c }) => (
            <p key={label + c.engine}>
              <span className="font-semibold text-fail">✗ {c.engine} 的{label}跟官網不同：</span>
              它說「{c.value}」，官網寫「{c.siteMismatch!.siteQuote}」
            </p>
          ))}
          {conflicts.map((r) => (
            <p key={r.key}>
              <span className="font-semibold text-warn">⚠ {BRANCH[r.key] ?? r.label}說法不一：</span>
              {r.conflict}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
