// ── 報告總覽（儀表板式第一屏）──────────────────────────────
// 2026-11 參考 WorkDuo 的版面：第一屏回答「AI 有沒有推薦你」，不是技術分數。
// 每一段都用同一個模板（標題＋一行說明＋大數字或表格），不再每段換一種長相。
//
// 樣本很小：3 題 × 2 引擎＝6 個回答。6 個回答算百分比，「33%」其實就是 2 次，
// 看起來很準其實是雜訊——所以這裡的數字一律寫成「次數／總數」，不寫百分比。

import type { ReactNode } from "react";
import { brandSlugs, classifySource, SOURCE_LABEL, type SourceType } from "@/lib/geo-source-type";

interface AnswerLike {
  engine: string;
  namedSelf?: boolean;
  citations?: { url: string; title: string; isSelf: boolean }[];
}

interface NameLike {
  name: string;
  count: number;
  engines: string[];
  isSelf: boolean;
  kind?: "brand" | "channel";
  answers?: number[];
}

export interface RecommendLike {
  brandName: string;
  questions: { question: string; results: AnswerLike[] }[];
  names: NameLike[];
  totalAnswers: number;
  namedSelfCount: number;
  askedAt: string;
}

// 「ChatGPT（GPT-4o＋即時搜尋）」→「ChatGPT」：表頭放不下整串
export function shortEngine(engine: string): string {
  return engine.split(/[（(]/)[0].trim();
}

// 跟 lib/geo-recommend-visibility.ts 的 brandTokens 同一套規則（那支檔案有伺服器端的 import，前端不能直接拿）
function selfTokens(brandName: string): string[] {
  const full = brandName.trim().toLowerCase();
  const out = new Set<string>();
  if (full.length >= 2) out.add(full);
  const latin = full.match(/^[a-z0-9][a-z0-9\-]{2,}/)?.[0];
  if (latin) out.add(latin);
  const head = full.split(/[\s|｜\-–—:：]/)[0]?.trim();
  if (head && head.length >= 3) out.add(head);
  return [...out];
}

function spellingKey(name: string): string {
  const parts = name.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
  return [...new Set(parts)].sort().join("|");
}

function mergeSpellings(names: NameLike[]): NameLike[] {
  const byKey = new Map<string, NameLike>();
  const out: NameLike[] = [];
  for (const n of names) {
    const key = spellingKey(n.name);
    const host = key ? byKey.get(key) : undefined;
    if (!host) {
      const copy = { ...n, answers: n.answers ? [...n.answers] : undefined };
      if (key) byKey.set(key, copy);
      out.push(copy);
      continue;
    }
    if (host.answers && n.answers) host.answers = [...new Set([...host.answers, ...n.answers])].sort((a, b) => a - b);
    host.count = host.answers ? host.answers.length : Math.max(host.count, n.count);
    host.engines = [...new Set([...host.engines, ...n.engines])];
    host.isSelf = host.isSelf || n.isSelf;
    if (n.name.length < host.name.length) host.name = n.name;
  }
  return out;
}

export interface BrandRow {
  name: string;
  isSelf: boolean;
  count: number;
  // 每個引擎點名幾次；舊的快取結果沒有逐回答紀錄時是 null
  byEngine: Record<string, number> | null;
  // 點名它的回答位置（題目依序攤平），舊資料是 null
  hits: number[] | null;
}

export interface BrandTable {
  rows: BrandRow[];
  engines: string[];
  engineTotals: Record<string, number>;
  total: number;
  flat: { qi: number; engine: string; namedSelf: boolean }[];
  selfRank: number | null; // 沒被點名就是 null
  // 通路（電商、藥妝連鎖、評論網站、媒體）：AI 叫客人去哪裡買，不是對手，不進排名
  channels: { name: string; count: number }[];
}

export function buildBrandTable(rec: RecommendLike): BrandTable {
  const flat = rec.questions.flatMap((q, qi) =>
    q.results.map((r) => ({ qi, engine: shortEngine(r.engine), namedSelf: !!r.namedSelf })),
  );
  const engines = [...new Set(flat.map((f) => f.engine))];
  const engineTotals = Object.fromEntries(engines.map((e) => [e, flat.filter((f) => f.engine === e).length]));
  const perEngine = (hits: number[]) =>
    Object.fromEntries(engines.map((e) => [e, hits.filter((i) => flat[i]?.engine === e).length]));

  // 自己這一列用「回答正文有沒有點名你」（namedSelf）算，跟上面的大數字同一個來源。
  // 抽名字那一步的 isSelf 只認得名字長得像品牌的，會少算（站名跟賣的品牌不同時）。
  const selfHits = flat.map((f, i) => (f.namedSelf ? i : -1)).filter((i) => i >= 0);
  const isSelfName = (n: string) => {
    const k = n.toLowerCase();
    return selfTokens(rec.brandName).some((t) => k.includes(t) || (k.length >= 3 && t.includes(k)));
  };
  const selfName =
    rec.names.find((n) => isSelfName(n.name))?.name ??
    rec.brandName.match(/^[A-Za-z0-9][A-Za-z0-9\-]{2,}/)?.[0] ??
    rec.brandName.split(/[\s|｜]/)[0];
  const self: BrandRow = {
    name: selfName,
    isSelf: true,
    count: selfHits.length,
    byEngine: perEngine(selfHits),
    hits: selfHits,
  };

  // 同一個品牌被寫成「賽吉兒Saugella」「SAUGELLA 賽吉兒」：拆成英文字跟中文段，
  // 組成一樣（不管順序）就併成同一列，次數取聯集，名字用最短的寫法。
  const merged = mergeSpellings(rec.names);

  const others: BrandRow[] = merged
    // 不能直接用 n.isSelf 濾：抽名字時「那一行引用了你的網址」也會被標成 isSelf，
    // 結果 AI 在同一行推的施巴、豐傑生醫都被當成你，從表裡消失。這裡只認名字對得上的。
    .filter((n) => !isSelfName(n.name) && n.kind !== "channel")
    .map((n) => ({
      name: n.name,
      isSelf: false,
      count: n.answers ? n.answers.length : n.count,
      byEngine: n.answers ? perEngine(n.answers) : null,
      hits: n.answers ?? null,
    }))
    .sort((a, b) => b.count - a.count);

  // 同分時自己排在前面，方便找；名次照「比你多的有幾家」算，同分不算輸
  const at = others.findIndex((o) => o.count <= self.count);
  const rows = at === -1 ? [...others, self] : [...others.slice(0, at), self, ...others.slice(at)];
  const selfRank = self.count > 0 ? others.filter((o) => o.count > self.count).length + 1 : null;

  const channels = merged
    .filter((n) => n.kind === "channel" && !isSelfName(n.name))
    .map((n) => ({ name: n.name, count: n.answers ? n.answers.length : n.count }))
    .sort((a, b) => b.count - a.count);

  return { rows, engines, engineTotals, total: flat.length, flat, selfRank, channels };
}

// ── 共用模板 ───────────────────────────────────────────────

type Tone = "ok" | "warn" | "fail" | "none";
// 色盲下 warn/fail 幾乎同色，一律帶符號
const TONE: Record<Tone, { glyph: string; cls: string }> = {
  ok: { glyph: "✓", cls: "text-ok" },
  warn: { glyph: "△", cls: "text-warn" },
  fail: { glyph: "✗", cls: "text-fail" },
  none: { glyph: "", cls: "" },
};

export function DashSection({
  id,
  title,
  desc,
  right,
  children,
}: {
  id: string;
  title: string;
  desc?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[19px] font-bold text-ink">{title}</h2>
          {desc && <p className="mt-0.5 text-sm text-ink3">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, unit, note, tone }: { label: string; value: ReactNode; unit?: string; note: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <div className="rounded-[10px] border border-line bg-card px-5 py-4">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink2">
        {t.glyph && <span className={`font-bold ${t.cls}`}>{t.glyph}</span>}
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[34px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="text-sm text-ink3">{unit}</span>}
      </p>
      <p className="mt-2 text-xs text-ink3">{note}</p>
    </div>
  );
}

// ── 第一屏：4 個大數字 ─────────────────────────────────────

export function OverviewKpis({
  table,
  namedSelf,
  brandChecks,
  score,
}: {
  table: BrandTable | null;
  namedSelf: number;
  brandChecks: { citedSelf: boolean }[];
  score: { score: number; grade: string; gradeLabel: string } | null;
}) {
  const total = table?.total ?? 0;
  const found = brandChecks.filter((b) => b.citedSelf).length;
  const rank = table?.selfRank ?? null;
  return (
    <div className={`grid grid-cols-2 gap-3 ${score ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {table ? (
        <Kpi
          label="AI 推薦你"
          value={`${namedSelf}/${total}`}
          unit="次回答"
          note={`${table.flat.length / Math.max(1, table.engines.length)} 個推薦題 × ${table.engines.length} 家 AI`}
          tone={namedSelf === 0 ? "fail" : namedSelf * 2 >= total ? "ok" : "warn"}
        />
      ) : (
        <Kpi label="AI 推薦你" value="—" note="這次沒問到推薦題" tone="none" />
      )}
      {brandChecks.length > 0 ? (
        <Kpi
          label="AI 認得你"
          value={`${found}/${brandChecks.length}`}
          unit="家 AI"
          note="用你的名字問，找得到你的官網"
          tone={found === 0 ? "fail" : found === brandChecks.length ? "ok" : "warn"}
        />
      ) : (
        <Kpi label="AI 認得你" value="—" note="這次沒用你的名字問" tone="none" />
      )}
      {table ? (
        <Kpi
          label="推薦排名"
          value={rank ? `#${rank}` : "未上榜"}
          note={`AI 點名的 ${table.rows.length} 個品牌裡`}
          tone={rank === null ? "fail" : rank <= 3 ? "ok" : "warn"}
        />
      ) : (
        <Kpi label="推薦排名" value="—" note="這次沒問到推薦題" tone="none" />
      )}
      {score && (
        <Kpi
          label="技術健檢"
          value={score.score}
          unit={`分・${score.grade} 級`}
          note="AI 讀不讀得到你的網站"
          tone={score.score >= 70 ? "ok" : score.score >= 55 ? "warn" : "fail"}
        />
      )}
    </div>
  );
}

// ── AI 推薦了誰：品牌排名表 ────────────────────────────────

const MAX_ROWS = 10;

export function BrandRankTable({ table }: { table: BrandTable }) {
  const top = table.rows.slice(0, MAX_ROWS);
  const selfHidden = !top.some((r) => r.isSelf);
  const shown = selfHidden ? [...top, table.rows.find((r) => r.isSelf)!] : top;
  const hidden = table.rows.length - shown.length;
  const max = Math.max(1, ...table.rows.map((r) => r.count));

  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line bg-inset/60 text-left text-xs font-medium text-ink3">
            <th className="w-10 px-4 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">品牌</th>
            <th className="px-3 py-2.5 font-medium">被點名（{table.total} 次回答中）</th>
            {table.engines.map((e) => (
              <th key={e} className="px-3 py-2.5 text-right font-medium">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const rank = table.rows.filter((o) => o.count > r.count).length + 1;
            return (
              <tr key={(r.isSelf ? "self:" : "") + r.name} className={`border-b border-line last:border-0 ${r.isSelf ? "bg-lime/[.08]" : ""}`}>
                <td className="mono px-4 py-2.5 text-right text-xs text-ink3">{r.count > 0 ? rank : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={r.isSelf ? "font-bold text-ink" : "text-ink"}>{r.name}</span>
                  {r.isSelf && (
                    <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">你</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-inset">
                      <div
                        className={`h-full rounded-full ${r.isSelf ? "bg-lime" : "bg-ink3/45"}`}
                        style={{ width: `${(r.count / max) * 100}%` }}
                      />
                    </div>
                    <span className="mono w-10 shrink-0 text-xs text-ink2 tabular-nums">
                      {r.count}/{table.total}
                    </span>
                  </div>
                </td>
                {table.engines.map((e) => (
                  <td key={e} className="mono px-3 py-2.5 text-right text-xs text-ink2 tabular-nums">
                    {r.byEngine ? `${r.byEngine[e]}/${table.engineTotals[e]}` : "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink3">另外 {hidden} 個品牌被點名的次數更少，不列。</p>
      )}
    </div>
  );
}

// ── 左側目錄（桌機才出現）──────────────────────────────────

export function ReportNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="報告目錄" className="sticky top-24 hidden lg:block">
      <p className="eyebrow mb-3 text-ink3">報告目錄</p>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="report-nav-link">
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── 聲量佔比甜甜圈 ─────────────────────────────────────────
// 所有「被點名」的次數加起來，各品牌佔多少。前 5 名各一色，其餘併成「其他」。
const DONUT_COLORS = ["#303c54", "#5f6a80", "#8f99ab", "#b9c0cc", "#d9dde4"];

export function ShareDonut({ table }: { table: BrandTable }) {
  const all = table.rows.filter((r) => r.count > 0);
  const sum = all.reduce((n, r) => n + r.count, 0);
  if (sum === 0) return null;
  const top = all.slice(0, 5);
  const rest = sum - top.reduce((n, r) => n + r.count, 0);
  let colorIdx = 0;
  const segs = [
    ...top.map((r) => ({ label: r.name, value: r.count, isSelf: r.isSelf, color: r.isSelf ? "var(--lime)" : DONUT_COLORS[colorIdx++] })),
    ...(rest > 0 ? [{ label: "其他", value: rest, isSelf: false, color: "#eceef2" }] : []),
  ];
  const self = all.find((r) => r.isSelf);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="self-start rounded-[10px] border border-line bg-card p-5">
      <p className="text-[13px] font-medium text-ink2">聲量佔比</p>
      <p className="mt-0.5 text-xs text-ink3">所有被點名的 {sum} 次裡，各品牌佔幾次</p>
      <div className="mt-4 flex items-center gap-5">
        <svg viewBox="0 0 140 140" className="h-[124px] w-[124px] shrink-0 -rotate-90" aria-hidden="true">
          {segs.map((s) => {
            const len = (s.value / sum) * C;
            const el = (
              <circle
                key={s.label}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="20"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="min-w-0">
          <p className="text-[28px] font-bold leading-none text-ink tabular-nums">
            {self ? self.count : 0}
            <span className="ml-1 text-sm font-normal text-ink3">/ {sum} 次</span>
          </p>
          <p className="mt-1 text-xs text-ink3">是在點名你</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className={`min-w-0 flex-1 truncate ${s.isSelf ? "font-bold text-ink" : "text-ink2"}`}>{s.label}</span>
            <span className="mono text-xs text-ink3 tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 每一題的結果 ───────────────────────────────────────────

interface QuestionLike {
  question: string;
  results: { engine: string; namedSelf?: boolean; citedSelf: boolean }[];
}

function Verdict({ named, cited }: { named: boolean; cited: boolean }) {
  if (named) return <span className="font-semibold text-ok">✓ 推薦你</span>;
  if (cited) return <span className="text-warn">△ 查過你</span>;
  return <span className="text-fail">✗ 沒有你</span>;
}

export function QuestionTable({
  table,
  questions,
  renderDetail,
}: {
  table: BrandTable;
  questions: QuestionLike[];
  renderDetail: (qi: number) => ReactNode;
}) {
  // 每題「AI 推了誰」：點名落在這一題的回答裡的品牌（不含你），依次數排
  const namedIn = (qi: number) =>
    table.rows
      .filter((r) => !r.isSelf && r.hits)
      .map((r) => ({ name: r.name, n: r.hits!.filter((i) => table.flat[i]?.qi === qi).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);

  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line bg-inset/60 text-left text-xs text-ink3">
            <th className="px-4 py-2.5 font-medium">題目</th>
            {table.engines.map((e) => (
              <th key={e} className="w-[110px] px-3 py-2.5 font-medium">
                {e}
              </th>
            ))}
            <th className="w-[34%] px-3 py-2.5 font-medium">AI 同時推了誰</th>
          </tr>
        </thead>
        {questions.map((q, qi) => {
          const others = namedIn(qi);
          return (
            <tbody key={q.question} className="border-b border-line last:border-0">
              <tr>
                <td className="px-4 pt-3 pb-1 align-top text-ink">{q.question}</td>
                {table.engines.map((e) => {
                  const r = q.results.find((x) => shortEngine(x.engine) === e);
                  return (
                    <td key={e} className="px-3 pt-3 pb-1 align-top text-[13px]">
                      {r ? <Verdict named={!!r.namedSelf} cited={r.citedSelf} /> : <span className="text-ink3">—</span>}
                    </td>
                  );
                })}
                <td className="px-3 pt-3 pb-1 align-top text-[13px] text-ink2">
                  {others.length === 0
                    ? <span className="text-ink3">沒有點名別人</span>
                    : others.slice(0, 4).map((o) => o.name).join("、") + (others.length > 4 ? ` 等 ${others.length} 個` : "")}
                </td>
              </tr>
              <tr>
                <td colSpan={table.engines.length + 2} className="px-4 pb-3">
                  <details className="group">
                    <summary className="cursor-pointer list-none text-xs text-ink3 hover:text-ink">
                      <span className="group-open:hidden">▸ 看 AI 的完整回答</span>
                      <span className="hidden group-open:inline">▾ 收起</span>
                    </summary>
                    <div className="mt-3 space-y-3">{renderDetail(qi)}</div>
                  </details>
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

// ── AI 引用了哪些網站 ──────────────────────────────────────

interface DomainLike {
  domain: string;
  count: number;
  keywords: string[];
  isSelf: boolean;
  sampleUrl: string;
}

export function CitationTable({ domains, max = 10 }: { domains: DomainLike[]; max?: number }) {
  const top = domains.slice(0, max);
  const selfIdx = domains.findIndex((d) => d.isSelf);
  const extraSelf = selfIdx >= max ? domains[selfIdx] : null;
  const peak = Math.max(1, ...domains.map((d) => d.count));
  const rows = extraSelf ? [...top.map((d, i) => ({ d, rank: i + 1 })), { d: extraSelf, rank: selfIdx + 1 }] : top.map((d, i) => ({ d, rank: i + 1 }));
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line bg-inset/60 text-left text-xs text-ink3">
            <th className="w-10 px-4 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">網站</th>
            <th className="px-3 py-2.5 font-medium">被引用次數</th>
            <th className="px-3 py-2.5 text-right font-medium">出現在幾題</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, rank }) => (
            <tr key={d.domain} className={`border-b border-line last:border-0 ${d.isSelf ? "bg-lime/[.08]" : ""}`}>
              <td className="mono px-4 py-2.5 text-right text-xs text-ink3">{rank}</td>
              <td className="px-3 py-2.5">
                <a href={d.sampleUrl} target="_blank" rel="noopener noreferrer" className="report-table-link mono">
                  {d.domain}
                </a>
                {d.isSelf && <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">你</span>}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-inset">
                    <div className={`h-full rounded-full ${d.isSelf ? "bg-lime" : "bg-ink3/45"}`} style={{ width: `${(d.count / peak) * 100}%` }} />
                  </div>
                  <span className="mono w-8 shrink-0 text-xs text-ink2 tabular-nums">{d.count}</span>
                </div>
              </td>
              <td className="mono px-3 py-2.5 text-right text-xs text-ink2">{d.keywords.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {domains.length > rows.length && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink3">
          另外 {domains.length - rows.length} 個網站被引用的次數更少，不列。
          {selfIdx === -1 && " 你的網站不在 AI 引用的名單裡。"}
        </p>
      )}
      {domains.length <= rows.length && selfIdx === -1 && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink3">你的網站不在 AI 引用的名單裡。</p>
      )}
    </div>
  );
}

// 通路一行帶過：不是對手，但「AI 叫客人去哪裡買」本身有參考價值
export function ChannelList({ table }: { table: BrandTable }) {
  if (table.channels.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-line bg-card px-4 py-3 text-[13px]">
      <span className="font-medium text-ink2">AI 叫客人去哪裡買</span>
      <span className="ml-2 text-xs text-ink3">（通路，不是對手，不算進排名）</span>
      <p className="mt-1.5 leading-relaxed text-ink2">
        {table.channels.map((c, i) => (
          <span key={c.name}>
            {i > 0 && "、"}
            {c.name}
            <span className="mono ml-0.5 text-xs text-ink3">×{c.count}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

// ── AI 引用了哪些網頁（一頁一列＋類型）─────────────────────
// 參考 WorkDuo：只列網域客戶看不懂（24h.pchome.com.tw 是什麼？），要列「哪一篇文章」，
// 再標上它是電商、媒體、社群還是對手官網。

interface CitedPage {
  url: string;
  title: string;
  host: string;
  type: SourceType;
  brand: string; // 你／對手的品牌名（其他類型是空字串）
  count: number;
  questions: number;
  mentionsSelf: boolean;
}

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`;
  } catch {
    return u;
  }
}

export function buildCitedPages(rec: RecommendLike, table: BrandTable): CitedPage[] {
  const self = selfTokens(rec.brandName);
  const selfSlugs = brandSlugs([table.rows.find((r) => r.isSelf)?.name ?? "", rec.brandName]);
  const rivalRows = table.rows.filter((r) => !r.isSelf);
  const rivals = brandSlugs(rivalRows.map((r) => r.name)).filter((s) => !selfSlugs.includes(s));
  const selfName = table.rows.find((r) => r.isSelf)?.name ?? rec.brandName;
  // 這個網站是哪個對手的：網域裡有對手英文名，或標題裡有對手的中文名（「賽吉兒」「婦潔」）
  const rivalOf = (host: string, title: string): string => {
    const label = host.split(".")[0];
    const t = title.toLowerCase();
    for (const r of rivalRows) {
      const latin = brandSlugs([r.name]).filter((x) => !selfSlugs.includes(x));
      if (latin.some((x) => label.includes(x))) return r.name;
      const cjk = (r.name.match(/[\u4e00-\u9fff]{2,}/g) ?? []).filter((w) => !GENERIC_CJK.has(w));
      if (cjk.some((w) => t.includes(w)) || latin.some((x) => t.includes(x))) return r.name;
    }
    return "";
  };
  const byKey = new Map<string, CitedPage & { qs: Set<number> }>();
  rec.questions.forEach((q, qi) => {
    for (const r of q.results) {
      for (const c of r.citations ?? []) {
        let host = "";
        try {
          host = new URL(c.url).hostname.replace(/^www\./, "");
        } catch {
          continue;
        }
        // 自家的其他網域（foreverrelove.com.tw 跟 reloveshop.com.tw）也算你的網站
        const isSelf = c.isSelf || selfSlugs.some((s) => host.split(".")[0].includes(s));
        const key = normUrl(c.url);
        let p = byKey.get(key);
        if (!p) {
          const title = (c.title || "").trim();
          let type = classifySource(host, isSelf, rivals);
          let brand = type === "self" ? selfName : "";
          if (type === "competitor" || type === "other") {
            const who = rivalOf(host, title);
            // 「其他」網站的標題寫著對手名字＋官方網站，才升格成對手官網；媒體電商不動
            if (who && (type === "competitor" || /官網|官方/.test(title))) {
              type = "competitor";
              brand = who;
            }
          }
          p = {
            url: c.url,
            title,
            host,
            type,
            brand,
            count: 0,
            questions: 0,
            mentionsSelf: isSelf || self.some((t) => title.toLowerCase().includes(t)),
            qs: new Set(),
          };
          byKey.set(key, p);
        }
        p.count += 1;
        p.qs.add(qi);
        if (!p.title && c.title) p.title = c.title;
      }
    }
  });
  return [...byKey.values()]
    .map(({ qs, ...p }) => ({ ...p, questions: qs.size }))
    .sort((a, b) => b.count - a.count || b.questions - a.questions);
}

const GENERIC_CJK = new Set(["私密", "保養", "護理", "清潔", "台灣", "官方", "官網", "生技", "生醫", "科技", "系列", "專家", "品牌"]);

const TYPE_ORDER: SourceType[] = ["self", "competitor", "shop", "media", "social", "other"];
const TYPE_COLOR: Record<SourceType, string> = {
  self: "var(--lime)",
  competitor: "#303c54",
  shop: "#5f6a80",
  media: "#8f99ab",
  social: "#b9c0cc",
  other: "#e3e6ec",
};

export function CitedPagesSection({ pages, selfLabel, max = 10 }: { pages: CitedPage[]; selfLabel: string; max?: number }) {
  const total = pages.reduce((n, p) => n + p.count, 0);
  if (total === 0) return null;
  const byType = TYPE_ORDER.map((t) => ({ t, n: pages.filter((p) => p.type === t).reduce((s, p) => s + p.count, 0) })).filter((x) => x.n > 0);
  const top = [...byType].filter((x) => x.t !== "other").sort((a, b) => b.n - a.n)[0];
  const selfN = byType.find((x) => x.t === "self")?.n ?? 0;
  // 一個品牌一列：你自己＋對手官網。電商、媒體、社群只留在上面的分類長條
  const groups = new Map<string, { brand: string; isSelf: boolean; host: string; count: number; top: CitedPage | null }>();
  for (const p of pages) {
    if (p.type !== "self" && p.type !== "competitor") continue;
    const key = p.type === "self" ? "__self" : p.brand || p.host;
    const g = groups.get(key) ?? { brand: p.type === "self" ? p.brand : p.brand || p.host, isSelf: p.type === "self", host: p.host, count: 0, top: null };
    g.count += p.count;
    if (!g.top || p.count > g.top.count) g.top = p;
    groups.set(key, g);
  }
  if (!groups.has("__self")) groups.set("__self", { brand: selfLabel, isSelf: true, host: "", count: 0, top: null });
  const sites = [...groups.values()].sort((x, y) => y.count - x.count || Number(y.isSelf) - Number(x.isSelf)).slice(0, max);
  const peak = Math.max(1, ...sites.map((x) => x.count));

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-line bg-card p-5">
        <p className="text-sm text-ink">
          AI 回答時一共引用了 <strong>{total}</strong> 次網頁
          {top && (
            <>
              ，最多來自<strong>{SOURCE_LABEL[top.t]}</strong>（{top.n} 次）
            </>
          )}
          {selfN > 0 ? (
            <>，你的網站被引用 <strong>{selfN}</strong> 次。</>
          ) : (
            <>，<strong>沒有引用你的網站</strong>。</>
          )}
        </p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-inset">
          {byType.map((x) => (
            <div key={x.t} style={{ width: `${(x.n / total) * 100}%`, background: TYPE_COLOR[x.t] }} title={`${SOURCE_LABEL[x.t]} ${x.n}`} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
          {byType.map((x) => (
            <li key={x.t} className="flex items-center gap-1.5 text-ink2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TYPE_COLOR[x.t] }} />
              {SOURCE_LABEL[x.t]}
              <span className="mono text-xs text-ink3">{x.n}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
        <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium text-ink2">你跟對手的網站，各被 AI 引用幾次</p>
        {sites.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink3">這次 AI 沒有引用任何品牌的官網，引用的都是電商、媒體跟社群。</p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line bg-inset/60 text-left text-xs text-ink3">
                <th className="w-10 px-4 py-2.5 text-right font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">品牌</th>
                <th className="px-3 py-2.5 font-medium">被引用次數</th>
                <th className="px-3 py-2.5 font-medium">最常被引用的頁面</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((x, i) => (
                <tr key={x.brand} className={`border-b border-line last:border-0 ${x.isSelf ? "bg-lime/[.08]" : ""}`}>
                  <td className="mono px-4 py-2.5 text-right align-top text-xs text-ink3">{x.count > 0 ? i + 1 : "—"}</td>
                  <td className="px-3 py-2.5 align-top">
                    <span className={x.isSelf ? "font-bold text-ink" : "text-ink"}>{x.brand}</span>
                    {x.isSelf && <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">你</span>}
                    {x.host && <p className="mono mt-0.5 text-[11.5px] text-ink3">{x.host}</p>}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-inset">
                        <div className={`h-full rounded-full ${x.isSelf ? "bg-lime" : "bg-ink3/45"}`} style={{ width: `${(x.count / peak) * 100}%` }} />
                      </div>
                      <span className="mono shrink-0 text-xs text-ink2 tabular-nums">{x.count} 次</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[13px]">
                    {x.top ? (
                      <a href={x.top.url} target="_blank" rel="noopener noreferrer" className="report-table-link line-clamp-1">
                        {x.top.title || x.top.url}
                      </a>
                    ) : (
                      <span className="text-ink3">AI 沒有引用你的網站</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
