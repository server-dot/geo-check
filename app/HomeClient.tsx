"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import Footer from "@/components/marketing/Footer";

// 首頁 hero 下面的三格數字帶，掛載時跑一次 1100ms 的 ease-out-cubic count-up
// （跟設計稿 dc-runtime 的 componentDidMount 那段動畫邏輯一致）。
// prefers-reduced-motion 時直接跳到定值，不跑動畫。
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUpProgress(durationMs = 1100): number {
  // reduced-motion 直接用 lazy initial state 跳到定值，不要在 effect 裡同步呼叫
  // setState（react-hooks/set-state-in-effect 會擋）——effect 只負責真的要跑動畫的情況。
  const [t, setT] = useState(() => (prefersReducedMotion() ? 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);
  return t;
}

const HOME_CHECKS = [
  { name: "AI 爬蟲的存取權限", why: "GPTBot / ClaudeBot / PerplexityBot 等 8 家實際請求" },
  { name: "AI 讀到的內容", why: "關掉 JavaScript 後量可讀字數、title、h1" },
  { name: "內容使用授權（Content Signals）", why: "search / ai-input / ai-train 三項的表態" },
  { name: "llms.txt", why: "有沒有、格式完不完整、連結解不解得開" },
  { name: "AI 認不認得你（實際去問）", why: "送出提問給 Perplexity 與 ChatGPT，原話與引用來源照貼" },
  { name: "多頁 SEO + GEO 深度健檢", why: "結構化資料、索引、網站健康、外部權威等 21 項" },
];

const HOME_STEPS = [
  { no: "01", title: "輸入網址", body: "不需要註冊，也不用裝任何東西。只讀取公開可存取的內容。" },
  {
    no: "02",
    title: "六層檢測 + 深度健檢",
    body: "以 8 家爬蟲的身分請求頁面、關掉 JavaScript 量可讀內容、實際去問 AI 引擎，再跑 21 項深度健檢。",
  },
  { no: "03", title: "看報告、排順序", body: "拿到總分與逐項判定。需處理的項目附上量到的值與建議做法，可以直接轉給工程師。" },
];

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

// 「結構化資料」專區：每個偵測到的 JSON-LD 型別各自一張卡片（對應後端 SchemaTypeCard）
interface SchemaFieldRow {
  label: string;
  value: string;
  present: boolean;
  suggestedValue?: string;
}

interface SchemaTypeCard {
  type: string;
  pageCount: number;
  fields: SchemaFieldRow[];
  incompletePages: { url: string; note: string }[];
  sampleNode: Record<string, unknown>;
  sampleUrl: string;
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
  schemaCards?: SchemaTypeCard[];
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

// advice 是「現況＋建議」寫在同一句的自由文字（21 種檢測各自組字串，格式不統一），
// 不是結構化的兩個欄位。只在句號斷句能切出一句完整的「建議」句子時才拆
// （例如「...沒有其他管道揭露聯絡地址。如果有實體門市，建議部署...」）；
// 曾經多加一條「逗號＋建議」的退路，實測會切出「補齊並控制長度」這種脫離
// 上下文的殘句（原句是「...Description 過長 23，建議補齊並控制長度」，
// 「補齊」什麼、「控制」什麼的長度，切開後完全看不出來）——這種半吊子的
// 建議框比不切還糟，所以拿掉，寧可整段照舊當一般文字顯示。
function splitAdviceSuggestion(advice: string): { diagnosis: string; suggestion: string | null } {
  const sentences = advice.split("。").filter((s) => s.trim());
  if (sentences.length >= 2 && sentences[sentences.length - 1].includes("建議")) {
    const suggestion = sentences[sentences.length - 1].trim().replace(/^建議[：:]?\s*/, "");
    const diagnosis = sentences.slice(0, -1).join("。") + "。";
    return { diagnosis, suggestion };
  }
  return { diagnosis: advice, suggestion: null };
}

// 現況文字＋ mono 證據數據（不含建議提示框——桌機表格版要把提示框拉出去
// 獨立一整列，卡片版才會把它接在下面一起顯示，所以現況跟建議框拆成兩個
// 元件，各自的排版各自組合，不要耦合在一起）。
function AdviceDiagnosis({ c, diagnosis }: { c: CheckItem; diagnosis: string }) {
  return (
    <>
      {diagnosis}
      {c.evidence && <p className="evidence mono mt-1 text-xs text-ink3">{c.evidence}</p>}
    </>
  );
}

function SuggestionBox({ status, suggestion }: { status: CheckStatus; suggestion: string }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm leading-relaxed ${CHECK_UI[status].badge}`}>
      <p className="mb-0.5 font-semibold">改善建議</p>
      <p>{suggestion}</p>
    </div>
  );
}

// 窄螢幕卡片版：現況跟建議框直接疊在同一塊裡（沒有 colspan 這種表格限定的概念，
// 疊在一起本來就是卡片自然的排法）。桌機表格版另外處理，見 AuditTable。
function AdviceCell({ c }: { c: CheckItem }) {
  const split = c.status !== "ok" ? splitAdviceSuggestion(c.advice) : null;
  return (
    <>
      <AdviceDiagnosis c={c} diagnosis={split?.suggestion ? split.diagnosis : c.advice} />
      {split?.suggestion && (
        <div className="mt-2">
          <SuggestionBox status={c.status} suggestion={split.suggestion} />
        </div>
      )}
    </>
  );
}

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
  ok: number;
  warn: number;
  fail: number;
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
    return { name, passRate, total, ok: b.ok, warn: b.warn, fail: b.fail };
  });
}

// 總分＝5 分類各自 passRate 的平均（每個分類權重相同，跟雷達圖五個角一一對應，
// 不會因為某個分類底下檢測項目數量多就搶走權重）。等第門檻是隨性抓的區間，
// 沒有業界標準可循——先求「有個總覽數字」堪用，之後要調全靠這幾個數字改。
function computeOverallScore(categories: Category5[]): { score: number; grade: string; gradeLabel: string } {
  const score = categories.length > 0 ? Math.round(categories.reduce((s, c) => s + c.passRate, 0) / categories.length) : 0;
  const grade =
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  const gradeLabel =
    score >= 85 ? "優異" : score >= 70 ? "良好" : score >= 55 ? "普通" : score >= 40 ? "待加強" : "不合格";
  return { score, grade, gradeLabel };
}

// 健檢進行中的掃描動畫：純裝飾，不代表真實進度（真實進度是旁邊的 progress-track）。
// 純 CSS/SVG，沒有引外部函式庫或圖檔。
function RadarSweep() {
  const dots = [
    { x: 88, y: 34 },
    { x: 40, y: 70 },
    { x: 100, y: 96 },
  ];
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0">
      <circle cx="66" cy="66" r="60" fill="none" stroke="var(--line)" />
      <circle cx="66" cy="66" r="40" fill="none" stroke="var(--line)" />
      <circle cx="66" cy="66" r="20" fill="none" stroke="var(--line)" />
      <line x1="66" y1="6" x2="66" y2="126" stroke="var(--line)" />
      <line x1="6" y1="66" x2="126" y2="66" stroke="var(--line)" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="2.5" fill="var(--limeDark)" />
      ))}
      <g className="radar-sweep-arm" style={{ transformOrigin: "66px 66px" }}>
        <path d="M 66 66 L 66 6 A 60 60 0 0 1 118 36 Z" fill="url(#radar-sweep-fade)" />
      </g>
      <circle cx="66" cy="66" r="3" fill="var(--ink)" />
      <defs>
        <linearGradient id="radar-sweep-fade" x1="66" y1="66" x2="118" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--lime)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--lime)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// 總分環形進度：純 SVG stroke-dasharray，不用圖表函式庫，跟雷達圖同一套做法。
function ScoreRing({ score }: { score: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
      <circle cx="66" cy="66" r={r} fill="none" stroke="#eaebe0" strokeWidth="10" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke="#a8d128"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
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
            <div className="relative min-h-0 flex-1">
              <div className="h-full divide-y divide-line2 overflow-y-auto overflow-x-hidden px-5 py-2">
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
              {/* Mac 預設隱藏捲軸，內容一多使用者根本看不出來還能往下捲，
                  誤以為文字被裁掉——底部加一條漸層淡出當視覺提示。 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 深度健檢結果表：依分類分組，每組一個小標題 + 表格
// 單一深度健檢項目的「卡片列」呈現（狀態徽章＋項目名稱＋建議說明＋問題頁面連結）。
// AuditTable 的窄螢幕卡片版跟「結構化資料」專區共用同一份呈現邏輯，保持視覺語言一致，
// 不要兩份幾乎一樣的 JSX 各自維護。
function CheckRow({ c }: { c: CheckItem }) {
  const ui = CHECK_UI[c.status];
  return (
    <div className="flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-2">
        <span className={`mono rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>{ui.text}</span>
        <p className="text-sm font-medium text-ink">{c.item}</p>
      </div>
      <div className="text-sm text-ink2">
        <AdviceCell c={c} />
      </div>
      {c.details && c.details.length > 0 && (
        <div className="flex justify-end">
          <DetailsToggle title={c.item} details={c.details} />
        </div>
      )}
    </div>
  );
}

function findCheck(audit: CheckItem[], key: string): CheckItem | undefined {
  return audit.find((c) => c.key === key);
}

// 型別的原始英文名稱對非技術背景的人是天書，這裡只給我們實際有逐欄位規則的
// 型別（見 lib/geo-schema-check.ts 的 fieldChecksFor）配一個白話名稱；卡片一律
// 只在這幾種型別出現，所以不用處理 fallback 到原始英文名稱的情況。
const SCHEMA_TYPE_LABEL: Record<string, string> = {
  Organization: "組織/品牌",
  LocalBusiness: "在地商家",
  Store: "在地商家",
  Restaurant: "在地商家",
  Dentist: "在地商家",
  MedicalClinic: "在地商家",
  HealthAndBeautyBusiness: "在地商家",
  ProfessionalService: "在地商家",
  HomeAndConstructionBusiness: "在地商家",
  JewelryStore: "在地商家",
  Product: "商品",
  Article: "文章",
  NewsArticle: "文章",
  BlogPosting: "文章",
};

// 跟 lib/geo-schema-check.ts 的 LOCAL_TYPES 同一份清單——用來判斷「有沒有已經產生
// LocalBusiness 卡片」，避免下面 localBizCheck 的補充說明跟卡片本身講重複的事。
const LOCAL_BIZ_TYPES = new Set([
  "LocalBusiness",
  "Store",
  "Restaurant",
  "Dentist",
  "MedicalClinic",
  "HealthAndBeautyBusiness",
  "ProfessionalService",
  "HomeAndConstructionBusiness",
  "JewelryStore",
]);

// 我們的欄位表格用中文 label 給人看，組 JSON-LD 片段要對回 schema.org 的英文屬性名稱。
// 4 個型別家族的欄位 label 彼此不重複，直接用一份攤平的對照表就夠，不用分型別存。
const FIELD_TO_JSONLD_KEY: Record<string, string> = {
  名稱: "name",
  網址: "url",
  "Logo 圖片網址": "logo",
  電話: "telephone",
  Email: "email",
  簡介: "description",
  "社群/外部連結": "sameAs",
  地址: "address",
  營業時間: "openingHours",
  圖片網址: "image",
  "售價/庫存 (offers)": "offers",
  圖片: "image",
  作者: "author",
  發布日期: "datePublished",
};

// 這幾個欄位在真實網站上常常不只一個值（多張圖、多個社群連結），跟 stacktools
// 生成工具一樣用「每行一個」的 textarea，1 行存成純字串、多行存成陣列。
const MULTILINE_FIELDS = new Set(["Logo 圖片網址", "圖片網址", "圖片", "社群/外部連結"]);

// 「生成/補完」分頁的型別選單——4 個組跟 lib/geo-schema-check.ts 的 fieldChecksFor()
// 一一對應，defaultType 是選這個組時、生成的 JSON-LD 要用哪個實際 schema.org 型別
// （選到「檢索」有找到的卡片時會改用那張卡片真正的型別字串，例如 Restaurant 而不是
// 泛用的 LocalBusiness；只有完全沒偵測到、要從零生成時才會用這個預設值）。
const GENERATE_TYPE_GROUPS: { key: string; label: string; defaultType: string; fields: string[] }[] = [
  {
    key: "Organization",
    label: "組織/品牌",
    defaultType: "Organization",
    fields: ["名稱", "網址", "Logo 圖片網址", "電話", "Email", "簡介", "社群/外部連結"],
  },
  {
    key: "LocalBusiness",
    label: "在地商家",
    defaultType: "LocalBusiness",
    fields: ["地址", "電話", "營業時間", "圖片網址"],
  },
  { key: "Product", label: "商品", defaultType: "Product", fields: ["售價/庫存 (offers)", "圖片"] },
  { key: "Article", label: "文章", defaultType: "Article", fields: ["作者", "發布日期"] },
];

// 「生成/補完」分頁要處理兩種情況：使用者選的型別檢索到了（有真的欄位值可以帶入），
// 或完全沒偵測到（例如網站根本沒有 LocalBusiness，使用者想從零生成一份）——後者
// 沒有 SchemaTypeCard 可用，所以這裡只吃這三樣，不要求完整的 SchemaTypeCard。
interface GeneratePayload {
  type: string;
  fields: SchemaFieldRow[];
  sampleUrl: string;
}

// 把表單目前的值組成一段可以直接貼回網站的 JSON-LD——跟「結構化資料」卡片本身用的
// 顯示邏輯是兩回事：這裡只保留有值的欄位，空的欄位整個不出現在輸出裡（而不是留一個
// 空字串），這樣複製出去才是乾淨、可以直接用的標記。
function buildJsonLdSnippet(payload: GeneratePayload, values: Record<string, string>): string {
  const obj: Record<string, unknown> = { "@type": payload.type };
  try {
    const origin = new URL(payload.sampleUrl).origin;
    obj["@id"] = `${origin}/#${payload.type.toLowerCase()}`;
  } catch {
    // sampleUrl 解析失敗就不加 @id，不影響其他欄位
  }
  for (const f of payload.fields) {
    const key = FIELD_TO_JSONLD_KEY[f.label];
    if (!key) continue;
    const raw = (values[f.label] ?? "").trim();
    if (!raw) continue;
    if (MULTILINE_FIELDS.has(f.label)) {
      const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length > 0) obj[key] = lines.length > 1 ? lines : lines[0];
    } else {
      obj[key] = raw;
    }
  }
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

// 「生成/補完」表單：欄位預設帶入已經偵測到的值，缺的欄位帶入 AI 建議值（沒有就空白），
// 使用者可以直接改，右邊即時組出可以複製貼回網站的 JSON-LD 片段——跟
// tool.dg166.com/schema-check 的「生成/補完」分頁同一套邏輯：兩個分頁切換，不是嵌在
// 卡片裡面。key 帶 payload.type，型別切換時整個表單重新建立（不是同一份表單元件
// 換資料），每個型別的草稿互不影響、也不用手動同步 state。
function GenerateCompleteForm({ payload }: { payload: GeneratePayload }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(payload.fields.map((f) => [f.label, f.present ? f.value : f.suggestedValue ?? ""])),
  );
  const snippet = buildJsonLdSnippet(payload, values);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {payload.fields.map((f) => {
          const multiline = MULTILINE_FIELDS.has(f.label);
          return (
            <div key={f.label}>
              <label className="mono text-xs text-ink3">
                {f.label}
                {multiline && "（每行一個）"}
              </label>
              {multiline ? (
                <textarea
                  rows={2}
                  value={values[f.label] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.value }))}
                  className="mt-1 w-full resize-y rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-ink"
                />
              ) : (
                <input
                  type="text"
                  value={values[f.label] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.label]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-ink"
                />
              )}
            </div>
          );
        })}
      </div>
      <div>
        <div className="mb-2 flex justify-end">
          <CopyButton text={snippet} />
        </div>
        <pre className="mono max-h-80 overflow-auto rounded-lg border border-line bg-card p-3 text-xs leading-relaxed text-ink2">
          {snippet}
        </pre>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard 權限被擋就算了，文字本來就顯示在畫面上，使用者還是能自己選取複製
        }
      }}
      className="mono shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] text-ink2 hover:text-ink"
    >
      {copied ? "已複製" : "複製"}
    </button>
  );
}

function SchemaTypeCardView({ card }: { card: SchemaTypeCard }) {
  const [expanded, setExpanded] = useState(false);
  const ui = card.incompletePages.length === 0 ? CHECK_UI.ok : CHECK_UI.warn;
  const missingLabels = card.fields.filter((f) => !f.present).map((f) => f.label);

  return (
    <div className="rounded-[10px] border border-ink/15 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`mono rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>{ui.text}</span>
        <p className="text-sm font-semibold text-ink">{SCHEMA_TYPE_LABEL[card.type] ?? card.type}</p>
        <span className="text-xs text-ink3">出現在 {card.pageCount} 頁</span>
        {missingLabels.length > 0 && (
          <span className="text-xs text-warn">缺：{missingLabels.join("、")}</span>
        )}
      </div>

      <dl className="mt-3">
        {card.fields.map((f) => (
          <div key={f.label} className="border-b border-line2 py-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-ink3">{f.label}</dt>
              <dd className={`truncate text-right ${f.present ? "text-ink2" : "font-medium text-warn"}`}>
                {f.present ? f.value : "未設定"}
              </dd>
            </div>
            {!f.present && f.suggestedValue && (
              <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-ink2">
                <span className="truncate">💡 頁面裡找到：{f.suggestedValue}</span>
                <CopyButton text={f.suggestedValue} />
              </div>
            )}
          </div>
        ))}
      </dl>

      {card.incompletePages.length > 0 && (
        <div className="mt-2 flex justify-end">
          <DetailsToggle title={card.type} details={card.incompletePages} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mono mt-3 text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
      >
        {expanded ? "收起" : "查看"}原始 JSON-LD
      </button>
      {expanded && (
        <pre className="mono mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-paper p-3 text-xs leading-relaxed text-ink2">
          {JSON.stringify(card.sampleNode, null, 2)}
        </pre>
      )}
    </div>
  );
}

// 「生成/補完」分頁：型別下拉選單＋表單。選到「檢索」有找到的型別就帶入真的資料
// （已有值／AI 建議值都在），選到沒偵測到的型別就是空白表單，讓使用者可以從零生成——
// 跟 tool.dg166.com/schema-check 的「生成/補完」分頁同一個能力：即使網站完全沒有
// LocalBusiness，也可以直接在這裡生成一份。
function GenerateCompleteTab({ schemaCards, origin }: { schemaCards: SchemaTypeCard[]; origin: string }) {
  const firstDetected = GENERATE_TYPE_GROUPS.find((g) =>
    schemaCards.some((c) => g.key === "LocalBusiness" ? LOCAL_BIZ_TYPES.has(c.type) : c.type === g.key),
  );
  const [groupKey, setGroupKey] = useState(firstDetected?.key ?? GENERATE_TYPE_GROUPS[0].key);

  const group = GENERATE_TYPE_GROUPS.find((g) => g.key === groupKey)!;
  const matchedCard = schemaCards.find((c) => (group.key === "LocalBusiness" ? LOCAL_BIZ_TYPES.has(c.type) : c.type === group.key));

  const payload: GeneratePayload = matchedCard
    ? { type: matchedCard.type, fields: matchedCard.fields, sampleUrl: matchedCard.sampleUrl }
    : {
        type: group.defaultType,
        fields: group.fields.map((label) => ({ label, value: "", present: false })),
        sampleUrl: origin,
      };

  return (
    <div>
      <label className="mono block text-xs text-ink3">型別</label>
      <select
        value={groupKey}
        onChange={(e) => setGroupKey(e.target.value)}
        className="mt-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
      >
        {GENERATE_TYPE_GROUPS.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
            {!schemaCards.some((c) => (g.key === "LocalBusiness" ? LOCAL_BIZ_TYPES.has(c.type) : c.type === g.key)) && "（尚未偵測到，從零生成）"}
          </option>
        ))}
      </select>
      <div className="mt-4">
        <GenerateCompleteForm key={groupKey} payload={payload} />
      </div>
    </div>
  );
}

// 「結構化資料」專區：跟「AI 眼中的你」平起平坐。跟 stacktools 的
// tool.dg166.com/schema-check 同一套呈現邏輯（小積木指名參考的內部工具）：上面兩個
// 分頁切換——「檢索」看目前偵測到什麼、缺什麼；「生成/補完」選型別、填表單、即時
// 產生可以複製貼回網站的 JSON-LD。之前把生成/補完做成每張卡片下面各自展開一個表單，
// 小積木反饋「你為何都要自己亂改 我原本是兩個標籤切換」——參考工具原本就是兩個
// 頂層分頁在切換，不是嵌在卡片裡，這裡照參考工具的方式改回分頁。
//
// 「檢索」分頁只列業務上有意義的型別各自一張卡片（組織/品牌、在地商家、商品、文章），
// 每張卡片自己的「缺：X、Y」就是結論，不需要另外發明一句總結文字或一排型別 chip——
// 純技術容器型別（WebPage、ImageObject、BreadcrumbList…）已經在 buildSchemaTypeCards()
// 那層直接濾掉，這裡收到的 schemaCards 就只剩真正有欄位規則的型別。
// 只在 status.audit／schemaCards 都有值時才會被呼叫端渲染（外層整包包在
// status.status === "completed" 底下，跑到這裡一定有值），所以不用處理「深度稽核中」
// 的過渡狀態。刻意不包在 engine.visibility && 裡——engine.visibility 可能因快速層
// 抓首頁逾時而是 null，但深層爬蟲仍可能抓到，兩者互相獨立。
function SchemaSection({
  audit,
  schemaCards,
  origin,
}: {
  audit: CheckItem[];
  schemaCards: SchemaTypeCard[];
  origin: string;
}) {
  const [tab, setTab] = useState<"search" | "generate">("search");
  const schemaCheck = findCheck(audit, "schema");
  const localBizCheck = findCheck(audit, "localbiz");
  const hasLocalBizCard = schemaCards.some((c) => LOCAL_BIZ_TYPES.has(c.type));
  const needsLocalBizNote = !!localBizCheck && localBizCheck.status !== "ok" && !hasLocalBizCard;

  return (
    <div className="mt-6">
      <h2 className="eyebrow mb-3">結構化資料</h2>
      <div className="rounded-[10px] border border-line bg-card p-6">
        <div className="mb-4 flex gap-4 border-b border-line2">
          {(
            [
              ["search", "🔍 檢索"],
              ["generate", "✨ 生成/補完"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`mono -mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
                tab === key ? "border-limeDark text-ink" : "border-transparent text-ink3 hover:text-ink2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "search" && (
          <>
            {schemaCards.length === 0 && schemaCheck && (
              <div className="rounded-[10px] border border-ink/15 bg-card">
                <CheckRow c={schemaCheck} />
              </div>
            )}

            {schemaCards.length > 0 && (
              <div className="space-y-3">
                {schemaCards.map((card) => (
                  <SchemaTypeCardView key={card.type} card={card} />
                ))}
              </div>
            )}

            {needsLocalBizNote && (
              <div className={`rounded-[10px] border border-ink/15 bg-card ${schemaCards.length > 0 ? "mt-3" : ""}`}>
                <CheckRow c={localBizCheck!} />
              </div>
            )}
          </>
        )}

        {tab === "generate" && <GenerateCompleteTab schemaCards={schemaCards} origin={origin} />}
      </div>
    </div>
  );
}

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
      {/* 640px 以上維持表格；再窄下去三欄硬擠只會逼中文逐字斷行，改成每列一張卡片，
          資訊順序不變（狀態＋項目在上，說明／證據在中，問題頁面連結靠右），不需要橫向捲動。
          每個分類各自一張獨立的卡片＋表格（照設計稿的版型），不是一張大表裡面塞分類分隔列——
          跟下面窄螢幕卡片版的分類分法（每類自己一個 rounded 卡片）對齊，不要兩套邏輯。

          欄寬照設計稁原始檔案（AuditTable-2b-版型.html）用固定 px，不是百分比：
          72／128／104 三欄固定，中間「建議」欄吃剩下全部空間、可以縮到很窄也不會
          觸發水平捲動。之前用百分比 + min-w-[700px] 逼出 overflow-x-auto，容器窄於
          700px 時表格會出現水平捲軸——但 Mac 預設隱藏捲軸，使用者看不出來還能捲，
          就像被裁掉一樣。固定寬三欄 + 中間欄無下限，表格永遠塞得進容器，不會有
          「其實可以捲動、但看不出來」這個陷阱。 */}
      <div className="hidden space-y-5 sm:block">
        {[...groups.entries()].map(([category, rows]) => (
          <div key={category}>
            <p className="mono mb-2 text-lg font-semibold tracking-wide text-lime-dark uppercase">{category}</p>
            {/* --line 這個邊框色是設計系統裡刻意收斂的淡色，套在其他卡片上沒問題，
                但這裡小積木明確反饋看起來像沒有框——深度健檢表格改用對比更明顯的
                border-ink/15，跟設計稿那種清楚有框的視覺對齊，不動全站其他卡片。 */}
            <div className="rounded-[10px] border border-ink/15 bg-card">
              <table className="report-table report-table--fixed w-full">
                <colgroup>
                  <col style={{ width: "88px" }} />
                  <col style={{ width: "128px" }} />
                  <col />
                  <col style={{ width: "136px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>狀態</th>
                    <th>項目</th>
                    <th>建議</th>
                    <th>問題頁面</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const ui = CHECK_UI[c.status];
                    const split = c.status !== "ok" ? splitAdviceSuggestion(c.advice) : null;
                    return (
                      <Fragment key={c.key}>
                        <tr className={split?.suggestion ? "has-suggestion" : undefined}>
                          <td>
                            <span className={`mono rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>
                              {ui.text}
                            </span>
                          </td>
                          <td className="item">{c.item}</td>
                          <td className="text-ink2">
                            <AdviceDiagnosis c={c} diagnosis={split?.suggestion ? split.diagnosis : c.advice} />
                          </td>
                          <td>
                            {c.details && c.details.length > 0 ? (
                              <DetailsToggle title={c.item} details={c.details} />
                            ) : (
                              <span className="text-ink3/50">—</span>
                            )}
                          </td>
                        </tr>
                        {/* 改善建議獨立一整列橫跨到底，不縮在建議欄裡——欄寬只有 58%，
                            長一點的建議文字擠在裡面比擠在整列窄很多，橫跨可以用滿版面寬度。 */}
                        {split?.suggestion && (
                          <tr className="suggestion-row">
                            <td colSpan={4}>
                              <SuggestionBox status={c.status} suggestion={split.suggestion} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-5 sm:hidden">
        {[...groups.entries()].map(([category, rows]) => (
          <div key={category}>
            <p className="mono mb-2 text-lg font-semibold tracking-wide text-lime-dark uppercase">{category}</p>
            <div className="divide-y divide-line2 rounded-[10px] border border-ink/15 bg-card">
              {rows.map((c) => (
                <CheckRow key={c.key} c={c} />
              ))}
            </div>
          </div>
        ))}
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

export default function HomeClient({
  botCount,
  checkCount,
  checkedCount,
}: {
  botCount: number;
  checkCount: number;
  checkedCount: number;
}) {
  const countUpT = useCountUpProgress();
  const stats = [
    { num: Math.round(checkedCount * countUpT), unit: "個網站", label: "已經跑過這份健檢", note: "多數是台灣的中小企業與品牌官網" },
    { num: Math.round(botCount * countUpT), unit: "家 AI 爬蟲", label: "以它們的身分實際請求你的頁面", note: "GPTBot、ClaudeBot、PerplexityBot 等，不是只讀 robots.txt" },
    { num: Math.round(checkCount * countUpT), unit: "項深度健檢", label: "多頁取樣，逐項給出量到的值", note: "結構化資料、索引與技術、網站健康、外部權威" },
  ];
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  // 記住「目前使用者在等的 job」——pollJob 收到回應時如果不是這個 id 就丟棄，
  // 避免連按兩次或用 Enter 繞過按鈕 disabled 時，舊的/別的 job 蓋掉新的結果畫面。
  const activeJobId = useRef<string | null>(null);
  const [showRawContent, setShowRawContent] = useState(false);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [addedSuggestions, setAddedSuggestions] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordResults, setKeywordResults] = useState<Record<string, KeywordVisibilityResult[]>>({});
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordError, setKeywordError] = useState("");

  // 按下「開始檢測」之後，「01 THE CHECK」以下那幾個行銷內容區塊（介紹健檢會看什麼、
  // 怎麼運作、報告長什麼樣）就不需要了——使用者已經在等結果，這些說明文字只會讓進度卡
  // 跟結果被推到更下面。一旦開始檢測（loading）或已經有 job（status），就收起來，
  // 完成後也不再顯示，直到重新整理頁面。
  const checkStarted = loading || !!status;

  async function handleCheck(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim() || loading) return;
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
      const jobId = data.jobId as string;
      activeJobId.current = jobId;
      await pollJob(jobId);
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
      if (activeJobId.current !== jobId) return; // 使用者已經另外開了新的一次檢測，這個結果不算數
      const res = await fetch(`/api/geo/status?id=${jobId}`);
      const d = (await res.json()) as StatusResponse;
      if (!res.ok) throw new Error(d.error ?? "查詢進度失敗");
      if (activeJobId.current !== jobId) return;
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

  // 自動抓的候選字只是建議，不會預設進查詢清單——使用者要自己點加入，
  // 不是預設全加、要自己動手刪掉不要的（之前是反過來，容易誤查一堆沒篩過的字）。
  const suggestedKeywords = engine?.visibility
    ? guessKeywordCandidates(engine.visibility.title, engine.visibility.description, engine.visibility.h1).filter(
        (k) => !addedSuggestions.includes(k)
      )
    : [];
  const activeKeywords = [...addedSuggestions, ...customKeywords];

  function addSuggestedKeyword(k: string) {
    setAddedSuggestions((prev) => [...prev, k]);
  }

  function removeKeyword(k: string) {
    if (addedSuggestions.includes(k)) setAddedSuggestions((prev) => prev.filter((x) => x !== k));
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
      <div className="marketing">
        <Masthead />

        {/* Hero：深色、全幅背景，AI 生成的循環動畫（Kling AI，5s loop）。
            影片本身線條偏稀疏，裁緊＋疊一層固定漸層墊底，避免空幀時看起來太空。
            額度刷新後可以用更強調「滿版無大片留白」的 prompt 重新生成換掉。 */}
        <div className="relative overflow-hidden bg-ink text-paper">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(900px circle at 68% 28%, rgba(163,230,53,.16), transparent 60%), radial-gradient(700px circle at 20% 85%, rgba(163,230,53,.10), transparent 65%)",
            }}
          />
          <video
            className="absolute inset-0 h-full w-full scale-125 object-cover object-[65%_35%] opacity-[.55]"
            poster="/hero-bg-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/hero-bg.webm" type="video/webm" />
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, rgba(16,26,20,.92) 0%, rgba(16,26,20,.72) 46%, rgba(16,26,20,.28) 100%)",
            }}
          />
          <div className="relative pointer-events-none pb-24 pt-[104px]">
            <div className="mx-auto max-w-[1120px] px-10">
              <div className="eyebrow text-[#a9b5ac]">AI SEARCH VISIBILITY</div>
              <h1 className="mt-5 max-w-[16em] text-[60px] leading-[1.1] tracking-[-0.045em]">
                客戶問 AI，AI 沒提到你。<mark className="bg-transparent text-lime">先看看它讀到了什麼。</mark>
              </h1>
              <p className="mt-[22px] max-w-[32em] text-[17.5px] text-[#c3ccc5]">
                我們用各家 AI 爬蟲的身分實際去讀你的網站，再實際去問 AI 認不認得你的品牌，最後跑一次多頁深度健檢。
              </p>
              <form onSubmit={handleCheck} className="pointer-events-auto mt-9 flex max-w-[560px] gap-2.5">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="輸入網址，例如 example.com"
                  aria-label="網址"
                  className="mono flex-1 rounded-lg border-0 bg-white/[.06] px-3.5 py-2.5 text-sm text-paper shadow-[inset_0_0_0_1px_rgba(255,255,255,.22)] placeholder:text-[#8b968d] focus:shadow-[inset_0_0_0_2px_var(--lime)] focus:outline-none"
                />
                <button type="submit" disabled={loading} className="btn-lime shrink-0 px-[22px] py-[11px] text-[14.5px]">
                  {loading ? "檢測中…" : "開始檢測"}
                </button>
              </form>
              <p className="mono mt-3.5 text-[11.5px] text-[#8b968d]">
                約 40 秒 · 不需要註冊 · 只讀取公開可存取的內容 · 已檢測 {checkedCount} 個網站
              </p>
            </div>
          </div>
        </div>

        {/* 三格數字帶：count-up 動畫見 useCountUpProgress()。 */}
        <div className="border-b border-line bg-ink text-paper">
          <div className="mx-auto max-w-[1120px] px-10">
            <div className="grid grid-cols-3 gap-px border-t border-white/[.14] bg-white/[.14]">
              {stats.map((s) => (
                <div key={s.label} className="bg-ink px-8 pb-11 pt-10">
                  <p className="whitespace-nowrap text-[46px] font-bold leading-none tracking-[-0.045em] text-lime">
                    {s.num}
                    <span className="ml-2 text-base font-semibold tracking-normal">{s.unit}</span>
                  </p>
                  <p className="mt-4 text-[14.5px] font-semibold">{s.label}</p>
                  <p className="mt-2 max-w-[26em] text-[13.5px] leading-relaxed text-[#a9b5ac]">{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!checkStarted && (
          <>
            <Section k="01" eyebrow="THE CHECK" title="健檢會看什麼">
              <p className="prose mt-4">
                六個檢測層，最後一項是多頁深度健檢。判定字彙與總分算法寫在{" "}
                <a href="/scoring">判斷標準</a>。
              </p>
              <ul className="mt-[30px]">
                {HOME_CHECKS.map((c) => (
                  <li key={c.name} className="list-row list-row--2col">
                    <div className="nm">{c.name}</div>
                    <div className="why">{c.why}</div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section k="02" eyebrow="HOW IT WORKS" title="三個步驟，約 40 秒">
              <dl className="figs grid-cols-3 text-left">
                {HOME_STEPS.map((s) => (
                  <div key={s.no} className="px-5 pb-6 pt-[22px]">
                    <div className="k">{s.no}</div>
                    <p className="mt-2.5 text-[19px] font-bold tracking-[-0.03em]">{s.title}</p>
                    <p className="mt-2.5 text-[13.5px] leading-[1.55] text-ink2">{s.body}</p>
                  </div>
                ))}
              </dl>
            </Section>

            <Section k="03" eyebrow="THE REPORT" title="你會拿到一份總分 0–100 的報告" noBorder>
              <p className="prose mt-4">
                每一項標成 <span className="t-ok">正常</span>、<span className="t-warn">可優化</span> 或{" "}
                <span className="t-fail">需處理</span>，附上實際量到的數值與該怎麼改。我們讀不到的東西會標成 ⚪
                無法判定。
              </p>
              {/* 兩張報告截圖橫向並排（總覽／深度健檢表格），各自維持原生比例，不裁切、
                  不硬套單一寬高框。原本放三張，中間那張（品牌能見度）拿掉了——小積木反饋
                  「字好小」，圖一多每張分到的寬度就變窄，圖裡的文字跟著縮小看不清楚；
                  兩張比三張各自能分到更多寬度，文字自然變大、更好讀。 */}
              <div className="mt-[30px] grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { src: "/report-screenshot-1.png", alt: "健檢報告截圖：五分類總覽，總分 78 分（B 級・良好）與檢測總覽長條圖" },
                  { src: "/report-screenshot-3.png", alt: "健檢報告截圖：21 項深度健檢表格，逐項列出狀態、建議與問題頁面" },
                ].map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element -- 固定素材、非使用者上傳圖片，不需要 next/image 的最佳化/尺寸協商
                  <img
                    key={img.src}
                    src={img.src}
                    alt={img.alt}
                    className="w-full rounded-[10px] border border-line"
                  />
                ))}
              </div>
            </Section>
          </>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-16">
        {error && <p className="mt-4 text-center text-fail">{error}</p>}

        {/* 小積木反饋：檢測過程中途只想看到單一進度動畫，不要一部分結果先跑出來、
            一部分還在轉圈——「全部判斷完再列出結果」。所以下面整塊結果只在
            status.status === "completed" 才出現；跑到完成前，不管是還沒建立 job
            的前置檢查階段，還是爬取／分析階段，都共用這一張進度卡。 */}
        {loading && status?.status !== "completed" && (
          <div className="mt-10 flex items-center gap-6 rounded-[10px] border border-line bg-card p-6">
            <RadarSweep />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-4">
                <p className="eyebrow">{status ? "深度健檢進行中" : "健檢啟動中"}</p>
                {status && status.progress.crawled > 0 && (
                  <span className="mono text-xs text-ink3">
                    {status.progress.crawled}/{status.progress.cap} 頁
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-ink2">{status ? status.message : "正在檢查 AI 爬蟲存取權限、品牌能見度…"}</p>
              <div className="progress-track mt-4">
                {status?.status === "crawling" && status.progress.cap > 0 ? (
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, Math.round((status.progress.crawled / status.progress.cap) * 100))}%`,
                    }}
                  />
                ) : (
                  <div className="progress-fill progress-fill--indeterminate" />
                )}
              </div>
              <p className="mt-3 text-xs text-ink3">多頁健檢通常需要 30–120 秒，關掉分頁不會保留結果，請稍候。</p>
            </div>
          </div>
        )}

        {status?.status === "completed" && engine && (
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

            {status?.audit &&
              (() => {
                const categories5 = buildCategories5(engine, status.audit);
                const overall = computeOverallScore(categories5);
                const totals = categories5.reduce(
                  (acc, c) => ({ ok: acc.ok + c.ok, warn: acc.warn + c.warn, fail: acc.fail + c.fail }),
                  { ok: 0, warn: 0, fail: 0 }
                );
                return (
                  <div className="mt-6 rounded-[10px] border border-line bg-card p-5">
                    <h2 className="eyebrow mb-4">五分類總覽</h2>
                    <div className="grid gap-6 sm:grid-cols-[132px_1fr] sm:items-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative h-[132px] w-[132px]">
                          <ScoreRing score={overall.score} />
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <b className="text-3xl font-bold text-ink">{overall.score}</b>
                            <span className="mono text-[10px] tracking-widest text-ink3">總分</span>
                          </div>
                        </div>
                        <span className="mono rounded-full border border-line bg-inset px-3 py-1 text-xs font-medium text-ink2">
                          {overall.grade} 級・{overall.gradeLabel}
                        </span>
                        <dl className="mono flex gap-4 text-center text-xs">
                          <div>
                            <b className="block text-base text-ok">{totals.ok}</b>
                            <span className="text-ink3">正常</span>
                          </div>
                          <div>
                            <b className="block text-base text-warn">{totals.warn}</b>
                            <span className="text-ink3">可優化</span>
                          </div>
                          <div>
                            <b className="block text-base text-fail">{totals.fail}</b>
                            <span className="text-ink3">需處理</span>
                          </div>
                        </dl>
                      </div>
                      <RadarChart categories={categories5} />
                    </div>
                  </div>
                );
              })()}

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
              <h2 className="text-[19px] font-bold text-ink">關鍵字 AI 能見度</h2>
              <p className="mt-1 text-sm font-medium text-ink2">你想搶的主題，AI 推薦名單裡有你嗎？</p>
              <p className="mb-3 mt-1.5 max-w-[34em] text-xs text-ink3">
                上面看的是「AI 知不知道你」；這裡看的是「有人拿某個主題去問 AI，AI 會不會推薦到你」——這才是大部分人真正在意的問題。以下是從標題／描述自動抓的候選字，只是建議，不會自動加入查詢，要自己點才會加進去。
              </p>
              <div className="rounded-[10px] border border-line bg-card p-6">
                {suggestedKeywords.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs text-ink3">建議關鍵字（點一下加入查詢）</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedKeywords.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => addSuggestedKeyword(k)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-sm text-ink3 hover:border-lime-dark hover:text-ink"
                        >
                          + {k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mb-1.5 text-xs text-ink3">要查詢的關鍵字</p>
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
                    <span className="text-sm text-ink3">
                      {suggestedKeywords.length > 0 ? "（還沒加入任何關鍵字，點上面的建議或自己輸入）" : "（沒有抓到候選關鍵字，自己加一個試試）"}
                    </span>
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

                  {/* 只剩一個統計數字（可讀字數）——結構化資料移到獨立的「結構化資料」
                      專區，不再擠在這裡。單欄用 grid-cols-1，理由同舊註解：不要為了呼應
                      「figs」這個共用 class 名稱硬撐出根本不存在的欄位。 */}
                  <dl className="figs mt-4 grid-cols-1">
                    <div>
                      <b>{engine.visibility.textLength}</b>
                      <span>可讀字數</span>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {engine.visibilityNote && <p className="mt-4 text-center text-sm text-ink3">{engine.visibilityNote}</p>}

            {status?.audit && status.schemaCards && (
              <SchemaSection audit={status.audit} schemaCards={status.schemaCards} origin={engine.origin} />
            )}

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

            {/* 深度健檢：多頁爬蟲＋規則＋AI 語意判斷。這個區塊外層已經整包包在
                status.status === "completed" 底下，跑到這裡 status.audit 一定有值——
                進行中的畫面統一由最外層那張進度卡負責，這裡不用再重複一份。 */}
            <div className="mt-10">
              {status?.audit && (
                <AuditTable checks={status.audit.filter((c) => c.key !== "schema" && c.key !== "localbiz")} />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="marketing">
        <Footer />
      </div>
    </div>
  );
}
