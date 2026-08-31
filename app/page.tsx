"use client";

import { Fragment, useState } from "react";

type BotStatus = "allowed" | "blocked" | "unknown" | "mismatch";

interface AiBotResult {
  ua: string;
  label: string;
  status: BotStatus;
  matchedRule: string;
}

type VisibilityStatus = "ok" | "thin" | "empty";

type PreviewBlock = { kind: "tags"; items: string[] } | { kind: "text"; text: string };

interface ContentVisibility {
  status: VisibilityStatus;
  textLength: number;
  substantiveChars: number;
  furnitureChars: number;
  htmlLength: number;
  scriptCount: number;
  preview: string;
  previewBlocks: PreviewBlock[];
  title: string;
  description: string;
  h1: string[];
  leadParagraphs: string[];
  jsonLdTypes: string[];
  summary: string;
  advice: string;
  duplicateBlockChars: number;
}

// 跟 lib/geo-keyword-visibility.ts 的 guessKeywordCandidates() 同一套邏輯，
// 這裡另外放一份純字串版本給前端即時算候選字（不需要打 API），純函式沒有
// fetch/env，跟後端那份保持邏輯一致但各自獨立維護，避免把伺服器端模組
// 拉進前端 bundle。
function guessKeywordCandidates(title: string, description: string, h1: string[]): string[] {
  const KEYWORD_MIN_CHARS = 2;
  const KEYWORD_MAX_CHARS = 16;
  const MAX_CANDIDATES = 5;
  const charLen = (s: string) => [...s].length;

  const pool: string[] = [];
  const titleParts = title.split(/[|｜\-–—:：]/).map((s) => s.trim()).filter(Boolean);
  const positioningText = [...titleParts.slice(1), ...h1].join(" ");
  pool.push(...positioningText.split(/[×xX,，、\s]+/));
  pool.push(...description.split(/[，,、。]/).slice(0, 4));

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of pool) {
    const clean = raw.replace(/\s+/g, " ").trim();
    const len = charLen(clean);
    if (len < KEYWORD_MIN_CHARS || len > KEYWORD_MAX_CHARS) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    candidates.push(clean);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

type SignalValue = "yes" | "no" | "unset";

interface ContentSignalItem {
  key: string;
  label: string;
  meaning: string;
  value: SignalValue;
}

interface ContentSignals {
  declared: boolean;
  raw: string;
  items: ContentSignalItem[];
}

interface WafHint {
  vendor: string;
  advice: string;
}

interface VisibilityCardData {
  engine: string;
  query: string;
  answer: string;
  citedSelf: boolean;
  citations: { url: string; title: string; isSelf: boolean }[];
  advice: string;
}

interface BrandVisibilityResult extends VisibilityCardData {
  brandName: string;
}

interface KeywordVisibilityResult extends VisibilityCardData {
  keyword: string;
}

interface LlmsTxtLink {
  text: string;
  url: string;
  description: string;
}

interface LlmsTxtQuality {
  status: "thin" | "ok";
  title: string;
  summary: string;
  links: LlmsTxtLink[];
  charCount: number;
  advice: string;
}

interface EngineResult {
  origin: string;
  robotsUrl: string;
  robotsStatus: "found" | "none" | "unreachable";
  robotsNote: string;
  wafHint: WafHint | null;
  results: AiBotResult[];
  visibility: ContentVisibility | null;
  visibilityNote: string;
  contentSignals: ContentSignals | null;
  llmsTxt: { exists: boolean | null; quality: LlmsTxtQuality | null };
  brandVisibility: BrandVisibilityResult[];
}

// 深度健檢單項（對應後端 CheckResult）
type CheckStatus = "ok" | "warn" | "fail";
interface CheckItem {
  key: string;
  level: string;
  category: string;
  item: string;
  status: CheckStatus;
  advice: string;
  evidence?: string;
  details?: { url: string; note: string }[];
}

type JobStatus = "engine" | "crawling" | "analyzing" | "completed" | "failed";

interface StatusResponse {
  ok?: boolean;
  status: JobStatus;
  message: string;
  progress: { crawled: number; discovered: number; cap: number };
  url: string;
  engine?: EngineResult;
  audit?: CheckItem[];
  error?: string;
}

const SIGNAL_BADGE: Record<SignalValue, { text: string; className: string }> = {
  yes: { text: "允許", className: "border-ok/30 bg-ok/10 text-ok" },
  no: { text: "不允許", className: "border-fail/30 bg-fail/10 text-fail" },
  unset: { text: "未表態", className: "border-gray/30 bg-gray/10 text-gray" },
};

const VISIBILITY: Record<VisibilityStatus, { label: string; className: string }> = {
  ok: { label: "🟢 AI 讀得到你的內容", className: "border-ok/25 bg-ok/[.06]" },
  thin: { label: "🟡 AI 讀到的內容偏少", className: "border-warn/25 bg-warn/[.06]" },
  empty: { label: "🔴 AI 讀到的是一片空白", className: "border-fail/25 bg-fail/[.06]" },
};

const BADGE: Record<BotStatus, { text: string; className: string }> = {
  allowed: { text: "可存取", className: "border-ok/30 bg-ok/10 text-ok" },
  blocked: { text: "被擋", className: "border-fail/30 bg-fail/10 text-fail" },
  unknown: { text: "無法判定", className: "border-gray/30 bg-gray/10 text-gray" },
  mismatch: { text: "政策允許但實測被擋", className: "border-warn/30 bg-warn/10 text-warn" },
};

const CHECK_UI: Record<CheckStatus, { badge: string; text: string }> = {
  ok: { badge: "bg-ok/10 text-ok border-ok/30", text: "正常" },
  warn: { badge: "bg-warn/10 text-warn border-warn/30", text: "可優化" },
  fail: { badge: "bg-fail/10 text-fail border-fail/30", text: "需處理" },
};

// 狀態色（dataviz 技能的固定 status palette，不跟著品牌色跑）——CategoryOverview
// 用內嵌 style 畫長條，跟新 token 的十六進位值保持一致。
const STATUS_COLOR = { ok: "#2f6b45", warn: "#8a6410", fail: "#9e3529" } as const;
const STATUS_LABEL = { ok: "正常", warn: "可優化", fail: "需處理" } as const;

interface CategoryRow {
  name: string;
  ok: number;
  warn: number;
  fail: number;
}

// 把「AI 引擎」層（bot 存取、內容可視性、Content Signals、llms.txt）跟深度健檢
// 的分類收斂成同一組列，每列一個分類的 ok/warn/fail 計數——用來畫總覽長條圖。
function buildCategoryRows(engine?: EngineResult, audit?: CheckItem[]): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();
  const bump = (name: string, status: CheckStatus) => {
    const r = rows.get(name) ?? { name, ok: 0, warn: 0, fail: 0 };
    r[status] += 1;
    rows.set(name, r);
  };

  if (engine) {
    const AI = "AI 引擎可達性";
    for (const b of engine.results) {
      bump(AI, b.status === "allowed" ? "ok" : b.status === "blocked" ? "fail" : "warn");
    }
    if (engine.visibility) {
      bump(AI, engine.visibility.status === "ok" ? "ok" : engine.visibility.status === "thin" ? "warn" : "fail");
    }
    if (engine.contentSignals) {
      bump(AI, engine.contentSignals.declared ? "ok" : "warn");
    }
    if (engine.llmsTxt.exists !== null) {
      bump(AI, engine.llmsTxt.exists ? (engine.llmsTxt.quality?.status === "ok" ? "ok" : "warn") : "warn");
    }
  }

  if (audit) {
    for (const c of audit) bump(c.category, c.status);
  }

  // 問題最多的分類排最上面：一眼看出哪裡弱，不用逐條找
  return [...rows.values()].sort((a, b) => b.fail - a.fail || b.warn - a.warn);
}

interface Category5 {
  name: string;
  passRate: number; // (ok×1 + warn×0.5) / total × 100，四捨五入
  total: number;
}

// 設計稿提案的五分類合併（依 lib/geo-audit-rules.ts 的 CATEGORY／key 為準，不是
// 照設計稿範例數字硬套——那組數字是從截圖判讀的，跟實際程式碼的分類邊界對不齊）：
// AI 可達性＝純 engine 層（bot 存取＋Content Signals＋llms.txt），不動 21 項深度健檢；
// 其餘四組是 21 項深度健檢依 key 重新分組。
const CATEGORY5_KEY_MAP: Record<string, string> = {
  duplicate: "內容與追蹤",
  externalLinks: "內容與追蹤",
  analytics: "內容與追蹤",
  tkd: "內容與追蹤",
  schema: "結構化資料",
  localbiz: "結構化資料",
  sitemap: "技術與索引",
  robots: "技術與索引",
  indexing: "技術與索引",
  headings: "技術與索引",
  llmsSeo: "技術與索引",
  page: "技術與索引",
  viewport: "技術與索引",
  breadcrumb: "技術與索引",
  internalLinks: "技術與索引",
  brokenLinks: "技術與索引",
  homepage: "技術與索引",
  imgAlt: "技術與索引",
  imgFormat: "技術與索引",
  eeat: "品牌與權威",
  categoryDepth: "品牌與權威",
};
const CATEGORY5_ORDER = ["AI 可達性", "內容與追蹤", "結構化資料", "技術與索引", "品牌與權威"];

function buildCategories5(engine?: EngineResult, audit?: CheckItem[]): Category5[] {
  const buckets = new Map<string, { ok: number; warn: number; fail: number }>();
  const bump = (name: string, status: CheckStatus) => {
    const b = buckets.get(name) ?? { ok: 0, warn: 0, fail: 0 };
    b[status] += 1;
    buckets.set(name, b);
  };

  if (engine) {
    for (const b of engine.results) {
      bump("AI 可達性", b.status === "allowed" ? "ok" : b.status === "blocked" ? "fail" : "warn");
    }
    if (engine.contentSignals) bump("AI 可達性", engine.contentSignals.declared ? "ok" : "warn");
    if (engine.llmsTxt.exists !== null) {
      bump("AI 可達性", engine.llmsTxt.exists ? (engine.llmsTxt.quality?.status === "ok" ? "ok" : "warn") : "warn");
    }
  }

  if (audit) {
    for (const c of audit) {
      const group = CATEGORY5_KEY_MAP[c.key];
      if (group) bump(group, c.status);
    }
  }

  return CATEGORY5_ORDER.map((name) => {
    const b = buckets.get(name) ?? { ok: 0, warn: 0, fail: 0 };
    const total = b.ok + b.warn + b.fail;
    const passRate = total > 0 ? Math.round(((b.ok + b.warn * 0.5) / total) * 100) : 0;
    return { name, passRate, total };
  });
}

// 五分類雷達圖：純 SVG，座標公式跟設計稿一致，不用圖表函式庫。跟下面的
// CategoryOverview（狀態色堆疊長條）並存——雷達圖抓「五個面向的整體形狀」，
// 長條圖抓「哪個分類扣最多分」，兩種閱讀方式互補，不是互相取代。
function RadarChart({ categories }: { categories: Category5[] }) {
  const cx = 150;
  const cy = 150;
  const radius = 110;
  const n = categories.length;
  const angleOf = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / n);
  const pointAt = (i: number, value: number) => {
    const a = angleOf(i);
    const r = (radius * value) / 100;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const fmt = (n: number) => n.toFixed(1);

  const dataPoints = categories.map((c, i) => pointAt(i, c.passRate));
  const dataPolygon = dataPoints.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");

  return (
    <svg viewBox="-70 0 440 300" width="440" height="300" className="mx-auto max-w-full">
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          points={categories.map((_, i) => { const p = pointAt(i, level); return `${fmt(p.x)},${fmt(p.y)}`; }).join(" ")}
          fill="none"
          stroke="#eaebe0"
        />
      ))}
      {categories.map((_, i) => {
        const p = pointAt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={fmt(p.x)} y2={fmt(p.y)} stroke="#dcded1" />;
      })}
      <polygon points={dataPolygon} fill="rgba(201,242,74,.55)" stroke="#101a14" strokeWidth={2} />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={fmt(p.x)} cy={fmt(p.y)} r={3.5} fill="#101a14" />
      ))}
      {categories.map((c, i) => {
        const a = angleOf(i);
        const cosA = Math.cos(a);
        const lp = pointAt(i, (132 / radius) * 100);
        const anchor = Math.abs(cosA) < 0.25 ? "middle" : cosA > 0 ? "start" : "end";
        return (
          <g key={i}>
            <text x={fmt(lp.x)} y={fmt(lp.y)} textAnchor={anchor} fontSize={11.5} className="mono" fill="#4e5a51">
              {c.name}
            </text>
            <text x={fmt(lp.x)} y={fmt(lp.y + 15)} textAnchor={anchor} fontSize={11.5} className="mono" fill="#101a14">
              {c.total > 0 ? c.passRate : "—"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// 分類總覽：橫向堆疊長條，狀態色（不是分類色）。跟上面的五分類雷達圖並存——
// 長條是原本 7 分類的細節版，雷達是五分類的整體形狀，兩種互補不是互相取代。
function CategoryOverview({ rows }: { rows: CategoryRow[] }) {
  const visible = rows.filter((r) => r.ok + r.warn + r.fail > 0);
  if (visible.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-line bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="eyebrow">檢測總覽</h2>
        <div className="flex items-center gap-3 text-xs text-ink3">
          {(["ok", "warn", "fail"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {visible.map((row) => {
          const total = row.ok + row.warn + row.fail;
          const segs = (["fail", "warn", "ok"] as const).map((s) => ({ status: s, count: row[s] }));
          return (
            <div key={row.name} className="flex items-center gap-3">
              <p className="w-28 shrink-0 truncate text-xs text-ink2" title={row.name}>
                {row.name}
              </p>
              <div className="flex h-4 flex-1 gap-[2px] overflow-hidden rounded-r bg-card">
                {segs.map(
                  (s) =>
                    s.count > 0 && (
                      <div
                        key={s.status}
                        tabIndex={0}
                        title={`${row.name} · ${STATUS_LABEL[s.status]} ${s.count} 項`}
                        className="h-full outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                        style={{ width: `${(s.count / total) * 100}%`, backgroundColor: STATUS_COLOR[s.status] }}
                      />
                    ),
                )}
              </div>
              <p className="w-10 shrink-0 text-right text-xs tabular-nums text-ink3">{total} 項</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function urlToPath(u: string) {
  return u.replace(/^https?:\/\/[^/]+/, "") || "/";
}

// 「查看更多」：展開列出該項目具體是哪些頁有問題
function DetailsToggle({ title, details }: { title: string; details: { url: string; note: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mono text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
      >
        查看更多（{details.length} 頁）
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
              <p className="text-sm font-semibold text-ink">
                {title}
                <span className="ml-2 text-xs font-normal text-ink3">{details.length} 個問題頁面</span>
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-1 text-lg leading-none text-ink3 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="divide-y divide-line2 overflow-y-auto overflow-x-hidden px-5 py-2">
              {details.map((d, i) => (
                <div key={i} className="flex gap-3 py-2.5 text-xs leading-relaxed">
                  <span className="mono w-6 shrink-0 text-right tabular-nums text-ink3/60">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono block break-all text-ink"
                      title={d.url}
                    >
                      {urlToPath(d.url)}
                    </a>
                    <p className="mt-0.5 break-all text-ink3">{d.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 深度健檢結果表：依分類分組，每組一個小標題 + 表格
function AuditTable({ checks }: { checks: CheckItem[] }) {
  const groups = new Map<string, CheckItem[]>();
  for (const c of checks) {
    const g = groups.get(c.category) ?? [];
    g.push(c);
    groups.set(c.category, g);
  }
  const sc = checks.reduce(
    (acc, c) => ((acc[c.status] += 1), acc),
    { ok: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="eyebrow">深度健檢（{checks.length} 項）</h2>
        <div className="mono flex gap-3 text-xs">
          <span className="text-fail">需處理 {sc.fail}</span>
          <span className="text-warn">可優化 {sc.warn}</span>
          <span className="text-ok">正常 {sc.ok}</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
        <table className="report-table report-table--fixed min-w-[700px]">
          <colgroup>
            <col style={{ width: "9%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>狀態</th>
              <th>項目</th>
              <th>建議</th>
              <th>詳細數據</th>
              <th>問題頁面</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([category, rows]) => (
              <Fragment key={category}>
                <tr className="grp">
                  <td colSpan={5}>{category}</td>
                </tr>
                {rows.map((c) => {
                  const ui = CHECK_UI[c.status];
                  return (
                    <tr key={c.key}>
                      <td>
                        <span className={`mono rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>
                          {ui.text}
                        </span>
                      </td>
                      <td className="item">{c.item}</td>
                      <td className="text-ink2">{c.advice}</td>
                      <td className="mono text-xs text-ink3">{c.evidence || "—"}</td>
                      <td>
                        {c.details && c.details.length > 0 ? (
                          <DetailsToggle title={c.item} details={c.details} />
                        ) : (
                          <span className="text-ink3/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 各家 AI 爬蟲存取權限：全部結果一致時（常見情況——多數網站的 robots.txt
// 對所有 bot 一視同仁）收成一行摘要，不要 8 列一字不差的重複；
// 有落差時（真正有故事可講——部分被擋、政策跟實測不一致）才展開逐項列表。
// 收合只是預設呈現方式，不是藏資訊——一鍵可以展開看明細。
function BotAccessList({ results }: { results: AiBotResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const uniform = results.length > 0 && results.every((r) => r.status === results[0].status);

  // 結果一致時，逐項列表本身沒有參考價值——每一列除了名字以外全部一樣，
  // 展開只是把同一句話複製 8 次。這裡改成展開一份「我們檢查了哪些爬蟲」的
  // 名稱清單（不重複貼狀態徽章），單純給對照用，不假裝有診斷意義。
  if (uniform) {
    const status = results[0].status;
    return (
      <div className="rounded-[10px] border border-line bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink2">
            {results.length} 個 AI 爬蟲的結果一致：
            <span className={`ml-2 rounded-full border px-3 py-1 text-sm font-medium ${BADGE[status].className}`}>
              {BADGE[status].text}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mono shrink-0 text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
          >
            {expanded ? "收合" : "這是哪幾個爬蟲？"}
          </button>
        </div>
        {expanded && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {results.map((r) => (
              <span
                key={r.ua}
                title={`${r.ua} · ${r.matchedRule}`}
                className="mono rounded-full border border-line px-3 py-1 text-xs text-ink2"
              >
                {r.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 不一致才是真正有故事可講的情況（部分被擋、政策跟實測不一致），逐項列表才有意義
  return (
    <div className="divide-y divide-line rounded-[10px] border border-line bg-card">
      {results.map((r) => (
        <div key={r.ua} className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="font-medium text-ink">{r.label}</p>
            <p className="mono text-xs text-ink3">
              {r.ua} · {r.matchedRule}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${BADGE[r.status].className}`}>
            {BADGE[r.status].text}
          </span>
        </div>
      ))}
    </div>
  );
}

// Perplexity／GPT-4o 回傳的答案本身是 markdown（**粗體**、[1] 這種引用角標），
// 直接塞進 <div> 只會看到一堆星號跟中括號。這裡不上完整 markdown 套件
// （答案就是一段話，不需要標題、清單、表格那些),自己解析這兩種語法就夠：
// **粗體** 轉真的粗體，[N] 轉成連去對應引用來源的角標連結。
function renderAnswerMarkdown(text: string, citations: { url: string }[]): React.ReactNode {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return paragraphs.map((para, pi) => (
    <p key={pi} className={pi > 0 ? "mt-2" : undefined}>
      {renderInlineMarkdown(para, citations)}
    </p>
  ));
}

function renderInlineMarkdown(text: string, citations: { url: string }[]): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[(\d+)\]/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      tokens.push(
        <strong key={key++} className="font-semibold text-gray-900">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      const url = citations[Number(m[2]) - 1]?.url;
      tokens.push(
        url ? (
          <a
            key={key++}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-0.5 align-super text-[10px] text-blue-600 hover:underline"
          >
            [{m[2]}]
          </a>
        ) : (
          `[${m[2]}]`
        ),
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

// 品牌能見度：不只講「AI 讀不讀得到你的網站」，而是真的去問 Perplexity
// 「你知道這個品牌嗎」，讓使用者看到實際的回答文字跟引用來源——
// 有沒有引用到自己的網域，是這整份健檢裡最直接的「有沒有效」證據。
function BrandVisibilityCard({ result }: { result: VisibilityCardData }) {
  return (
    <div className="rounded-[10px] border border-line bg-card p-6">
      <p className="mono text-[11px] font-medium tracking-wide text-ink3 uppercase">{result.engine}</p>
      <p className="mt-1 text-lg font-bold text-ink">
        {result.citedSelf ? "🟢 引用了你自己的網站" : "🟡 沒有引用你自己的網站"}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink2">{result.advice}</p>

      <div className="quote-block mt-4 border-l-[3px] border-lime pl-4">
        <p className="text-xs font-medium text-ink3">我們實際問的問題：</p>
        <p className="mt-1 text-sm text-ink">「{result.query}」</p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-ink3">{result.engine} 的實際回答：</p>
        <div className="mt-1 rounded-lg border border-line bg-paper p-3 text-[14.5px] leading-relaxed text-ink2">
          {renderAnswerMarkdown(result.answer, result.citations)}
        </div>
      </div>

      {result.citations.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink3">引用來源：</p>
          <ul className="mt-1 space-y-1">
            {result.citations.map((c, i) => (
              <li key={i} className="text-[13.5px]">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`break-all underline-offset-2 ${c.isSelf ? "font-semibold decoration-limeDark" : ""}`}
                >
                  {c.isSelf && "★ "}
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// llms.txt 卡片：不只給「格式完整」的判決，把實際解析出來的標題、摘要、
// 連結清單都亮出來，讓人自己看得到底稿裡寫了什麼、哪些連結有說明、哪些沒有。
function LlmsTxtCard({ llmsTxt }: { llmsTxt: { exists: boolean | null; quality: LlmsTxtQuality | null } }) {
  const [expanded, setExpanded] = useState(false);
  const quality = llmsTxt.quality;

  return (
    <div className="mt-4 rounded-[10px] border border-line bg-card px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium text-ink">llms.txt</p>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${
            llmsTxt.exists && quality?.status === "ok"
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-warn/30 bg-warn/10 text-warn"
          }`}
        >
          {!llmsTxt.exists ? "沒有" : quality?.status === "ok" ? "格式完整" : "內容單薄"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink3">
        {llmsTxt.exists
          ? quality?.advice
          : "尚未部署。這是給 AI 讀的網站地圖，能主動告訴 AI 你有哪些重要內容。"}
      </p>

      {quality && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mono mt-2 text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
          >
            {expanded ? "收合" : `看實際內容（${quality.links.length} 個連結）`}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 border-t border-line pt-3">
              <div>
                <p className="text-xs font-medium text-ink3"># 標題</p>
                <p className="mt-0.5 text-sm text-ink">{quality.title || "（缺）"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink3">摘要引言</p>
                <p className="mt-0.5 text-sm text-ink">{quality.summary || "（缺）"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink3">頁面連結（{quality.links.length} 個，共 {quality.charCount} 字）</p>
                <div className="mt-1 max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-line2 bg-paper p-2">
                  {quality.links.map((l, i) => (
                    <div key={i} className="text-xs">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium">
                        {l.text}
                      </a>
                      <p className="text-ink3">{l.description || "（沒有附說明）"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function GeoPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [showRawContent, setShowRawContent] = useState(false);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [removedSuggestions, setRemovedSuggestions] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordResults, setKeywordResults] = useState<Record<string, KeywordVisibilityResult[]>>({});
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordError, setKeywordError] = useState("");

  async function handleCheck(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setStatus(null);
    try {
      const res = await fetch("/api/geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "檢測失敗");
      await pollJob(data.jobId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "檢測失敗");
      setLoading(false);
    }
  }

  async function pollJob(jobId: string) {
    const started = Date.now();
    while (true) {
      if (Date.now() - started > 5 * 60 * 1000) throw new Error("健檢逾時，請稍後再試");
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/geo/status?id=${jobId}`);
      const d = (await res.json()) as StatusResponse;
      if (!res.ok) throw new Error(d.error ?? "查詢進度失敗");
      setStatus(d);
      if (d.status === "completed") {
        setLoading(false);
        return;
      }
      if (d.status === "failed") throw new Error(d.error ?? "健檢失敗");
    }
  }

  const engine = status?.engine;
  const unknownCount = engine?.results.filter((r) => r.status === "unknown").length ?? 0;

  const suggestedKeywords = engine?.visibility
    ? guessKeywordCandidates(engine.visibility.title, engine.visibility.description, engine.visibility.h1).filter(
        (k) => !removedSuggestions.includes(k)
      )
    : [];
  const activeKeywords = [...suggestedKeywords, ...customKeywords];

  function removeKeyword(k: string) {
    if (suggestedKeywords.includes(k)) setRemovedSuggestions((prev) => [...prev, k]);
    else setCustomKeywords((prev) => prev.filter((x) => x !== k));
  }

  function addCustomKeyword() {
    const v = keywordInput.trim();
    if (v && !activeKeywords.includes(v)) setCustomKeywords((prev) => [...prev, v]);
    setKeywordInput("");
  }

  async function runKeywordCheck() {
    if (activeKeywords.length === 0 || !url.trim()) return;
    setKeywordLoading(true);
    setKeywordError("");
    try {
      const res = await fetch("/api/geo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: activeKeywords, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "查詢失敗");
      const map: Record<string, KeywordVisibilityResult[]> = {};
      for (const r of data.results as { keyword: string; results: KeywordVisibilityResult[] }[]) {
        map[r.keyword] = r.results;
      }
      setKeywordResults(map);
    } catch (err) {
      setKeywordError(err instanceof Error ? err.message : "查詢失敗");
    } finally {
      setKeywordLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="eyebrow text-center">AI SEARCH VISIBILITY</p>
        <h1 className="mt-2 text-center text-3xl font-bold text-ink">AI 搜尋能見度健檢</h1>
        <p className="mt-3 text-center text-ink2">
          檢測你的網站對 ChatGPT、Claude、Perplexity 等 AI 搜尋引擎是否開放，並跑一次多頁深度健檢
        </p>

        <form onSubmit={handleCheck} className="mt-8 flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="輸入網址，例如 example.com"
            className="input-mono flex-1"
          />
          <button type="submit" disabled={loading} className="btn-lime">
            {loading ? "檢測中…" : "開始檢測"}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-fail">{error}</p>}

        {engine && (
          <div className="mt-10">
            {/* 判定不出來時必須明講。給假綠燈比不給答案傷害更大 */}
            <div
              className={`rounded-[10px] border p-6 text-center ${
                unknownCount > 0
                  ? "border-line bg-card"
                  : engine.results.every((r) => r.status !== "blocked")
                    ? "border-ok/25 bg-ok/[.06]"
                    : engine.results.filter((r) => r.status === "blocked").length >= 4
                      ? "border-fail/25 bg-fail/[.06]"
                      : "border-warn/25 bg-warn/[.06]"
              }`}
            >
              <p className="text-2xl font-bold text-ink">
                {unknownCount > 0
                  ? "⚪ 無法判定"
                  : engine.results.every((r) => r.status !== "blocked")
                    ? "🟢 AI 引擎都能存取你的網站"
                    : engine.results.filter((r) => r.status === "blocked").length >= 4
                      ? "🔴 主要 AI 引擎被擋住了"
                      : `🟡 有 ${engine.results.filter((r) => r.status === "blocked").length} 個 AI 引擎被擋住`}
              </p>

              {unknownCount > 0 && (
                <div className="mt-3 space-y-2 text-sm text-ink2">
                  <p>{engine.robotsNote}</p>
                  <p>
                    這<strong>不代表</strong>你的網站對 AI 開放——很可能有 robots.txt
                    但我們讀不到。請直接在瀏覽器打開{" "}
                    <a href={engine.robotsUrl} target="_blank" rel="noopener noreferrer">
                      {engine.robotsUrl}
                    </a>{" "}
                    人工確認。
                  </p>
                  {engine.wafHint && (
                    <div className="mt-3 rounded-lg border border-line bg-paper p-3 text-left">
                      <p className="text-xs font-semibold text-ink3">偵測到可能的原因：{engine.wafHint.vendor}</p>
                      <p className="mt-1 text-sm text-ink2">{engine.wafHint.advice}</p>
                    </div>
                  )}
                </div>
              )}

              {engine.robotsStatus === "none" && (
                <p className="mt-2 text-sm text-ink3">（這個網站沒有 robots.txt，依規範預設所有爬蟲都能存取）</p>
              )}
              {engine.robotsStatus === "found" && (
                <p className="mono mt-2 text-xs text-ink3">規則來源：{engine.robotsUrl}</p>
              )}
            </div>

            {status?.audit && (
              <div className="mt-6 rounded-[10px] border border-line bg-card p-5">
                <h2 className="eyebrow mb-4">五分類總覽</h2>
                <RadarChart categories={buildCategories5(engine, status.audit)} />
              </div>
            )}

            <div className="mt-6">
              <CategoryOverview rows={buildCategoryRows(engine, status?.audit)} />
            </div>

            {engine.brandVisibility.length > 0 && (
              <div className="mt-6">
                <h2 className="eyebrow mb-3">AI 認不認得你？（實際去問）</h2>
                <div className="space-y-4">
                  {engine.brandVisibility.map((r) => (
                    <BrandVisibilityCard key={r.engine} result={r} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h2 className="eyebrow mb-1">關鍵字 AI 能見度（你想搶的主題，AI 推薦名單裡有你嗎？）</h2>
              <p className="mb-3 max-w-[34em] text-xs text-ink3">
                上面看的是「AI 知不知道你」；這裡看的是「有人拿某個主題去問 AI，AI 會不會推薦到你」——這才是大部分人真正在意的問題。以下是從標題／描述自動抓的候選字，可以刪掉不要的，或自己加。
              </p>
              <div className="rounded-[10px] border border-line bg-card p-6">
                <div className="flex flex-wrap gap-2">
                  {activeKeywords.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset px-3 py-1 text-sm text-ink2"
                    >
                      {k}
                      <button
                        type="button"
                        onClick={() => removeKeyword(k)}
                        className="text-ink3 hover:text-fail"
                        aria-label={`移除 ${k}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {activeKeywords.length === 0 && (
                    <span className="text-sm text-ink3">（沒有抓到候選關鍵字，自己加一個試試）</span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomKeyword();
                      }
                    }}
                    placeholder="輸入自己的關鍵字…"
                    className="input-mono flex-1"
                  />
                  <button type="button" onClick={addCustomKeyword} className="btn-line">
                    新增
                  </button>
                  <button
                    type="button"
                    onClick={runKeywordCheck}
                    disabled={keywordLoading || activeKeywords.length === 0}
                    className="btn-lime whitespace-nowrap"
                  >
                    {keywordLoading ? "查詢中…" : `查詢（${activeKeywords.length} 個關鍵字 × 2 引擎）`}
                  </button>
                </div>
                {keywordError && <p className="mt-2 text-sm text-fail">{keywordError}</p>}
              </div>

              {Object.keys(keywordResults).length > 0 && (
                <div className="mt-4 space-y-6">
                  {activeKeywords
                    .filter((k) => keywordResults[k])
                    .map((k) => (
                      <div key={k}>
                        <p className="mb-2 text-sm font-semibold text-ink2">「{k}」</p>
                        <div className="space-y-3">
                          {keywordResults[k].length === 0 ? (
                            <p className="text-sm text-ink3">
                              這個關鍵字沒有查到結果（可能沒設 API key 或呼叫失敗）
                            </p>
                          ) : (
                            keywordResults[k].map((r) => <BrandVisibilityCard key={r.engine} result={r} />)
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {engine.visibility && (
              <div className="mt-6">
                <h2 className="eyebrow mb-3">AI 眼中的你</h2>
                <div className={`rounded-[10px] border p-6 ${VISIBILITY[engine.visibility.status].className}`}>
                  <p className="text-lg font-bold text-ink">{VISIBILITY[engine.visibility.status].label}</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-ink">{engine.visibility.summary}</p>
                  <p className="mono mt-1 text-xs text-ink3">
                    共 {engine.visibility.textLength} 字：正文約 {engine.visibility.substantiveChars} 字、選單／標籤約{" "}
                    {engine.visibility.furnitureChars} 字
                    {engine.visibility.textLength > 0
                      ? `（占 ${Math.round((engine.visibility.furnitureChars / engine.visibility.textLength) * 100)}%）`
                      : ""}
                  </p>

                  <div className="mt-4 rounded-lg border border-line bg-paper p-4">
                    <p className="text-xs font-medium text-ink3">AI 從這幾項判斷你網站是做什麼的：</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {engine.visibility.title || "（沒有寫標題）"}
                    </p>
                    {engine.visibility.description ? (
                      <p className="mt-1 text-sm leading-relaxed text-ink2">{engine.visibility.description}</p>
                    ) : (
                      <p className="mt-1 text-sm text-warn">
                        （沒有寫 meta description，AI 只能自己從標題和正文猜，建議補上一段簡短描述）
                      </p>
                    )}
                    {engine.visibility.h1.length > 0 && (
                      <p className="mt-2 text-xs text-ink3">H1：{engine.visibility.h1.join("、")}</p>
                    )}
                    {engine.visibility.leadParagraphs.length > 0 && (
                      <div className="mt-3 border-t border-line2 pt-3">
                        <p className="text-xs text-ink3">頁面內容摘錄：</p>
                        <div className="mt-1 space-y-2">
                          {engine.visibility.leadParagraphs.map((p, i) => (
                            <p key={i} className="text-sm leading-relaxed text-ink2">
                              {p}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {engine.visibility.duplicateBlockChars > 0 && (
                    <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
                      ⚠️ 已排除約 {engine.visibility.duplicateBlockChars} 字的重複內容區塊（可能是跑馬燈效果），建議加上{" "}
                      <code>aria-hidden=&quot;true&quot;</code>。
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowRawContent((v) => !v)}
                    className="mono mt-3 text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
                  >
                    {showRawContent ? "收起" : "查看"} AI 實際讀到的原始文字片段（技術細節，一般不用看）
                  </button>
                  {showRawContent &&
                    (() => {
                      const blocks = engine.visibility.previewBlocks;
                      return (
                        <div className="mt-2 space-y-3 rounded-lg border border-line bg-paper p-4">
                          {blocks.length === 0 && <p className="text-sm text-ink3">（完全沒有可讀的文字）</p>}
                          {blocks.map((block, i) =>
                            block.kind === "tags" ? (
                              <p key={i} className="border-l-2 border-line2 pl-2 text-xs leading-relaxed text-ink3">
                                {block.items.join("、")}
                              </p>
                            ) : (
                              <p key={i} className="text-sm leading-relaxed text-ink2">
                                {block.text}
                              </p>
                            )
                          )}
                        </div>
                      );
                    })()}

                  <dl className="figs mt-4 grid-cols-2 sm:grid-cols-4">
                    <div>
                      <b>{engine.visibility.textLength}</b>
                      <span>可讀字數</span>
                    </div>
                    <div>
                      <b className="text-[15px]">
                        {engine.visibility.jsonLdTypes.length > 0 ? engine.visibility.jsonLdTypes.join("、") : "（無）"}
                      </b>
                      <span>結構化資料</span>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {engine.visibilityNote && <p className="mt-4 text-center text-sm text-ink3">{engine.visibilityNote}</p>}

            <h2 className="eyebrow mt-8 mb-3">各家 AI 爬蟲的存取權限</h2>
            <BotAccessList results={engine.results} />

            {engine.contentSignals && (
              <div className="mt-8">
                <h2 className="eyebrow mb-3">內容使用授權（Content Signals）</h2>
                <div className="rounded-[10px] border border-line bg-card p-5">
                  {engine.contentSignals.declared ? (
                    <>
                      <p className="text-sm text-ink2">這個網站有表態，宣告內容可以被拿去做什麼用途：</p>
                      <div className="mt-4 space-y-3">
                        {engine.contentSignals.items.map((s) => (
                          <div key={s.key} className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-ink">{s.label}</p>
                              <p className="text-xs text-ink3">{s.meaning}</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${SIGNAL_BADGE[s.value].className}`}
                            >
                              {SIGNAL_BADGE[s.value].text}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mono mt-4 text-xs break-all text-ink3">
                        Content-Signal: {engine.contentSignals.raw}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-ink2">
                      這個網站還沒有宣告 Content Signals。這是 Cloudflare 在 2025 年提出、寫在 robots.txt
                      裡的新欄位，可以分別表明你的內容<strong>能不能被搜尋索引、能不能當 AI 回答的來源、能不能拿去訓練模型</strong>
                      ——這三件事是分開的。想擋訓練但保留 AI 引用，就得靠它，光用 Allow / Disallow 表達不了。
                    </p>
                  )}
                </div>
              </div>
            )}

            {engine.llmsTxt.exists !== null && <LlmsTxtCard llmsTxt={engine.llmsTxt} />}

            {/* 深度健檢：多頁爬蟲＋規則＋AI 語意判斷，跑得比上面慢，進度誠實顯示 */}
            <div className="mt-10">
              {status && (status.status === "crawling" || status.status === "analyzing") && (
                <div className="flex items-center gap-3 rounded-[10px] border border-line bg-card px-5 py-4">
                  <span className="h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" />
                  <p className="text-sm text-ink2">{status.message}</p>
                </div>
              )}
              {status?.status === "completed" && status.audit && <AuditTable checks={status.audit} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
