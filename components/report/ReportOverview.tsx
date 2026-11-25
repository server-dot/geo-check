// ── 報告總覽（儀表板式第一屏）──────────────────────────────
// 2026-11 參考 WorkDuo 的版面：第一屏回答「AI 有沒有推薦你」，不是技術分數。
// 每一段都用同一個模板（標題＋一行說明＋大數字或表格），不再每段換一種長相。
//
// 樣本很小：3 題 × 2 引擎＝6 個回答。6 個回答算百分比，「33%」其實就是 2 次，
// 看起來很準其實是雜訊——所以這裡的數字一律寫成「次數／總數」，不寫百分比。

import type { ReactNode } from "react";
import { Icon, StatTile } from "./StatTile";
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
  questions: { question: string; google?: "present" | "absent" | "failed"; results: AnswerLike[] }[];
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
  // 中文兩個字就是完整品牌名（康寶、婦潔），英文兩個字母（HH）才會誤中一堆東西
  if (head && (head.length >= 3 || (head.length === 2 && /^[\u4e00-\u9fff]{2}$/.test(head)))) out.add(head);
  // 「康寶 Knorr」後面的英文名也要比
  for (const w of full.match(/[a-z][a-z0-9\-]{3,}/g) ?? []) out.add(w);
  return [...out];
}

function spellingTokens(name: string): string[] {
  const parts = name.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
  return [...new Set(parts)].filter((t) => t.length >= 2);
}

// 同一個品牌的不同寫法併成一列：「賽吉兒Saugella」＝「SAUGELLA 賽吉兒」（組成一樣、順序不同），
// 「婦潔」⊂「婦潔 (VIGILL)」⊂「Vigill 婦潔」、「HH」⊂「HH 草本新淨界」（一個被另一個完全包含）。
// 次數取聯集（同一個回答不重複算），名字用最短的寫法。
function mergeSpellings(names: NameLike[]): NameLike[] {
  const out: (NameLike & { toks: string[] })[] = [];
  const sorted = [...names].sort((x, y) => spellingTokens(x.name).length - spellingTokens(y.name).length);
  for (const n of sorted) {
    const toks = spellingTokens(n.name);
    const host = toks.length
      ? out.find((h) => (n.kind ?? "brand") === (h.kind ?? "brand") && (h.toks.every((t) => toks.includes(t)) || toks.every((t) => h.toks.includes(t))))
      : undefined;
    if (!host) {
      out.push({ ...n, answers: n.answers ? [...n.answers] : undefined, toks });
      continue;
    }
    if (host.answers && n.answers) host.answers = [...new Set([...host.answers, ...n.answers])].sort((a, b) => a - b);
    host.count = host.answers ? host.answers.length : Math.max(host.count, n.count);
    host.engines = [...new Set([...host.engines, ...n.engines])];
    host.isSelf = host.isSelf || n.isSelf;
    host.toks = [...new Set([...host.toks, ...toks])];
    if (n.name.length < host.name.length) host.name = n.name;
  }
  return out.map((n) => { const { toks, ...rest } = n; void toks; return rest; });
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
  // 通路（電商、藥妝連鎖、評論網站、媒體、接案平台）：AI 叫客人去哪裡買／找，不是對手，不進排名
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
    // 第一段太短就用全名：「Q kangber」切出來只剩「Q」（11-12 aiqkangber 問完 AI 標題變成 Q）
    ((first) => ([...first].length >= 2 ? first : rec.brandName.trim()))(rec.brandName.split(/[\s|｜]/)[0]);
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
    // 11-12 試過不分對手／通路全部列，同一天小積木又說「提到誰不等於是對手，出任務不是對手」，改回來。
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
          <h2 className="text-[21px] font-bold text-ink">{title}</h2>
          {desc && <p className="mt-0.5 text-[15px] text-ink3">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  unit,
  note,
  tone,
  visual,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note: string;
  tone: Tone;
  visual?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink2">
          {t.glyph && <span className={`font-bold ${t.cls}`}>{t.glyph}</span>}
          {label}
        </p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[34px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</span>
          {unit && <span className="text-[15px] text-ink3">{unit}</span>}
        </p>
        <p className="mt-2 text-[14px] text-ink3">{note}</p>
      </div>
      {visual && <div className="shrink-0">{visual}</div>}
    </div>
  );
}

// 環形進度：part/whole
export function Ring({ part, whole, color = "var(--lime)", size = 64 }: { part: number; whole: number; color?: string; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = whole > 0 ? Math.min(1, part / whole) : 0;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--inset)" strokeWidth="8" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${frac * c} ${c}`} />
    </svg>
  );
}

// 每家 AI 一顆點：有／沒有
function EngineDots({ items }: { items: { label: string; ok: boolean }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-[14px] text-ink3">
          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${it.ok ? "bg-ok text-white" : "bg-inset text-ink3"}`}>
            {it.ok ? "✓" : "✗"}
          </span>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// 正負兩段長條
function PosNegBar({ pos, neg }: { pos: number; neg: number }) {
  const total = Math.max(1, pos + neg);
  return (
    <div className="w-[88px]">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-inset">
        <div className="bg-ok" style={{ width: `${(pos / total) * 100}%` }} />
        <div className="bg-fail" style={{ width: `${(neg / total) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[14px] tabular-nums">
        <span className="text-ok">✓{pos}</span>
        <span className="text-fail">✗{neg}</span>
      </div>
    </div>
  );
}

// ── 第一屏：4 個大數字 ─────────────────────────────────────

export function OverviewKpis({
  table,
  namedSelf,
  brandChecks,
  score,
  sentiment,
}: {
  table: BrandTable | null;
  namedSelf: number;
  brandChecks: { citedSelf: boolean; engine?: string }[];
  score: { score: number; grade: string; gradeLabel: string } | null;
  sentiment?: { pos: number; neg: number } | null;
}) {
  const total = table?.total ?? 0;
  const found = brandChecks.filter((b) => b.citedSelf).length;
  const rank = table?.selfRank ?? null;
  return (
    <div className="grid grid-cols-4 gap-4">
      {table ? (
        <Kpi
          label="AI 推薦你"
          value={`${namedSelf}/${total}`}
          unit="次回答"
          note={`${new Set(table.flat.map((f) => f.qi)).size} 個推薦題・${table.engines.length} 家 AI`}
          tone={namedSelf === 0 ? "fail" : namedSelf * 2 >= total ? "ok" : "warn"}
          visual={<Ring part={namedSelf} whole={total} />}
        />
      ) : (
        <Kpi label="AI 推薦你" value="—" note="還沒選題目問 AI" tone="none" />
      )}
      {brandChecks.length > 0 ? (
        <Kpi
          label="AI 認得你"
          value={`${found}/${brandChecks.length}`}
          unit="家 AI"
          note="用你的名字問，找得到你的官網"
          tone={found === 0 ? "fail" : found === brandChecks.length ? "ok" : "warn"}
          visual={<EngineDots items={brandChecks.map((b, i) => ({ label: shortEngine(b.engine ?? `AI ${i + 1}`), ok: b.citedSelf }))} />}
        />
      ) : (
        <Kpi label="AI 認得你" value="—" note="這次沒用你的名字問" tone="none" />
      )}
      {table ? (
        <Kpi
          label="推薦排名"
          value={rank ? `第 ${rank} 名` : "未上榜"}
          note={`AI 點名的 ${table.rows.length} 個品牌裡`}
          tone={rank === null ? "fail" : rank <= 3 ? "ok" : "warn"}
        />
      ) : (
        <Kpi label="推薦排名" value="—" note="還沒選題目問 AI" tone="none" />
      )}
      {sentiment && (
        <Kpi
          label="AI 評價"
          value={`${sentiment.pos}:${sentiment.neg}`}
          note={`好評 ${sentiment.pos} 條、缺點 ${sentiment.neg} 條`}
          tone={sentiment.neg === 0 ? "ok" : sentiment.pos >= sentiment.neg ? "warn" : "fail"}
          visual={<PosNegBar pos={sentiment.pos} neg={sentiment.neg} />}
        />
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
      <table className="w-full min-w-[560px] text-[15px]">
        <thead>
          <tr className="border-b border-line bg-inset/60 text-left text-[14px] font-medium text-ink3">
            <th className="w-24 whitespace-nowrap px-4 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">品牌</th>
            <th className="px-3 py-2.5 font-medium">被推薦次數（{table.total} 次回答）</th>
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
            const tied = table.rows.filter((o) => o.count === r.count).length > 1;
            return (
              <tr key={(r.isSelf ? "self:" : "") + r.name} className={`border-b border-line last:border-0 ${r.isSelf ? "bg-lime/[.08]" : ""}`}>
                <td className="mono px-4 py-2.5 text-right text-[14px] text-ink3">{r.count > 0 ? `${tied ? "並列 " : ""}${rank}` : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={r.isSelf ? "font-bold text-ink" : "text-ink"}>{r.name}</span>
                  {r.isSelf && (
                    <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[14px] font-bold text-ink">你</span>
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
                    <span className="mono w-10 shrink-0 text-[14px] text-ink2 tabular-nums">
                      {r.count}/{table.total}
                    </span>
                  </div>
                </td>
                {table.engines.map((e) => (
                  <td key={e} className="mono px-3 py-2.5 text-right text-[14px] text-ink2 tabular-nums">
                    {r.byEngine ? `${r.byEngine[e]}/${table.engineTotals[e]}` : "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-[14px] text-ink3">另外 {hidden} 個品牌被點名的次數更少，不列。</p>
      )}
    </div>
  );
}

// ── 左側目錄（桌機才出現）──────────────────────────────────

export function ReportNav({
  items,
  active,
  onSelect,
}: {
  items: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="報告目錄">
      <p className="eyebrow mb-2 px-3 text-[#a7b1c2]">報告目錄</p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              aria-current={it.id === active ? "page" : undefined}
              className={`report-nav-link w-full text-left ${it.id === active ? "report-nav-link--active" : ""}`}
            >
              {it.label}
            </button>
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
      <p className="text-[14px] font-medium text-ink2">聲量佔比</p>
      <p className="mt-0.5 text-[14px] text-ink3">所有被點名的 {sum} 次裡，各品牌佔幾次</p>
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
            <span className="ml-1 text-[15px] font-normal text-ink3">/ {sum} 次</span>
          </p>
          <p className="mt-1 text-[14px] text-ink3">是在點名你</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[14px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className={`min-w-0 flex-1 truncate ${s.isSelf ? "font-bold text-ink" : "text-ink2"}`}>{s.label}</span>
            <span className="mono text-[14px] text-ink3 tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 每一題的結果 ───────────────────────────────────────────

interface QuestionLike {
  question: string;
  altQuestion?: string;
  source?: { site: string; title: string; link: string }; // 取自網友在論壇真的問過的問題
  google?: "present" | "absent" | "failed";
  results: { engine: string; namedSelf?: boolean; citedSelf: boolean }[];
}

// 一題、一家 AI：兩種問法裡推了你幾次。只看「答案有沒有點名推薦你」——
// 引用（來源列出你的網站）是另一件事，放在「引用來源」頁，不混進這格。
function Verdict({ named, total }: { named: number; total: number }) {
  const all = total > 0 && named === total;
  const cls = all ? "bg-ok text-white" : named > 0 ? "bg-ok/15 text-ok" : "bg-fail/10 text-fail";
  const label = named > 0 ? `✓ 推薦你${total > 1 ? ` ${named}/${total}` : ""}` : `✗ 沒推薦${total > 1 ? ` 0/${total}` : ""}`;
  return <span className={`inline-flex w-full justify-center rounded-md px-2 py-1.5 text-[14px] font-semibold ${cls}`}>{label}</span>;
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
      <table className="w-full min-w-[720px] text-[15px]">
        <thead>
          <tr className="border-b border-line bg-inset/60 text-left text-[14px] text-ink3">
            <th className="px-4 py-2.5 font-medium">題目</th>
            {table.engines.map((e) => (
              <th key={e} className="w-[110px] px-3 py-2.5 font-medium">
                {e}
              </th>
            ))}
            <th className="w-[34%] px-3 py-2.5 font-medium">其他被推薦品牌</th>
          </tr>
        </thead>
        {questions.map((q, qi) => {
          const others = namedIn(qi);
          return (
            <tbody key={q.question} className="border-b border-line last:border-0">
              <tr>
                <td className="px-4 pt-3 pb-1 align-top text-ink">
                  {q.question}
                  {q.source && (
                    <p className="mt-1 text-[14px] text-ink3">
                      出自 {q.source.site} 網友：
                      <a href={q.source.link} target="_blank" rel="noopener noreferrer" className="report-table-link">
                        「{q.source.title}」↗
                      </a>
                    </p>
                  )}
                  {q.altQuestion && <p className="mt-1 text-[14px] text-ink3">另一種問法：{q.altQuestion}</p>}
                </td>
                {table.engines.map((e) => {
                  const rs = q.results.filter((x) => shortEngine(x.engine) === e);
                  return (
                    <td key={e} className="px-3 pt-3 pb-1 align-top text-[14px]">
                      {rs.length > 0 ? (
                        <Verdict named={rs.filter((r) => r.namedSelf).length} total={rs.length} />
                      ) : e === "Google AI 摘要" && q.google === "absent" ? (
                        <span className="text-ink3">沒出 AI 摘要</span>
                      ) : e === "Google AI 摘要" && q.google === "failed" ? (
                        <span className="text-ink3">沒查到（查詢失敗）</span>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 pt-3 pb-1 align-top text-[14px] text-ink2">
                  {others.length === 0
                    ? <span className="text-ink3">沒有點名別人</span>
                    : others.slice(0, 4).map((o) => o.name).join("、") + (others.length > 4 ? ` 等 ${others.length} 個` : "")}
                </td>
              </tr>
              <tr>
                <td colSpan={table.engines.length + 2} className="px-4 pb-3">
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[14px] text-ink3 hover:text-ink">
                      <span className="group-open:hidden">▸ 看每一則回答</span>
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
      {table.engines.includes("Google AI 摘要") && (
        // 11-17 代查改用 Bright Data 台灣住家 IP 後跟實測接近，但同一句查 3 次仍有 1 次品牌不同（每次現場生成）
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink3">
          Google AI 摘要每次搜尋都會重新生成，同一句在台灣搜兩次，列出的品牌也可能不一樣，只能當參考。
        </p>
      )}
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
      <table className="w-full min-w-[520px] text-[15px]">
        <thead>
          <tr className="border-b border-line bg-inset/60 text-left text-[14px] text-ink3">
            <th className="w-10 px-4 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">網站</th>
            <th className="px-3 py-2.5 font-medium">被引用次數</th>
            <th className="px-3 py-2.5 text-right font-medium">出現在幾題</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, rank }) => (
            <tr key={d.domain} className={`border-b border-line last:border-0 ${d.isSelf ? "bg-lime/[.08]" : ""}`}>
              <td className="mono px-4 py-2.5 text-right text-[14px] text-ink3">{rank}</td>
              <td className="px-3 py-2.5">
                <a href={d.sampleUrl} target="_blank" rel="noopener noreferrer" className="report-table-link mono">
                  {d.domain}
                </a>
                {d.isSelf && <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[14px] font-bold text-ink">你</span>}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-inset">
                    <div className={`h-full rounded-full ${d.isSelf ? "bg-lime" : "bg-ink3/45"}`} style={{ width: `${(d.count / peak) * 100}%` }} />
                  </div>
                  <span className="mono w-8 shrink-0 text-[14px] text-ink2 tabular-nums">{d.count}</span>
                </div>
              </td>
              <td className="mono px-3 py-2.5 text-right text-[14px] text-ink2">{d.keywords.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {domains.length > rows.length && (
        <p className="border-t border-line px-4 py-2.5 text-[14px] text-ink3">
          另外 {domains.length - rows.length} 個網站被引用的次數更少，不列。
          {selfIdx === -1 && " 你的網站不在 AI 引用的名單裡。"}
        </p>
      )}
      {domains.length <= rows.length && selfIdx === -1 && (
        <p className="border-t border-line px-4 py-2.5 text-[14px] text-ink3">你的網站不在 AI 引用的名單裡。</p>
      )}
    </div>
  );
}

// 非對手一行帶過：通路、媒體、被建議去問的專家，不算進排名，但列出來有參考價值
export function ChannelList({ table }: { table: BrandTable }) {
  if (table.channels.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-line bg-card px-4 py-3 text-[14px]">
      <span className="font-medium text-ink2">其他提及對象</span>
      <span className="ml-2 text-[14px] text-ink3">（平台、通路、媒體、專家，不算對手）</span>
      <p className="mt-1.5 leading-relaxed text-ink2">
        {table.channels.map((c, i) => (
          <span key={c.name}>
            {i > 0 && "、"}
            {c.name}
            <span className="mono ml-0.5 text-[14px] text-ink3">×{c.count}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

// ── AI 引用了哪些網頁（一頁一列＋類型）─────────────────────
// 參考 WorkDuo：只列網域客戶看不懂（24h.pchome.com.tw 是什麼？），要列「哪一篇文章」，
// 再標上它是電商、媒體、社群還是對手官網。

export interface CitedPage {
  url: string;
  title: string;
  host: string;
  type: SourceType;
  brand: string; // 你／對手的品牌名（其他類型是空字串）
  count: number;
  questions: number;
  answerKeys: string[]; // 哪幾則回答引用了這頁（「題號-第幾個回答」），合併成網站時用來算「幾則回答」
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
  // 平台／通路（出任務、蝦皮…）的網站不是對手官網：網域對到通路名就歸「電商／平台」，品牌記成通路名
  const channelSlugs = brandSlugs(table.channels.map((c) => c.name)).filter((s) => !selfSlugs.includes(s));
  const channelOf = (host: string) => table.channels.find((c) => brandSlugs([c.name]).some((x) => host.split(".")[0].includes(x)))?.name ?? "";
  const rivals = brandSlugs(rivalRows.map((r) => r.name)).filter((s) => !selfSlugs.includes(s) && !channelSlugs.includes(s));
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
  const byKey = new Map<string, CitedPage & { qs: Set<number>; ans: Set<string> }>();
  rec.questions.forEach((q, qi) => {
    q.results.forEach((r, ri) => {
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
          const channel = type !== "self" ? channelOf(host) : "";
          if (channel) {
            // 「其他提及對象」也收媒體（Women's Health）：網域規則已判成媒體／社群的只借名字，不改成電商
            if (type !== "media" && type !== "social") type = "shop";
            brand = channel;
          } else if (type === "competitor" || type === "other") {
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
            answerKeys: [],
            mentionsSelf: isSelf || self.some((t) => title.toLowerCase().includes(t)),
            qs: new Set(),
            ans: new Set(),
          };
          byKey.set(key, p);
        }
        p.count += 1;
        p.qs.add(qi);
        p.ans.add(`${qi}-${ri}`);
        if (!p.title && c.title) p.title = c.title;
      }
    });
  });
  // 同一個網域只要有一頁認得出是對手官網，整個網域都算那家（11-17 Relove：saugella.com.tw 引用 3 次，
  // 「賽吉兒」是中文比不到網域，只有標題寫「官方網站」那 1 頁被認出來，另外 2 頁掉到「其他網站」）
  const rivalHost = new Map<string, string>();
  for (const p of byKey.values()) if (p.type === "competitor" && p.brand) rivalHost.set(p.host, p.brand);
  for (const p of byKey.values()) {
    const b = rivalHost.get(p.host);
    if (b && p.type === "other") Object.assign(p, { type: "competitor", brand: b });
  }
  return [...byKey.values()]
    .map(({ qs, ans, ...p }) => ({ ...p, questions: qs.size, answerKeys: [...ans] }))
    .sort((a, b) => b.count - a.count || b.questions - a.questions);
}

const GENERIC_CJK = new Set(["私密", "保養", "護理", "清潔", "台灣", "官方", "官網", "生技", "生醫", "科技", "系列", "專家", "品牌"]);

export const TYPE_ORDER: SourceType[] = ["self", "competitor", "shop", "media", "social", "other"];
export const TYPE_COLOR: Record<SourceType, string> = {
  self: "var(--lime)",
  competitor: "#303c54",
  shop: "#8f99ab",
  media: "#b9c0cc",
  social: "#d3d8e0",
  other: "#e9ebf0",
};

const TYPE_ICON: Record<SourceType, ReactNode> = {
  self: Icon.home,
  competitor: Icon.people,
  shop: Icon.store,
  media: Icon.news,
  social: Icon.chat,
  other: Icon.globe,
};

// 圓環圖：各類網站佔 AI 參考連結的比例，中間寫總數
function SourceDonut({ parts, total }: { parts: { t: SourceType; n: number }[]; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const lens = parts.map((p) => (p.n / total) * c);
  const offs = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg viewBox="0 0 140 140" className="h-[180px] w-[180px] shrink-0" role="img" aria-label={`AI 一共附了 ${total} 個參考連結`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--inset)" strokeWidth="20" />
      {parts.map((p, i) => (
        <circle
          key={p.t}
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={TYPE_COLOR[p.t]}
          strokeWidth="20"
          strokeDasharray={`${lens[i]} ${c - lens[i]}`}
          strokeDashoffset={-offs[i]}
          transform="rotate(-90 70 70)"
        >
          <title>{`${SOURCE_LABEL[p.t]} ${p.n}`}</title>
        </circle>
      ))}
      <text x="70" y="68" textAnchor="middle" className="fill-ink text-[26px] font-bold">
        {total}
      </text>
      <text x="70" y="88" textAnchor="middle" className="fill-ink3 text-[11px]">
        個參考連結
      </text>
    </svg>
  );
}

// 「AI 參考了哪些網站」：11-13 小積木「版型很醜、字一堆，盡量用圖示圖表，方便行銷人員跟客戶說明」。
// 圓環＋各類大數字卡＋全部網站前 5 名長條（TopSitesCard）。競爭對手分析另放一張只列對手官網的
export function CitedPagesSection({ pages, selfLabel }: { pages: CitedPage[]; selfLabel: string }) {
  const total = pages.reduce((n, p) => n + p.count, 0);
  if (total === 0) return null;
  const byType = TYPE_ORDER.map((t) => ({ t, n: pages.filter((p) => p.type === t).reduce((s, p) => s + p.count, 0) }));
  const shown = byType.filter((x) => x.n > 0);
  const tiles = byType.filter((x) => x.t !== "other" && (x.n > 0 || x.t === "self"));
  const otherN = byType.find((x) => x.t === "other")?.n ?? 0;


  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-6 rounded-xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(48,60,84,.07)] md:flex-row">
        <SourceDonut parts={shown} total={total} />
        <div className={`grid w-full flex-1 gap-3 grid-cols-2 ${tiles.length >= 5 ? "lg:grid-cols-5" : tiles.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {tiles.map((x) => (
            <StatTile
              key={x.t}
              icon={TYPE_ICON[x.t]}
              value={x.n}
              label={SOURCE_LABEL[x.t]}
              tone={x.t === "self" ? "self" : "plain"}
              note={
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-ink/20" style={{ background: TYPE_COLOR[x.t] }} />
                  佔 {Math.round((x.n / total) * 100)}%
                </span>
              }
            />
          ))}
        </div>
      </div>
      <p className="-mt-2 text-[15px] leading-relaxed text-ink2">
        AI 回答你勾的問題時，會在答案裡附上參考連結，代表它是看了哪些網站才這樣回答。來自<strong className="text-ink">你的網站</strong>的連結越多，表示 AI 越把你當成資料來源；
        <strong className="text-ink">電商／平台</strong>多，表示 AI 是去購物網站、接案平台上找答案。
        {otherN > 0 && <span className="text-ink3">（另有 {otherN} 個連結來自其他網站）</span>}
      </p>
      <TopSitesCard pages={pages} selfLabel={selfLabel} />
    </div>
  );
}

// 最常被 AI 參考的網站：前 5 名長條＋你（不在前 5 也列），網址、頁面收進「看全部」。
// rivalsOnly：競爭對手分析用，只列對手官網＋你（11-17 小積木：「競品獨占回答的引用來源」屁用沒有，
// 「我要全部都是競爭對手的分析，原本的地方是綜合網站」）
export function TopSitesCard({
  pages: allPages,
  selfLabel,
  max = 5,
  rivalsOnly = false,
}: {
  pages: CitedPage[];
  selfLabel: string;
  max?: number;
  rivalsOnly?: boolean;
}) {
  if (allPages.reduce((n, p) => n + p.count, 0) === 0) return null;
  const pages = rivalsOnly ? allPages.filter((p) => p.type === "competitor" || p.type === "self") : allPages;
  if (rivalsOnly && !pages.some((p) => p.type === "competitor")) {
    return (
      <div className="rounded-xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(48,60,84,.07)]">
        <p className="text-[16px] font-bold text-ink">AI 最常參考的對手官網</p>
        <p className="mt-2 text-[15px] text-ink3">這次 AI 回答時沒有引用任何對手的官網，參考的是平台、媒體、論壇。</p>
      </div>
    );
  }
  // 一個網站一列（同一個品牌／平台的多個頁面合併）
  // 對手卡算「幾則回答引用了它」，不算連結數：AI 在一則回答裡貼同一家 6 個連結，連結數就灌成 6
  // （11-17 aiqkangber：livechat 5 次全來自同一則 Perplexity 回答，看起來跟 Raccoon AI 一樣強）
  const groups = new Map<string, { name: string; type: SourceType; host: string; count: number; ans: Set<string>; top: CitedPage | null }>();
  for (const p of pages) {
    const key = p.type === "self" ? "__self" : p.brand || p.host;
    const g = groups.get(key) ?? { name: p.type === "self" ? selfLabel : p.brand || p.host, type: p.type, host: p.host, count: 0, ans: new Set<string>(), top: null };
    g.count += p.count;
    for (const k of p.answerKeys ?? []) g.ans.add(k);
    if (!g.top || p.count > g.top.count) g.top = p;
    groups.set(key, g);
  }
  if (!groups.has("__self")) groups.set("__self", { name: selfLabel, type: "self", host: "", count: 0, ans: new Set<string>(), top: null });
  if (rivalsOnly) for (const g of groups.values()) g.count = g.ans.size;
  const all = [...groups.values()].sort((x, y) => y.count - x.count || Number(y.type === "self") - Number(x.type === "self"));
  const top = all.slice(0, max);
  const selfRow = all.find((g) => g.type === "self")!;
  if (!top.includes(selfRow)) top.push(selfRow);
  const peak = Math.max(1, ...top.map((x) => x.count));
  const rankOf = (g: (typeof all)[number]) => (g.count > 0 ? all.filter((o) => o.count > g.count).length + 1 : null);

  return (
    <div className="rounded-xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(48,60,84,.07)]">
      <p className="text-[16px] font-bold text-ink">{rivalsOnly ? "AI 最常參考的對手官網" : "最常被 AI 參考的網站"}</p>
      {rivalsOnly && <p className="mt-1 text-[14px] text-ink3">數字＝幾則 AI 回答附上了這家官網的連結（同一則貼好幾個連結只算 1）。只代表這次勾的題目</p>}
      <ul className="mt-4 space-y-3">
        {top.map((g) => {
          const isSelf = g.type === "self";
          return (
            <li key={g.name} className="grid grid-cols-[28px_minmax(0,200px)_1fr_48px] items-center gap-3">
              <span className="text-center text-[15px] font-bold text-ink3 tabular-nums">{rankOf(g) ?? "—"}</span>
              <span className="min-w-0">
                <span className={`block truncate text-[15px] ${isSelf ? "font-bold" : "font-medium"} text-ink`}>
                  {g.name}
                  {isSelf && <span className="ml-1.5 rounded-full bg-lime px-2 py-0.5 text-[13px] font-bold">你</span>}
                </span>
                {!isSelf && !rivalsOnly && <span className="text-[13px] text-ink3">{SOURCE_LABEL[g.type]}</span>}
              </span>
              <div className="h-4 overflow-hidden rounded-full bg-inset">
                <div className="h-full rounded-full" style={{ width: `${(g.count / peak) * 100}%`, background: g.type === "other" || g.type === "social" ? "#aab2c0" : TYPE_COLOR[g.type] }} />
              </div>
              <span className="text-right text-[15px] font-bold text-ink tabular-nums">{g.count}</span>
            </li>
          );
        })}
      </ul>
      {selfRow.count === 0 && <p className="mt-3 text-[15px] font-semibold text-fail">✗ 這次 AI 沒有參考你的網站</p>}

      <details className="mt-5 border-t border-line pt-4">
        <summary className="cursor-pointer text-[14px] text-ink3 hover:text-ink">看全部 {all.length} 個網站與 AI 參考的頁面</summary>
        <ul className="mt-3 divide-y divide-line text-[14px]">
          {all.map((g) => (
            <li key={g.name} className="flex items-baseline gap-3 py-2">
              <span className="w-8 shrink-0 text-right text-ink3 tabular-nums">{g.count}</span>
              <span className="w-[180px] shrink-0 truncate font-medium text-ink">{g.name}</span>
              {g.top ? (
                <a href={g.top.url} target="_blank" rel="noopener noreferrer" className="report-table-link min-w-0 truncate">
                  {g.top.title || g.top.url}
                </a>
              ) : (
                <span className="text-ink3">—</span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ── AI 怎麼評價你（輿情）───────────────────────────────────

interface SentimentThemeLike {
  theme: string;
  polarity: "positive" | "negative";
  count: number;
  engines: string[];
  quote: string;
  quoteEngine: string;
}

export function SentimentSection({ themes, answerCount, reviewQuery, wrong = [] }: { themes: SentimentThemeLike[]; answerCount: number; reviewQuery?: string; wrong?: { engine: string; who: string }[] }) {
  const pos = themes.filter((t) => t.polarity === "positive").length;
  const neg = themes.length - pos;
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line px-4 py-3">
        <p className="text-[15px] text-ink">
          <span className="font-bold text-ok">✓ 正面 {pos} 條</span>
          <span className="mx-2 text-ink3">·</span>
          <span className={`font-bold ${neg > 0 ? "text-fail" : "text-ink3"}`}>✗ 負面 {neg} 條</span>
        </p>
        <PosNegBar pos={pos} neg={neg} />
        <p className="text-[14px] text-ink3">
          從 {answerCount} 段提到你的回答整理{reviewQuery ? `（含另外直接問三家 AI「${reviewQuery}」）` : ""}
          {neg === 0 && themes.length > 0 ? "，這次 AI 沒有講到你的缺點" : ""}。每句引文的回答全文在下方「AI 回答紀錄」
        </p>
      </div>
      {wrong.length > 0 && (
        <p className="border-b border-line bg-fail/5 px-4 py-3 text-[15px] text-ink">
          <span className="font-semibold text-fail">✗ AI 認成別人：</span>
          {wrong.map((w) => `${w.engine} 講的是「${w.who}」`).join("；")}，不列入評價
        </p>
      )}
      {themes.length === 0 ? (
        <p className="px-4 py-4 text-[15px] text-ink3">這次 AI 提到你時只講事實（官網、產品），沒有評價。</p>
      ) : (
        <table className="w-full min-w-[520px] text-[15px]">
          <thead>
            <tr className="border-b border-line bg-inset/60 text-left text-[14px] text-ink3">
              <th className="px-4 py-2.5 font-medium">評價主題</th>
              <th className="w-[90px] px-3 py-2.5 font-medium">類別</th>
              <th className="w-[200px] px-3 py-2.5 font-medium">平台</th>
            </tr>
          </thead>
          <tbody>
            {themes.map((t) => (
              <tr key={t.theme} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{t.theme}</p>
                  {t.quote && (
                    <p className="mt-1 text-[14px] leading-relaxed text-ink3">
                      {t.quoteEngine}：「{t.quote}」
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[14px]">
                  {t.polarity === "positive" ? <span className="font-semibold text-ok">✓ 正面</span> : <span className="font-semibold text-fail">✗ 負面</span>}
                </td>
                <td className="px-3 py-2.5 text-[14px] text-ink2">{t.engines.join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
