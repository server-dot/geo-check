"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { StepAuditIcon, StepInputIcon, StepReportIcon } from "@/components/marketing/StepIcons";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import Footer from "@/components/marketing/Footer";
import { tallyCitedDomains, type CitedDomain } from "@/lib/geo-cited-domains";

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
  { no: "01", title: "輸入網址", body: "貼上網址就好，不用註冊。", Icon: StepInputIcon },
  {
    no: "02",
    title: "六層檢測 + 深度健檢",
    body: "以 8 家爬蟲的身分實際請求、關掉 JavaScript 量內容、再去問 AI 引擎。",
    Icon: StepAuditIcon,
  },
  { no: "03", title: "看報告、排順序", body: "總分與逐項判定，需處理的附上量到的值，可直接轉給工程師。", Icon: StepReportIcon },
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
  impact: string;
  technical: string;
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
  technical?: string;
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
  impact?: string;
  technical?: string;
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
  // 逐頁可讀字數（爬取順序），健檢報告圖的累積曲線用
  pageWords?: number[];
  error?: string;
}

// 狀態色（dataviz 技能的固定 status palette，不跟著品牌色跑）。內嵌 style 用得到
// 十六進位值的地方（狀態磚、報告圖）都從這裡拿，跟 token 保持一致。
const STATUS_COLOR = { ok: "#1f7a4d", warn: "#96590a", fail: "#b8342c" } as const;
const STATUS_LABEL = { ok: "正常", warn: "可優化", fail: "需處理" } as const;

// 「不允許」刻意不用紅色：那是網站主動的表態（例如故意擋 AI 訓練），不是缺陷，
// 塗紅色會讓人以為自己做錯了什麼。真正需要處理的是「未表態」那一態——留白讓各家
// AI 自行認定。glyph 一律跟著色走，不靠顏色單獨表意。
const SIGNAL_BADGE: Record<SignalValue, { text: string; className: string; glyph: string; color: string }> = {
  yes: { text: "允許", className: "border-ok/30 bg-ok/10 text-ok", glyph: "✓", color: STATUS_COLOR.ok },
  no: { text: "不允許", className: "border-ink/25 bg-ink/5 text-ink2", glyph: "✕", color: "#4a5468" },
  unset: { text: "未表態", className: "border-warn/30 bg-warn/10 text-warn", glyph: "?", color: STATUS_COLOR.warn },
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

// 現況文字。原本這裡還有一個 splitAdviceSuggestion()，用「句號切開、看最後一句
// 有沒有『建議』兩字」去猜哪裡是建議——它的註解自己記錄過切出「補齊並控制長度」
// 這種脫離上下文的殘句。後端改成明確給 advice／impact／technical 三個欄位之後，
// 前端不用再猜，整個解析器連同 AdviceDiagnosis 一起刪掉。

// 報告文案刻意保留少數幾個專有名詞——不是沒清乾淨，是這幾個有對應的知識文章，
// 留著才有錨點可以把讀者帶進 /geo 知識庫。沒有文章可連的術語（TKD、canonical、
// noindex、SSR/SSG、aria-hidden…）一律收進技術細節區，不留在白話文案裡。
// 按長度由長到短排序，避免「Content-Signal」被短的子字串先搶走比對。
const SUGGESTION_GLOSSARY: { term: string; href: string }[] = [
  { term: "Content-Signal", href: "/geo/content-signals-declare" },
  { term: "結構化資料", href: "/geo/schema-priority" },
  { term: "llms.txt", href: "/geo/llms-txt-format" },
  { term: "robots.txt", href: "/geo/robots-txt-blocking-ai" },
  { term: "JavaScript", href: "/geo/js-rendering-empty-shell" },
  { term: "WAF", href: "/geo/waf-blocks-despite-allow" },
].sort((a, b) => b.term.length - a.term.length);

// 只存 pattern 字串，不存 RegExp 實例——帶 g 旗標的 RegExp 會把 lastIndex 記在
// 物件上，跨呼叫共用等於共用可變狀態：伺服器端連續渲染好幾個 ImpactBox 時，
// 前一次留下的 lastIndex 會讓後一次從中間才開始比對，算出跟瀏覽器端不一樣的
// 結果，畫面直接 hydration mismatch。每次呼叫自己 new 一個才安全。
const SUGGESTION_GLOSSARY_SOURCE = SUGGESTION_GLOSSARY.map((g) =>
  g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|");

// seen 是同一個檢測項目共用的一組已連過的術語：現況、影響、技術細節三段文字
// 依序穿過同一個 Set，同一個詞在同一列只會變成一次連結。不去重的話「robots.txt」
// 一列出現三次就變成三個一模一樣的連結，看起來像在洗內部連結。
//
// 連結樣式用具名 class 不用 Tailwind 的 decoration-* utility：globals.css 的
// a { text-decoration-color: ... } 沒包 @layer，一律贏過 utilities——原本寫的
// decoration-current/40 其實從來沒生效過。
function linkifyGlossary(text: string, seen?: Set<string>): React.ReactNode {
  const pattern = new RegExp(SUGGESTION_GLOSSARY_SOURCE, "g");
  const tokens: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    const term = m[0];
    // 已經連過的詞跳過不更新 last，那段文字會併進下一次的 slice 當純文字帶出去
    if (seen?.has(term)) continue;
    seen?.add(term);
    if (m.index > last) tokens.push(text.slice(last, m.index));
    const entry = SUGGESTION_GLOSSARY.find((g) => g.term === term);
    tokens.push(
      <Link key={key++} href={entry!.href} className="glossary-link">
        {term}
      </Link>,
    );
    last = pattern.lastIndex;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

// 「這代表什麼」——講後果，不教修法。工具的定位是讓對方認知到問題存在，
// 真的要修的話下面有諮詢入口，那才是我們的服務範圍。
// 吃已經算好的 ReactNode，不在這裡呼叫 linkifyGlossary——去重用的 Set 一旦當成
// prop 傳進子元件、又在子元件 render 時被寫入，就是 render 期間的副作用：React 在
// 開發模式會重複呼叫 render，第二次進來 Set 裡已經有值，於是不產生連結，跟伺服器
// 端算出來的結果對不起來，畫面直接 hydration mismatch。三段文字改成在 CheckBody
// 自己的 render body 裡一次算完，每次重算都從空的 Set 開始，才是純的。
function ImpactBox({
  status,
  impact,
  consultFor,
  origin,
}: {
  status: CheckStatus;
  impact: React.ReactNode;
  consultFor?: string;
  origin?: string;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm leading-relaxed ${CHECK_UI[status].badge}`}>
      <p className="mb-0.5 font-semibold">這代表什麼</p>
      <p>{impact}</p>
      {status === "fail" && consultFor && (
        <div className="mt-2 flex justify-end border-t border-current/15 pt-2">
          <ConsultLink item={consultFor} origin={origin} />
        </div>
      )}
    </div>
  );
}

// 只掛在「需處理」的項目上。刻意做成一行小字連結而不是按鈕——一份報告可能有
// 六七項需處理，每項一顆色塊按鈕整頁會變成業配。視覺重量跟旁邊的「技術細節」
// 對齊，讀者掃描時可以直接略過。
function ConsultLink({ item, origin }: { item: string; origin?: string }) {
  const params = new URLSearchParams({ topic: "report", item });
  if (origin) params.set("url", origin);
  return (
    <Link href={`/contact?${params.toString()}`} className="glossary-link mono text-xs">
      找我們處理這一項 →
    </Link>
  );
}

// 技術細節：術語、判定依據、門檻值、原始證據字串都收在這裡，預設收合。
// 不用 DetailsToggle（那是彈窗，給「問題頁面」那種需要捲動的長清單用的），
// 沿用檔案裡已經有兩處在用的行內展開版型。
function TechDetails({ technical, evidence }: { technical: React.ReactNode; evidence?: string }) {
  const [open, setOpen] = useState(false);
  if (!technical && !evidence) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
      >
        {open ? "收合技術細節" : "技術細節"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-line bg-paper p-3 text-xs leading-relaxed text-ink2">
          {technical && <p>{technical}</p>}
          {evidence && <p className={`evidence mono text-ink3 ${technical ? "mt-1.5" : ""}`}>{evidence}</p>}
        </div>
      )}
    </div>
  );
}

// 一個檢測項目的完整內容：現況 → 影響框（含諮詢入口）→ 技術細節。
// 桌機表格版跟窄螢幕卡片版共用同一份，不要維護兩套排版邏輯。
// seen 在這裡建立，讓三段文字共用一組去重過的術語連結。
function CheckBody({ c, origin, withAdvice = true }: { c: CheckItem; origin?: string; withAdvice?: boolean }) {
  // 三段依序穿過同一個 Set，同個術語在這一項裡只會連一次；Set 在這個 render body
  // 裡建立也在這裡用完，不外流給子元件，重算幾次結果都一樣。
  const seen = new Set<string>();
  const adviceNode = withAdvice ? linkifyGlossary(c.advice, seen) : null;
  const impactNode = c.impact ? linkifyGlossary(c.impact, seen) : null;
  const technicalNode = c.technical ? linkifyGlossary(c.technical, seen) : null;
  return (
    <>
      {adviceNode}
      {impactNode && (
        <div className={withAdvice ? "mt-2" : undefined}>
          <ImpactBox status={c.status} impact={impactNode} consultFor={c.item} origin={origin} />
        </div>
      )}
      <TechDetails technical={technicalNode} evidence={c.evidence} />
    </>
  );
}


// 爬蟲狀態磚：8 家並排時要能一眼掃完，所以做成色塊＋符號，不是 8 列文字。
// 一定要帶符號——warn 跟 fail 兩個色在正常視覺下 ΔE 只有 10.3，橘紅並排分不出來
// （見下方狀態格陣的說明）。unknown 用中性灰：那不是「壞」，是「我們讀不到」，
// 塗成紅色會變成假警報，跟 robots.txt 三態同一個紀律。
const BOT_TILE: Record<BotStatus, { glyph: string; color: string }> = {
  allowed: { glyph: "✓", color: STATUS_COLOR.ok },
  blocked: { glyph: "✕", color: STATUS_COLOR.fail },
  mismatch: { glyph: "!", color: STATUS_COLOR.warn },
  unknown: { glyph: "?", color: "#5f6a80" },
};

// AI 讀到的內容是由什麼組成的：正文 vs 選單／標籤那些「網站家具」。
// 原本是一行 mono 文字（「共 X 字：正文約 Y 字、選單／標籤約 Z 字（占 N%）」），
// 三個數字擠在一句話裡要自己換算比例；改成一條兩段的比例條，比例本身就是圖。
//
// 兩個色跑過 dataviz 驗證（2026-09-09 換品牌色後重驗）：品牌金 #e09c0a 對中性藍灰
// #b0b7c4，正常視覺 ΔE 17.7、綠色覺 17.4，都高於 15 的門檻。兩者對白底的對比都
// 低於 3:1，規範要求這種情況必須有「可見標籤」當補償——所以兩段都直接標上名稱與
// 字數，不是只靠顏色配圖例。
const MIX_COLOR = { body: "#e09c0a", furniture: "#b0b7c4" };

function ContentMixBar({
  total,
  substantive,
  furniture,
}: {
  total: number;
  substantive: number;
  furniture: number;
}) {
  if (total <= 0) return null;
  const pct = (n: number) => Math.round((n / total) * 100);
  const segs = [
    { key: "body", label: "正文", value: substantive, color: MIX_COLOR.body },
    { key: "furniture", label: "選單／標籤", value: furniture, color: MIX_COLOR.furniture },
  ].filter((x) => x.value > 0);

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-ink3">AI 讀到的內容是由什麼組成的</p>
        <p className="mono text-xs text-ink2">
          共 <b className="font-semibold text-ink">{total.toLocaleString()}</b> 字
        </p>
      </div>
      {/* 段與段之間留 2px 底色縫，兩端 4px 圓角 */}
      <div className="flex h-4 w-full gap-[2px] overflow-hidden">
        {segs.map((sg, i) => (
          <div
            key={sg.key}
            title={`${sg.label} ${sg.value.toLocaleString()} 字（${pct(sg.value)}%）`}
            className={`h-full ${i === 0 ? "rounded-l" : ""} ${i === segs.length - 1 ? "rounded-r" : ""}`}
            style={{ width: `${(sg.value / total) * 100}%`, backgroundColor: sg.color }}
          />
        ))}
      </div>
      {/* 直接標籤：文字一律用 ink 色階，識別靠旁邊的色點，不讓文字染上資料色 */}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {segs.map((sg) => (
          <span key={sg.key} className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: sg.color }} />
            {sg.label} <span className="mono text-ink3">{sg.value.toLocaleString()} 字 · {pct(sg.value)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// 一格狀態方塊，格陣、爬蟲磚、內容授權卡共用同一個視覺語言
function StatusChip({ glyph, color, size = 18 }: { glyph: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded font-bold text-paper"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.62 }}
    >
      {glyph}
    </span>
  );
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
  aboutPage: "品牌與權威",
  contactPage: "品牌與權威",
  // categoryDepth 量的是「網址最深幾層 + 幾頁有麵包屑」，那是網站結構，不是品牌
  // 權威。它原本掛在品牌與權威底下，讓一個只有 2 項的分類憑一個技術指標拿到 75 分
  // ——一個連 GSC 都沒裝的網站不可能有 75 分的品牌權威。移到技術與索引。
  categoryDepth: "技術與索引",
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

// ── 報告總表（一張圖看完）──────────────────────────────
// 報告下半部是一大片文字，小積木的反饋是「太難懂，希望有圖文搭配」。這裡把
// 全部檢測項目壓成一張狀態格陣：一格一項，看形狀就知道哪個分類在出血，
// 不用逐條讀完二十幾段文字。
//
// 一定要「符號＋顏色」雙重編碼，不能只靠顏色：跑過 dataviz 的 validate_palette.js，
// 換成積木品牌色之後這件事變得**更嚴重**——--warn(#96590a) 跟 --fail(#b8342c) 在
// 正常視覺下 ΔE 只有 10.3（舊的墨綠系是 12.2），紅綠色覺下更只有 1.6（舊的是 5.1），
// 等於完全同一個顏色。兩者都遠低於 15 的可辨識門檻，而且把 warn 往橘推也救不回來
// （試過 #b4600a，deutan 只到 5.7）。金＋紅這個色系本來就難分，所以報告圖上每一處
// 狀態都是「燈號＋顏色＋文字」三重標示，任何地方都不准只靠顏色表意。

interface GridGroup {
  name: string;
  items: { label: string; status: CheckStatus }[];
}

// 跟 buildCategories5 用同一組分類與同一套狀態換算，差別只在這裡保留逐項的
// 名稱，不是只算加總——格陣要能 hover 看出「這一格是哪一項」。
function buildStatusGrid(engine?: EngineResult, audit?: CheckItem[]): GridGroup[] {
  const groups = new Map<string, GridGroup["items"]>();
  const push = (name: string, label: string, status: CheckStatus) => {
    const list = groups.get(name) ?? [];
    list.push({ label, status });
    groups.set(name, list);
  };

  if (engine) {
    for (const b of engine.results) {
      push("AI 可達性", b.label, b.status === "allowed" ? "ok" : b.status === "blocked" ? "fail" : "warn");
    }
    if (engine.contentSignals) {
      push("AI 可達性", "內容使用授權", engine.contentSignals.declared ? "ok" : "warn");
    }
    if (engine.llmsTxt.exists !== null) {
      push("AI 可達性", "llms.txt", engine.llmsTxt.exists ? (engine.llmsTxt.quality?.status === "ok" ? "ok" : "warn") : "warn");
    }
  }
  if (audit) {
    for (const c of audit) {
      const group = CATEGORY5_KEY_MAP[c.key];
      if (group) push(group, c.item, c.status);
    }
  }

  return CATEGORY5_ORDER.map((name) => ({ name, items: groups.get(name) ?? [] })).filter((g) => g.items.length > 0);
}

// ── 健檢報告圖（戰情表）────────────────────────────────
// 取代原本的「健檢總表」SVG：一張 1200px 寬的圖把整份報告壓成一頁，讓人先用
// 「看」的知道哪裡在出血，再決定往下讀哪一段。版型照設計稿 健檢報告圖.dc.html。
//
// 色票值跟 globals.css 的品牌 token 一致（積木金 #fcb418＋深藍灰 #303c54＋米白），
// 但獨立成一組 --rb-：這是一張要單獨列印／分享出去的圖，版面內的每個顏色都要能
// 就地讀到，不靠外面的層疊。前綴是必要的——--card / --ink / --lime / --ok /
// --warn / --fail 這些名字 globals.css 全都已經佔用了，不加前綴會外洩到整頁。
//
// 固定 1200px 寬 + 外層橫向捲動：五張 KPI 卡加三欄圖表擠進 375px 會全毀，
// 這種密度的圖寧可讓人橫向捲，不要硬壓成手機版。
const RB_VARS = {
  "--rb-bg": "#f6f5ef",
  "--rb-card": "#ffffff",
  "--rb-card2": "#f2f4f8",
  "--rb-hair": "rgba(48,60,84,0.16)",
  "--rb-hair2": "rgba(48,60,84,0.09)",
  "--rb-ink": "#303c54",
  "--rb-ink2": "#4a5468",
  "--rb-ink3": "#5f6a80",
  "--rb-lime": "#fcb418",
  "--rb-gold": "#8a5a05",
  "--rb-ok": "#1f7a4d",
  "--rb-warn": "#96590a",
  "--rb-fail": "#b8342c",
  "--rb-gray": "#5f6a80",
} as React.CSSProperties;

const RB_STATUS_VAR: Record<CheckStatus, string> = {
  ok: "var(--rb-ok)",
  warn: "var(--rb-warn)",
  fail: "var(--rb-fail)",
};
const RB_STATUS_DOT: Record<CheckStatus, string> = { ok: "🟢", warn: "🟡", fail: "🔴" };

// 累積曲線的座標系（照設計稿的 viewBox 與格線位置）
const RB_X0 = 70;
const RB_X1 = 1010;
const RB_Y_TOP = 45.5;
const RB_Y_BASE = 200;

// 軸上限取「4 的整數倍的漂亮數字」，讓五條格線都落在整數刻度上
function rbNiceMax(v: number): number {
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  for (const s of steps) if (s * 4 >= v) return s * 4;
  return Math.ceil(v / 4) * 4;
}

function rbShort(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

function RbCard({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--rb-card)",
        border: "1px solid var(--rb-hair)",
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        // grid 的 fr 預設以 min-content 為下限：內容長的那張卡會把同列其他卡擠窄，
        // 欄寬比例就跑掉了（標題被迫換行）。歸零才會照 1.4/1.05/1.1 分。
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const rbEmpty: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12.5,
  color: "var(--rb-ink3)",
};

function RbCardTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
      {note && <div className="mono" style={{ fontSize: 11.5, color: "var(--rb-ink3)" }}>{note}</div>}
    </div>
  );
}

// KPI 卡：大數字 + 一行說明。數字右上角那顆燈跟顏色是雙重編碼，不靠顏色單獨表意。
function RbStat({
  label,
  value,
  unit,
  note,
  color,
  dot,
  bar,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: React.ReactNode;
  color?: string;
  dot: string;
  bar?: number;
}) {
  return (
    <RbCard style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12.5, color: "var(--rb-ink3)" }}>{label}</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 3 }}>
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color }}>
              {value}
            </span>
            {unit && (
              <span className="mono" style={{ fontSize: 12, color: "var(--rb-ink3)", paddingTop: 4 }}>
                {unit}
              </span>
            )}
          </div>
        </div>
        {/* 用 line-height 置中而不是 flex：html2canvas 畫「flex 容器裡直接放文字」會把字
            往下偏出框外（下載 PDF 時燈號跑到方框外面），line-height 置中兩邊都正常。 */}
        <div
          style={{
            width: 34,
            height: 34,
            lineHeight: "34px",
            textAlign: "center",
            borderRadius: 9,
            background: "rgba(48,60,84,0.07)",
            fontSize: 15,
            flex: "none",
          }}
        >
          {dot}
        </div>
      </div>
      {bar !== undefined ? (
        <div style={{ marginTop: 12, height: 5, borderRadius: 999, background: "rgba(48,60,84,0.11)", overflow: "hidden" }}>
          <div style={{ width: `${bar}%`, height: "100%", background: "var(--rb-lime)" }} />
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--rb-ink2)" }}>{note}</div>
      )}
    </RbCard>
  );
}

// 甜甜圈：圓周 2π×52 ≈ 326.73，每段用 dasharray 切、dashoffset 接續往下排
const RB_C = 2 * Math.PI * 52;

function RbDonut({ segments, center, sub }: { segments: { value: number; color: string }[]; center: React.ReactNode; sub: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  // 每段的起始位移先一次算好：在 map 裡累加外部變數是 render 期間的副作用，
  // React 重複呼叫 render 時算出來的圈會接不上。
  const lens = segments.map((s) => (RB_C * s.value) / total);
  const offsets = lens.map((_, i) => -lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div style={{ position: "relative", width: 124, height: 124, flex: "none" }}>
      <svg width="124" height="124" viewBox="0 0 124 124" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="62" cy="62" r="52" fill="none" stroke="rgba(48,60,84,0.10)" strokeWidth="13" />
        {segments.map((s, i) => {
          const len = lens[i];
          const offset = offsets[i];
          if (len <= 0) return null;
          return (
            <circle
              key={i}
              cx="62"
              cy="62"
              r="52"
              fill="none"
              stroke={s.color}
              strokeWidth="13"
              strokeDasharray={`${len} ${RB_C - len}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        {center}
        <div className="mono" style={{ fontSize: 10.5, color: "var(--rb-ink3)" }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

// 雷達圖：五個角固定對應 CATEGORY5_ORDER，頂點角度 -90° 起每 72° 一個，
// 外環 R=120（=100 分），資料點 R = 120 × passRate/100。標籤位置照設計稿。
const RB_RADAR_LABEL: { x: number; y: number; anchor: "start" | "middle" | "end" }[] = [
  { x: 160, y: 22, anchor: "middle" },
  { x: 262, y: 124, anchor: "start" },
  { x: 212, y: 278, anchor: "middle" },
  { x: 106, y: 278, anchor: "middle" },
  { x: 32, y: 120, anchor: "end" },
];

function rbRadarPoint(i: number, r: number): [number, number] {
  const a = ((-90 + i * 72) * Math.PI) / 180;
  return [160 + r * Math.cos(a), 160 + r * Math.sin(a)];
}

function rbPoly(r: number | ((i: number) => number), n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = rbRadarPoint(i, typeof r === "function" ? r(i) : r);
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(" ");
}

// 優先處理順序：fail 排在 warn 前面，同狀態時通過率低的分類先處理。
// 描述用後端已經寫好的 impact（「這代表什麼」），沒有才退回 advice——不在
// 前端自己編一段話。
interface RbPriority {
  title: string;
  body: string;
  status: CheckStatus;
  group: string;
}

function buildPriorities(engine: EngineResult, audit: CheckItem[] | undefined, cats: Category5[]): RbPriority[] {
  const list: RbPriority[] = [];

  for (const b of engine.results) {
    if (b.status === "blocked") {
      list.push({
        title: `${b.label} 進不來`,
        body: engine.wafHint?.impact ?? `robots.txt 比對到的規則是「${b.matchedRule}」，這家爬蟲拿不到你的頁面。`,
        status: "fail",
        group: "AI 可達性",
      });
    } else if (b.status === "mismatch") {
      list.push({
        title: `放行 ${b.label}`,
        body: engine.wafHint?.impact ?? `robots.txt 寫的是允許，但實際以這家爬蟲的身分請求時被擋下來。`,
        status: "warn",
        group: "AI 可達性",
      });
    }
  }
  if (engine.contentSignals && !engine.contentSignals.declared) {
    list.push({
      title: "補上內容使用授權表態",
      body: "search、ai-input、ai-train 三項都沒有表態。沒有寫，各家 AI 廠商只能自己解讀你的立場。",
      status: "warn",
      group: "AI 可達性",
    });
  }
  if (engine.llmsTxt.exists === false) {
    list.push({
      title: "補上 llms.txt",
      body: "網站沒有 llms.txt。這是給 AI 看的網站導覽，沒有的話 AI 只能靠自己爬到的頁面拼湊你在做什麼。",
      status: "warn",
      group: "AI 可達性",
    });
  }

  for (const c of audit ?? []) {
    if (c.status === "ok") continue;
    const group = CATEGORY5_KEY_MAP[c.key];
    if (!group) continue;
    list.push({ title: c.item, body: c.impact || c.advice, status: c.status, group });
  }

  const rate = (name: string) => cats.find((c) => c.name === name)?.passRate ?? 100;
  return list
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "fail" ? -1 : 1;
      return rate(a.group) - rate(b.group);
    })
    .slice(0, 4);
}

// 檢測結果分佈：報告圖裡是列印用（整張戰情表要完整），螢幕上改放在「深度健檢」
// 正上方——它講的就是那張表的組成，貼著它才是圖文對照，擺在報告圖裡離得太遠。
function RbCheckDistribution({ cats }: { cats: Category5[] }) {
  const totals = cats.reduce(
    (acc, c) => ({ ok: acc.ok + c.ok, warn: acc.warn + c.warn, fail: acc.fail + c.fail }),
    { ok: 0, warn: 0, fail: 0 },
  );
  const checkTotal = totals.ok + totals.warn + totals.fail;
  const overall = computeOverallScore(cats);
  return (
    <RbCard style={{ gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{checkTotal} 項檢測結果分佈</div>
      {/* 這張卡在報告圖裡是三欄之一（約 320px），單獨放在報告欄裡卻有 736px——
          不封頂的話圖例會被拉開成一整排，數字飄到很右邊。 */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, maxWidth: 420 }}>
        <RbDonut
          segments={[
            { value: totals.ok, color: "var(--rb-ok)" },
            { value: totals.warn, color: "var(--rb-warn)" },
            { value: totals.fail, color: "var(--rb-fail)" },
          ]}
          center={<div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{checkTotal}</div>}
          sub="項"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
          {([["正常", totals.ok, "ok"], ["可優化", totals.warn, "warn"], ["需處理", totals.fail, "fail"]] as const).map(
            ([label, n, st]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: RB_STATUS_VAR[st], flex: "none" }} />
                <span style={{ fontSize: 13, color: "var(--rb-ink2)", flex: 1 }}>{label}</span>
                <span className="mono" style={{ fontSize: 13 }}>{n}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--rb-ink3)", width: 34, textAlign: "right" }}>
                  {checkTotal > 0 ? Math.round((n / checkTotal) * 100) : 0}%
                </span>
              </div>
            ),
          )}
        </div>
      </div>
      <div style={{ paddingTop: 14, borderTop: "1px solid var(--rb-hair2)", fontSize: 12.5, lineHeight: 1.65, color: "var(--rb-ink3)" }}>
        總分 {overall.score} 是五分類通過率的平均：（{cats.map((c) => c.passRate).join("＋")}）÷ {cats.length}。
      </div>
    </RbCard>
  );
}

// 螢幕上單獨放一張報告圖的卡片時，要自己帶 --rb-* 色票（那組變數是 scope 在
// .report-board 裡的），不然全部 var() 解不出來。
function RbSoloCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={RB_VARS}>
      {children}
    </div>
  );
}

// withTable：底下那排「分類｜分數｜項目數」只有列印版要——螢幕上分數已經寫在
// 雷達的軸標籤旁邊了，再列一次是同一組數字講兩次。
function RbRadar({ cats, withTable = false }: { cats: Category5[]; withTable?: boolean }) {
  return (
    <>
        <svg viewBox="-58 0 438 300" style={{ width: "100%", height: 238, display: "block" }}>
          <polygon points={rbPoly(60, cats.length)} fill="none" stroke="rgba(48,60,84,0.16)" />
          <polygon points={rbPoly(120, cats.length)} fill="none" stroke="rgba(48,60,84,0.26)" />
          {cats.map((_, i) => {
            const [x, y] = rbRadarPoint(i, 120);
            return <line key={i} x1="160" y1="160" x2={x} y2={y} stroke="rgba(48,60,84,0.16)" />;
          })}
          <polygon
            points={rbPoly((i) => (120 * cats[i].passRate) / 100, cats.length)}
            fill="rgba(252,180,24,0.22)"
            stroke="#fcb418"
            strokeWidth="2.5"
          />
          {cats.map((c, i) => {
            const [x, y] = rbRadarPoint(i, (120 * c.passRate) / 100);
            const weak = c.fail > 0;
            return <circle key={c.name} cx={x} cy={y} r={weak ? 5 : 4} fill={weak ? "var(--rb-fail)" : "#fcb418"} />;
          })}
          {cats.map((c, i) => {
            // 底下兩個角的標籤已經貼近 viewBox 下緣，分數那行要往上讓一點才不會被切掉
            const y = RB_RADAR_LABEL[i].y - (RB_RADAR_LABEL[i].y > 260 ? 7 : 0);
            const color = c.fail > 0 ? "#b8342c" : "#4a5468";
            return (
              <g key={c.name}>
                <text x={RB_RADAR_LABEL[i].x} y={y} textAnchor={RB_RADAR_LABEL[i].anchor} fontSize="14" fill={color}>
                  {c.name}
                </text>
                <text
                  x={RB_RADAR_LABEL[i].x}
                  y={y + 17}
                  textAnchor={RB_RADAR_LABEL[i].anchor}
                  fontSize="15"
                  fontWeight="600"
                  fill={color}
                >
                  {c.total > 0 ? c.passRate : "—"}
                </text>
              </g>
            );
          })}
        </svg>
      {withTable && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cats.length},1fr)`, gap: 6, paddingTop: 14, borderTop: "1px solid var(--rb-hair2)" }}>
          {/* 分數旁邊一定要帶項目數：品牌與權威只有 1 項檢測，跟技術與索引的 14 項
              在雷達上長得一樣大。不寫出來，讀者會以為 50 分跟 82 分是同一種可信度。 */}
          {cats.map((c) => (
            <div key={c.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--rb-ink3)" }}>{c.name}</span>
              <span className="mono" style={{ fontSize: 14, color: c.fail > 0 ? "var(--rb-fail)" : undefined }}>
                {c.total > 0 ? c.passRate : "—"}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--rb-ink3)" }}>{c.total} 項</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// 環形總分。螢幕上的總覽卡用，圓周 2π×54。
function RbScoreRing({ score }: { score: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(48,60,84,0.12)" strokeWidth="10" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke="var(--rb-lime)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, score)) / 100)}
      />
    </svg>
  );
}

// 螢幕上「健檢報告圖」只顯示這一張：總分＋等第＋三個狀態計數＋五分類雷達。
// 其餘每一張圖在報告下面都有對應的完整段落，圖上再放一次就是同一件事講兩次；
// 完整的戰情表留給列印（PDF）——那是一張要單獨帶走的東西，該有的都要在。
function RbScoreSummary({ cats }: { cats: Category5[] }) {
  const overall = computeOverallScore(cats);
  const totals = cats.reduce(
    (acc, c) => ({ ok: acc.ok + c.ok, warn: acc.warn + c.warn, fail: acc.fail + c.fail }),
    { ok: 0, warn: 0, fail: 0 },
  );
  return (
    <div className="rb-screen-only" style={{ ...RB_VARS, background: "var(--rb-card)", border: "1px solid var(--rb-hair)", borderRadius: 12, padding: 24 }}>
      <div className="grid gap-6 sm:grid-cols-[168px_1fr] sm:items-center">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: 132, height: 132 }}>
            <RbScoreRing score={overall.score} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <b style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--rb-ink)" }}>
                {overall.score}
              </b>
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "var(--rb-ink3)" }}>總分</span>
            </div>
          </div>
          <span
            className="mono"
            style={{ background: "var(--rb-lime)", border: "1px solid rgba(140,90,5,0.35)", borderRadius: 999, padding: "5px 14px", fontSize: 12.5, fontWeight: 600, color: "var(--rb-ink)" }}
          >
            {overall.grade} 級・{overall.gradeLabel}
          </span>
          <div className="mono" style={{ display: "flex", gap: 16, textAlign: "center", fontSize: 12 }}>
            {([["正常", totals.ok, "ok"], ["可優化", totals.warn, "warn"], ["需處理", totals.fail, "fail"]] as const).map(
              ([label, n, st]) => (
                <div key={label}>
                  <b style={{ display: "block", fontSize: 16, color: RB_STATUS_VAR[st] }}>{n}</b>
                  <span style={{ color: "var(--rb-ink3)" }}>{label}</span>
                </div>
              ),
            )}
          </div>
        </div>
        <div style={{ color: "var(--rb-ink)" }}>
          <RbRadar cats={cats} />
        </div>
      </div>
    </div>
  );
}

// 引用網址拿掉協定、把中文路徑解回來顯示（%E8%81%AF… → 聯絡我們），PDF 上才不會一長串百分號。
function readableUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "");
  try { return decodeURIComponent(bare); } catch { return bare; }
}

function ReportBoard({
  origin,
  engine,
  audit,
  pageWords,
  crawledPages,
}: {
  origin: string;
  engine: EngineResult;
  audit?: CheckItem[];
  pageWords?: number[];
  crawledPages: number;
}) {
  const cats = buildCategories5(engine, audit);
  const overall = computeOverallScore(cats);
  const totals = cats.reduce(
    (acc, c) => ({ ok: acc.ok + c.ok, warn: acc.warn + c.warn, fail: acc.fail + c.fail }),
    { ok: 0, warn: 0, fail: 0 },
  );
  const checkTotal = totals.ok + totals.warn + totals.fail;

  const flat = buildStatusGrid(engine, audit).flatMap((g) => g.items);
  const nameList = (s: CheckStatus) =>
    flat.filter((i) => i.status === s).slice(0, 3).map((i) => i.label).join("、");

  const bots = engine.results;
  const botOk = bots.filter((b) => b.status === "allowed").length;
  const botBlocked = bots.filter((b) => b.status === "blocked").length;
  const botMismatch = bots.filter((b) => b.status === "mismatch").length;
  const botUnknown = bots.filter((b) => b.status === "unknown").length;
  const botNote =
    [
      botBlocked > 0 ? `${botBlocked} 家被擋` : "",
      botMismatch > 0 ? `${botMismatch} 家政策允許但實測被擋` : "",
      botUnknown > 0 ? `${botUnknown} 家無法判定` : "",
    ]
      .filter(Boolean)
      .join("、") || "全部都進得來";

  const vis = engine.visibility;
  const engines = engine.brandVisibility;
  const citedSelf = engines.filter((e) => e.citedSelf).length;
  const priorities = buildPriorities(engine, audit, cats);
  const today = new Date().toISOString().slice(0, 10);
  const host = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // 累積曲線。單線＝AI 爬蟲一頁一頁讀下去累積拿到的可讀字數。
  // 沒有「使用者看到的字數」那條線：健檢只抓原始 HTML，不跑 headless 渲染，
  // 那個數字從來沒有量過——畫上去就是編的。
  const words = pageWords ?? [];
  const cumulative = words.reduce<number[]>((acc, w) => [...acc, (acc[acc.length - 1] ?? 0) + w], []);
  const totalWords = cumulative[cumulative.length - 1] ?? 0;
  const axisMax = rbNiceMax(totalWords);
  const chartOk = cumulative.length >= 2;
  const px = (i: number) => RB_X0 + ((RB_X1 - RB_X0) * i) / (cumulative.length - 1);
  const py = (v: number) => RB_Y_BASE - ((RB_Y_BASE - RB_Y_TOP) * v) / axisMax;
  const linePath = cumulative.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaPath = chartOk ? `${linePath} L${RB_X1},${RB_Y_BASE} L${RB_X0},${RB_Y_BASE} Z` : "";
  // 頁數多的時候軸標籤只留幾格，不然數字會疊在一起
  const tickEvery = Math.max(1, Math.ceil(cumulative.length / 12));

  // 四道關卡：AI 要引用你，得依序過這四關。每一關的數字都是實測值。
  // GATE 2 的分母 500 字是 lib/geo-content-visibility.ts 的 THIN_TEXT 門檻
  //（低於這個字數判定為「內容單薄」），不是隨手抓的。
  const THIN = 500;
  const jsonLdTypes = vis?.jsonLdTypes ?? [];
  const schemaRate = cats.find((c) => c.name === "結構化資料")?.passRate ?? 0;
  const gates = [
    {
      no: "GATE 1",
      name: "進得來",
      rate: bots.length > 0 ? Math.round((botOk / bots.length) * 100) : 0,
      note: `${botOk} / ${bots.length} 家實測可存取`,
      status: (botBlocked > 0 ? "fail" : botOk === bots.length ? "ok" : "warn") as CheckStatus,
    },
    {
      no: "GATE 2",
      name: "讀得到",
      rate: vis ? Math.min(100, Math.round((vis.textLength / THIN) * 100)) : 0,
      note: `首頁可讀 ${vis?.textLength ?? 0} 字（門檻 ${THIN}）`,
      status: (vis?.status === "ok" ? "ok" : vis?.status === "thin" ? "warn" : "fail") as CheckStatus,
    },
    {
      no: "GATE 3",
      name: "抽得出、有表態",
      rate: schemaRate,
      note: `${jsonLdTypes.length} 種 JSON-LD 型別`,
      status: (schemaRate >= 80 ? "ok" : schemaRate >= 50 ? "warn" : "fail") as CheckStatus,
    },
    {
      no: "GATE 4",
      name: "被引用",
      rate: engines.length > 0 ? Math.round((citedSelf / engines.length) * 100) : 0,
      note: engines.length > 0 ? `${citedSelf} / ${engines.length} 家引擎提到你` : "沒有實測資料",
      status: (engines.length === 0 ? "warn" : citedSelf === engines.length ? "ok" : citedSelf > 0 ? "warn" : "fail") as CheckStatus,
    },
  ];

  return (
    <div
      className="report-board"
      style={{
        ...RB_VARS,
        color: "var(--rb-ink)",
        fontFamily: "var(--font-archivo), 'Noto Sans TC', 'PingFang TC', system-ui, sans-serif",
      }}
    >
      <RbScoreSummary cats={cats} />

      {/* 以下整包只在列印時出現。螢幕上這些圖每一張在報告下面都有對應的完整段落，
          放在這裡就是同一件事講兩次；PDF 是一張要單獨帶走的戰情表，該有的都要在。 */}
      <div className="rb-print-only-block rb-print-stack">
      {/* 抬頭 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 這張圖要能跟著列印輸出，
              next/image 的 lazy/placeholder 在列印時可能還沒換成真圖 */}
          <img src="/geocheck-logo.webp" alt="" style={{ height: 28, width: 41, objectFit: "contain" }} />
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>GEOCHECK</span>
          <div style={{ width: 1, height: 34, background: "var(--rb-hair)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>AI 能見度健檢總覽</div>
            <div style={{ fontSize: 13, color: "var(--rb-ink3)" }}>
              {checkTotal} 項檢測 · {bots.length} 家 AI 爬蟲 · {engines.length} 家 AI 引擎 · {crawledPages} 頁
            </div>
          </div>
        </div>
        <div className="mono" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
          <div style={{ background: "var(--rb-card)", border: "1px solid var(--rb-hair)", borderRadius: 8, padding: "9px 14px" }}>
            {host}
          </div>
          <div style={{ background: "var(--rb-card)", border: "1px solid var(--rb-hair)", borderRadius: 8, padding: "9px 14px", color: "var(--rb-ink2)" }}>
            {today}
          </div>
          <div style={{ background: "var(--rb-lime)", border: "1px solid rgba(140,90,5,0.35)", borderRadius: 8, padding: "9px 14px", fontWeight: 600 }}>
            {overall.grade} 級・{overall.gradeLabel}
          </div>
        </div>
      </div>

      {/* KPI 帶 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16 }}>
        <RbStat label="總體能見度" value={overall.score} unit="/100" dot="🟡" bar={overall.score} />
        <RbStat
          label="需處理"
          value={totals.fail}
          color="var(--rb-fail)"
          dot="🔴"
          note={nameList("fail") || "沒有需處理的項目"}
        />
        <RbStat
          label="可優化"
          value={totals.warn}
          color="var(--rb-warn)"
          dot="🟡"
          note={nameList("warn") || "沒有可優化的項目"}
        />
        <RbStat label="正常" value={totals.ok} color="var(--rb-ok)" dot="🟢" note={`共 ${checkTotal} 項檢測`} />
        <RbStat label="爬蟲進得來" value={botOk} unit={`/${bots.length}`} dot="🟢" note={botNote} />
      </div>

      {/* 累積曲線 */}
      {chartOk && (
        <RbCard style={{ padding: "20px 22px 18px", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>AI 爬蟲累積讀到多少內容</div>
              <div style={{ fontSize: 12.5, color: "var(--rb-ink3)" }}>
                爬蟲一頁一頁讀下去，累積拿到的可讀字數。線越平，代表後面的頁面幾乎沒有東西可以讀。
              </div>
            </div>
            <div style={{ display: "flex", gap: 22, textAlign: "right" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 12, color: "var(--rb-ink3)" }}>累積可讀字數</div>
                <div className="mono" style={{ fontSize: 14 }}>{totalWords.toLocaleString()} 字</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 12, color: "var(--rb-ink3)" }}>頁數</div>
                <div className="mono" style={{ fontSize: 14 }}>{cumulative.length} 頁</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 12, color: "var(--rb-ink3)" }}>平均每頁</div>
                <div className="mono" style={{ fontSize: 14 }}>
                  {Math.round(totalWords / cumulative.length).toLocaleString()} 字
                </div>
              </div>
            </div>
          </div>
          <svg viewBox="0 0 1040 244" style={{ width: "100%", height: 212, display: "block" }}>
            <defs>
              <linearGradient id="rbAiFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fcb418" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#fcb418" stopOpacity="0.06" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((i) => {
              const v = (axisMax * (4 - i)) / 4;
              const y = py(v);
              return (
                <g key={i}>
                  <line x1={RB_X0} y1={y} x2={RB_X1} y2={y} stroke={i === 4 ? "rgba(48,60,84,0.22)" : "rgba(48,60,84,0.08)"} />
                  <text x={RB_X0 - 8} y={y + 4} textAnchor="end" fontSize="11.5" fontFamily="var(--font-plex-mono), monospace" fill="#5f6a80">
                    {rbShort(v)}
                  </text>
                </g>
              );
            })}
            <path d={areaPath} fill="url(#rbAiFill)" />
            <path d={linePath} fill="none" stroke="#fcb418" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx={RB_X1} cy={py(totalWords)} r="5" fill="#fcb418" />
            {cumulative.map((_, i) =>
              i % tickEvery === 0 || i === cumulative.length - 1 ? (
                <text key={i} x={px(i)} y="216" textAnchor="middle" fontSize="11" fontFamily="var(--font-plex-mono), monospace" fill="#5f6a80">
                  {i + 1}
                </text>
              ) : null,
            )}
            <text x="540" y="238" textAnchor="middle" fontSize="11.5" fill="#5f6a80">
              爬蟲讀到第幾頁
            </text>
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20, paddingTop: 12, borderTop: "1px solid var(--rb-hair2)" }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--rb-ink2)", maxWidth: "60em" }}>
              {cumulative.length} 頁讀完，AI 爬蟲累積拿到 {totalWords.toLocaleString()} 個可讀的字，平均一頁{" "}
              {Math.round(totalWords / cumulative.length).toLocaleString()} 字。這是關掉 JavaScript
              後量到的——爬蟲看到的就是這些，不是你在瀏覽器裡看到的那些。
            </div>
            <div className="mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--rb-ink3)", flex: "none" }}>
              <span style={{ width: 14, height: 2, background: "#fcb418", display: "inline-block" }} />
              AI 爬蟲累積字數
            </div>
          </div>
        </RbCard>
      )}

      {/* 六張卡放同一個 grid。螢幕上只留五分類雷達——其餘每一張在報告下面都有
          完整版本（爬蟲存取、AI 認不認得你、AI 眼中的你、結構化資料、深度健檢），
          圖上再放一次就是同一件事講兩次。列印時六張全開排兩列三欄，那才是要單獨
          帶走的完整戰情表。用同一個 grid 是因為藏掉其中一張只會少一格，不會像
          兩個獨立 grid 那樣在某一欄留下空洞。 */}
      <div className="rb-grid">
        <RbCard style={{ gap: 18 }}>
          <RbCardTitle title="AI 引用你的四道關卡" note="每一關的實測通過率" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, alignItems: "end", height: 132 }}>
            {gates.map((g) => (
              <div key={g.no} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, height: "100%" }}>
                <div className="mono" style={{ fontSize: 12.5, color: RB_STATUS_VAR[g.status] }}>
                  {g.rate}%
                </div>
                <div style={{ height: `${Math.max(g.rate, 2)}%`, borderRadius: "6px 6px 0 0", background: RB_STATUS_VAR[g.status] }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, paddingTop: 12, borderTop: "1px solid var(--rb-hair2)" }}>
            {gates.map((g) => (
              <div key={g.no} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", color: g.status === "fail" ? "var(--rb-fail)" : "var(--rb-ink3)" }}>
                  {g.no}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: g.status === "fail" ? "var(--rb-fail)" : undefined }}>{g.name}</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--rb-ink3)" }}>{g.note}</div>
              </div>
            ))}
          </div>
        </RbCard>

        <RbCheckDistribution cats={cats} />

        <RbCard style={{ gap: 16 }}>
          <RbCardTitle title="AI 眼中的你" note="僅首頁" />
          {vis ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <RbDonut
                  segments={[
                    { value: vis.substantiveChars, color: "var(--rb-lime)" },
                    { value: Math.max(vis.textLength - vis.substantiveChars, 0), color: "rgba(48,60,84,0.18)" },
                  ]}
                  center={
                    <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>
                      {vis.textLength > 0 ? Math.round((vis.substantiveChars / vis.textLength) * 100) : 0}%
                    </div>
                  }
                  sub="是內容"
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                  {(
                    [
                      ["成段的內容", vis.substantiveChars, "var(--rb-lime)"],
                      ["選單、標籤等版面文字", vis.furnitureChars, "rgba(48,60,84,0.35)"],
                    ] as const
                  ).map(([label, n, color]) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--rb-ink2)", gap: 8 }}>
                        <span>{label}</span>
                        <span className="mono">{n} 字</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: "rgba(48,60,84,0.11)", overflow: "hidden" }}>
                        <div style={{ width: `${vis.textLength > 0 ? (n / vis.textLength) * 100 : 0}%`, height: "100%", background: color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ paddingTop: 14, borderTop: "1px solid var(--rb-hair2)", fontSize: 12.5, lineHeight: 1.65, color: "var(--rb-ink3)" }}>
                首頁 {vis.scriptCount} 個腳本、HTML 共 {vis.htmlLength.toLocaleString()} 字元，關掉 JavaScript 後剩下{" "}
                {vis.textLength.toLocaleString()} 個可讀的字。
              </div>
            </>
          ) : (
            <div style={rbEmpty}>沒有量到首頁內容。</div>
          )}
        </RbCard>

        <RbCard style={{ gap: 16 }}>
          <RbCardTitle title="五分類通過率" note={`平均 ${overall.score}`} />
          <RbRadar cats={cats} withTable />
          <div className="mono" style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--rb-hair2)", fontSize: 11.5, lineHeight: 1.6, color: "var(--rb-ink3)" }}>
            （正常 ×1 ＋ 可優化 ×0.5）÷ 項目數
          </div>
        </RbCard>

        <RbCard style={{ gap: 14 }}>
          <RbCardTitle title="各家 AI 爬蟲的存取權限" note="政策 × 實測" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {bots.map((b, i) => {
              const flag = b.status === "allowed" ? "🟢" : b.status === "blocked" ? "🔴" : b.status === "mismatch" ? "🟡" : "⚪";
              const color =
                b.status === "allowed"
                  ? "var(--rb-ok)"
                  : b.status === "blocked"
                    ? "var(--rb-fail)"
                    : b.status === "mismatch"
                      ? "var(--rb-warn)"
                      : "var(--rb-gray)";
              const highlight = b.status === "blocked" || b.status === "mismatch";
              return (
                <div
                  key={b.ua}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "baseline",
                    gap: 10,
                    padding: highlight ? "9px 20px" : "9px 0",
                    margin: highlight ? "0 -20px" : undefined,
                    background: highlight ? "rgba(184,52,44,0.09)" : undefined,
                    borderBottom: i < bots.length - 1 ? "1px solid var(--rb-hair2)" : undefined,
                  }}
                >
                  <span className="mono" style={{ fontSize: 12.5 }}>{b.label}</span>
                  <span style={{ fontSize: 12, color }}>
                    {flag} {BADGE[b.status].text}
                  </span>
                </div>
              );
            })}
          </div>
          {(engine.wafHint || engine.robotsNote) && (
            <div
              className="mono"
              style={{
                marginTop: "auto",
                fontSize: 11.5,
                lineHeight: 1.7,
                color: "#f6f5ef",
                background: "#303c54",
                borderRadius: 8,
                padding: "11px 13px",
                whiteSpace: "pre-wrap",
              }}
            >
              {engine.wafHint ? (
                <>
                  {engine.wafHint.technical}
                  {"\n"}
                  <span style={{ color: "var(--rb-lime)" }}>→ {engine.wafHint.impact}</span>
                </>
              ) : (
                engine.robotsNote
              )}
            </div>
          )}
        </RbCard>

        <RbCard style={{ gap: 14 }}>
          <RbCardTitle title="AI 認不認得你？" note={`${engines.length} 家引擎實測`} />
          {engines.length > 0 ? (
            <>
              <div
                className="mono"
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "var(--rb-ink2)",
                  background: "var(--rb-card2)",
                  border: "1px solid var(--rb-hair2)",
                  borderRadius: 8,
                  padding: "11px 13px",
                }}
              >
                {engines[0].query}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {engines.map((r) => {
                  const cite = r.citations.find((c) => c.isSelf) ?? r.citations[0];
                  return (
                    <div key={r.engine} style={{ border: "1px solid var(--rb-hair)", borderRadius: 9, padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span
                          className="mono rb-clip"
                          style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {r.engine}
                        </span>
                        <span style={{ fontSize: 12, whiteSpace: "nowrap", flex: "none", color: r.citedSelf ? "var(--rb-ok)" : "var(--rb-fail)" }}>
                          {r.citedSelf ? "🟢 有提到你" : "🔴 沒有引用你"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--rb-ink2)" }}>{r.advice}</div>
                      {cite && (
                        <div
                          className="mono rb-clip"
                          style={{
                            fontSize: 11.5,
                            color: cite.isSelf ? "var(--rb-gold)" : "var(--rb-ink3)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cite.isSelf ? "★ " : ""}
                          {readableUrl(cite.url)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--rb-hair2)", fontSize: 11.5, lineHeight: 1.6, color: "var(--rb-ink3)" }}>
                ★ 代表引用指向你自己的網域。
              </div>
            </>
          ) : (
            <div style={rbEmpty}>沒有實測資料。</div>
          )}
        </RbCard>
      </div>

      {/* 優先處理順序 */}
      {priorities.length > 0 && (
        <RbCard style={{ padding: "20px 20px 22px", gap: 18 }}>
          <RbCardTitle title="優先處理順序" note="依影響的分類與嚴重度排序" />
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${priorities.length},1fr)`, gap: 0 }}>
            {priorities.map((p, i) => {
              const color = RB_STATUS_VAR[p.status];
              const tint = p.status === "fail" ? "rgba(184,52,44," : "rgba(200,121,26,";
              const rate = cats.find((c) => c.name === p.group)?.passRate;
              return (
                <div
                  key={`${p.title}-${i}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: i === 0 ? "0 22px 0 0" : "0 22px",
                    borderLeft: i > 0 ? "1px solid var(--rb-hair2)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      className="mono"
                      style={{
                        width: 26,
                        height: 26,
                        lineHeight: "22px",
                        textAlign: "center",
                        boxSizing: "border-box",
                        borderRadius: 999,
                        background: `${tint}0.16)`,
                        border: `1px solid ${tint}0.5)`,
                        fontSize: 11.5,
                        color,
                        flex: "none",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {i < priorities.length - 1 && (
                      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${tint}0.5),var(--rb-hair2))` }} />
                    )}
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.title}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--rb-ink2)", paddingRight: 8 }}>{p.body}</div>
                  <div className="mono" style={{ marginTop: "auto", fontSize: 11.5, color }}>
                    {RB_STATUS_DOT[p.status]} {STATUS_LABEL[p.status]} · {p.group} {rate ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </RbCard>
      )}

      <div className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 6, fontSize: 11.5, color: "var(--rb-ink3)" }}>
        <div>AI 搜尋能見度健檢 · {host} · {today}</div>
        <div>⚪ 無法判定不等於通過 — 每一項都是實測結果，不是預估值</div>
      </div>
      </div>
    </div>
  );
}

// PDF 第二頁：關鍵字 AI 能見度。只有使用者按過「查詢」、有結果時才會有這一頁。
// 跟第一頁同一套 --rb- token 跟版型（1200px、抬頭列、KPI 帶、卡片、頁尾）。
// 每個關鍵字一張卡，列每家引擎「有沒有提到你」跟一句判讀；最後是「AI 在推誰」
// 的彙總名單（前十名＋自己的真實名次）。不放引擎回答全文——那是螢幕上展開看的東西，
// 塞進一頁紙只會把重點淹掉。
export type KeywordPageData = {
  keywords: string[];
  results: Record<string, KeywordVisibilityResult[]>;
  citedDomains: CitedDomain[];
};

function KeywordBoard({ origin, data }: { origin: string; data: KeywordPageData }) {
  const today = new Date().toISOString().slice(0, 10);
  const host = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const keywords = data.keywords.filter((k) => data.results[k]);
  const allResults = keywords.flatMap((k) => data.results[k]);
  const hit = allResults.filter((r) => r.citedSelf).length;
  const engineCount = new Set(allResults.map((r) => r.engine)).size;
  const selfRank = data.citedDomains.findIndex((d) => d.isSelf);
  const top = data.citedDomains.slice(0, 10);
  const maxCount = top[0]?.count ?? 1;
  const rest = data.citedDomains.length - top.length;
  const selfBelow = selfRank >= 10 ? data.citedDomains[selfRank] : null;
  const hitStatus: CheckStatus = allResults.length === 0 ? "warn" : hit === allResults.length ? "ok" : hit > 0 ? "warn" : "fail";

  return (
    <div
      className="report-board"
      style={{
        ...RB_VARS,
        color: "var(--rb-ink)",
        fontFamily: "var(--font-archivo), 'Noto Sans TC', 'PingFang TC', system-ui, sans-serif",
      }}
    >
      <div className="rb-print-only-block rb-print-stack">
      {/* 抬頭 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 同第一頁，要跟著輸出成圖 */}
          <img src="/geocheck-logo.webp" alt="" style={{ height: 28, width: 41, objectFit: "contain" }} />
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>GEOCHECK</span>
          <div style={{ width: 1, height: 34, background: "var(--rb-hair)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>關鍵字 AI 能見度</div>
            <div style={{ fontSize: 13, color: "var(--rb-ink3)" }}>
              {keywords.length} 個關鍵字 × {engineCount} 家 AI 引擎 · 實際送出提問，原話與引用來源照貼
            </div>
          </div>
        </div>
        <div className="mono" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
          <div style={{ background: "var(--rb-card)", border: "1px solid var(--rb-hair)", borderRadius: 8, padding: "9px 14px" }}>{host}</div>
          <div style={{ background: "var(--rb-card)", border: "1px solid var(--rb-hair)", borderRadius: 8, padding: "9px 14px", color: "var(--rb-ink2)" }}>{today}</div>
          <div style={{ background: "var(--rb-card)", border: "1px solid var(--rb-hair)", borderRadius: 8, padding: "9px 14px", color: "var(--rb-ink2)" }}>第 2 頁</div>
        </div>
      </div>

      {/* KPI 帶 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        <RbStat label="查詢的關鍵字" value={keywords.length} unit="個" dot="🔍" note={keywords.map((k) => `「${k}」`).join("")} />
        <RbStat
          label="有提到你的回答"
          value={hit}
          unit={`/${allResults.length}`}
          color={RB_STATUS_VAR[hitStatus]}
          dot={RB_STATUS_DOT[hitStatus]}
          note={hit === 0 ? "AI 回答這些關鍵字時沒有引用你" : `${allResults.length} 次提問裡有 ${hit} 次引用了你的網站`}
        />
        <RbStat label="被引用的網域" value={data.citedDomains.length} unit="個" dot="🌐" note="所有回答的引用來源，依網域彙總" />
        <RbStat
          label="你在名單裡排第"
          value={selfRank >= 0 ? selfRank + 1 : "—"}
          unit={selfRank >= 0 ? `/${data.citedDomains.length}` : undefined}
          color={selfRank < 0 ? "var(--rb-fail)" : selfRank < 3 ? "var(--rb-ok)" : undefined}
          dot={selfRank < 0 ? "🔴" : selfRank < 3 ? "🟢" : "🟡"}
          note={selfRank < 0 ? "沒進名單，AI 拿別人的網站當答案" : `被引用 ${data.citedDomains[selfRank].count} 次`}
        />
      </div>

      {/* 每個關鍵字一張卡 */}
      <div style={{ display: "grid", gridTemplateColumns: keywords.length === 1 ? "1fr" : "repeat(2,1fr)", gap: 16 }}>
        {keywords.map((k) => (
          <RbCard key={k} style={{ gap: 12 }}>
            <RbCardTitle title={`「${k}」`} note={`${data.results[k].filter((r) => r.citedSelf).length}/${data.results[k].length} 家提到你`} />
            {data.results[k].length === 0 ? (
              <div style={rbEmpty}>這個關鍵字沒有查到結果。</div>
            ) : (
              data.results[k].map((r) => {
                const cite = r.citations.find((c) => c.isSelf) ?? r.citations[0];
                return (
                  <div key={r.engine} style={{ border: "1px solid var(--rb-hair)", borderRadius: 9, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span className="mono rb-clip" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.engine}</span>
                      <span style={{ fontSize: 12, whiteSpace: "nowrap", flex: "none", color: r.citedSelf ? "var(--rb-ok)" : "var(--rb-fail)" }}>
                        {r.citedSelf ? "🟢 有提到你" : "🔴 沒有引用你"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--rb-ink2)" }}>{r.advice}</div>
                    {cite && (
                      <div className="mono rb-clip" style={{ fontSize: 11.5, color: cite.isSelf ? "var(--rb-gold)" : "var(--rb-ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cite.isSelf ? "★ " : ""}
                        {readableUrl(cite.url)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </RbCard>
        ))}
      </div>

      {/* AI 在推誰 */}
      {data.citedDomains.length > 0 && (
        <RbCard style={{ gap: 14 }}>
          <RbCardTitle title="這些關鍵字底下，AI 在推誰" note="依被引用次數排序 · 前 10 名" />
          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--rb-ink2)" }}>
            把每個回答的引用來源依網域彙總，就是 AI 目前的推薦名單。名單裡通常會混進百科、社群、論壇——那是 AI 找資料的地方，不是你的同業；要看的是跟你做同一件事、卻被引用到的那幾個網域。
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", columnGap: 28, rowGap: 8 }}>
            {top.map((d, i) => (
              <div key={d.domain} style={{ display: "grid", gridTemplateColumns: "22px 1fr 44px", alignItems: "center", gap: 10 }}>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--rb-ink3)", textAlign: "right" }}>{i + 1}</span>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="mono rb-clip" style={{ fontSize: 12.5, fontWeight: d.isSelf ? 600 : 400, color: d.isSelf ? "var(--rb-gold)" : "var(--rb-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.isSelf ? "★ " : ""}{d.domain}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--rb-ink3)", whiteSpace: "nowrap", flex: "none" }}>{d.keywords.map((k) => `「${k}」`).join("")}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: "rgba(48,60,84,0.11)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(6, (d.count / maxCount) * 100)}%`, height: "100%", background: d.isSelf ? "var(--rb-lime)" : "rgba(48,60,84,0.45)" }} />
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--rb-ink3)", textAlign: "right" }}>{d.count} 次</span>
              </div>
            ))}
          </div>
          {(selfBelow || rest > 0 || selfRank < 0) && (
            <div style={{ borderTop: "1px solid var(--rb-hair2)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.6, color: "var(--rb-ink2)" }}>
              {selfBelow && (
                <div>
                  <span className="mono" style={{ color: "var(--rb-gold)", fontWeight: 600 }}>★ {selfBelow.domain}</span> 排第 {selfRank + 1}，被引用 {selfBelow.count} 次。
                </div>
              )}
              {selfRank < 0 && <div>你的網站沒有出現在這份名單裡。AI 現在拿來當答案的是上面那些網域。</div>}
              {rest > 0 && <div style={{ color: "var(--rb-ink3)" }}>另外還有 {rest} 個網域被引用過，多半只出現一次，屬於長尾，這裡不列。</div>}
            </div>
          )}
        </RbCard>
      )}

      <div className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 6, fontSize: 11.5, color: "var(--rb-ink3)" }}>
        <div>AI 搜尋能見度健檢 · {host} · {today}</div>
        <div>AI 推誰主要看內容深度與品牌權威，這份名單是現況快照，不是技術診斷</div>
      </div>
      </div>
    </div>
  );
}

// 外框：標題列＋存 PDF 按鈕，以及讓圖在窄螢幕橫向捲動的容器。
// 存 PDF 不走 window.print()——小積木要的是直接拿到檔案，不要跳列印對話框。
// 做法：按下去時在畫面外多掛一份完整版戰情表（.rb-export 讓列印才出現的區塊全部顯示、
// 版型鎖 1200px），用 modern-screenshot 畫成點陣圖，再塞進 jsPDF 存成一頁 PDF。兩個套件都是
// 按了才動態載入，不進首頁的 bundle。
function ReportBoardSection({
  keywordPage,
  ...props
}: React.ComponentProps<typeof ReportBoard> & { keywordPage: KeywordPageData | null }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exporting) return;
    let cancelled = false;
    (async () => {
      try {
        const boards = [...(exportRef.current?.querySelectorAll<HTMLElement>(".report-board") ?? [])];
        if (boards.length === 0) throw new Error("找不到報告圖");
        // 等字型載完再畫，不然 canvas 上會是備用字型
        await document.fonts?.ready;
        // modern-screenshot 走 SVG foreignObject：由瀏覽器自己的排版引擎畫，字的位置跟
        // 螢幕上一模一樣。之前用 html2canvas 是自己重新排字，中英夾雜就會位移、
        // 全形括號疊到數字上、徽章裡的字掉到框外。
        const [{ domToCanvas }, { jsPDF }] = await Promise.all([import("modern-screenshot"), import("jspdf")]);
        // 一張圖一頁：第一頁健檢總覽，第二頁（有查關鍵字才有）關鍵字能見度。
        // 每頁的紙張大小照該頁內容高度開，不硬塞進 A4。
        let pdf: InstanceType<typeof jsPDF> | null = null;
        for (const el of boards) {
          const canvas = await domToCanvas(el, { scale: 2, backgroundColor: "#f6f5ef" });
          if (cancelled) return;
          const w = canvas.width / 2;
          const h = canvas.height / 2;
          const orientation = w >= h ? "landscape" : "portrait";
          if (!pdf) pdf = new jsPDF({ orientation, unit: "px", format: [w, h], hotfixes: ["px_scaling"], compress: true });
          else pdf.addPage([w, h], orientation);
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
        }
        if (!pdf) return;
        const host = (() => { try { return new URL(props.origin).hostname; } catch { return "site"; } })();
        pdf.save(`geocheck-${host}-${new Date().toISOString().slice(0, 10)}.pdf`);
      } catch (e) {
        if (!cancelled) setExportError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setExporting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [exporting, props.origin]);

  return (
    <div>
      <div className="report-board-actions mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="eyebrow">五分類總覽</h2>
        <button
          type="button"
          onClick={() => { setExportError(null); setExporting(true); }}
          disabled={exporting}
          className="btn-line text-xs disabled:opacity-60"
        >
          {exporting ? "產生中…" : "下載 PDF"}
        </button>
      </div>
      <div className="report-board-scroll">
        <ReportBoard {...props} />
      </div>
      <p className="report-board-actions mt-2 text-xs text-ink3">
        下載的 PDF 是完整的健檢報告圖——爬蟲累積讀到的內容、四道關卡、各家爬蟲存取權限、AI
        認不認得你、優先處理順序全部在一張紙上，直接轉給合作對象。
        {keywordPage ? "關鍵字 AI 能見度的結果會放在第 2 頁。" : "下面查過關鍵字的話，結果會多一頁放進去。"}
      </p>
      {exportError && <p className="mt-2 text-xs text-fail">PDF 沒產出來：{exportError}</p>}
      {exporting && (
        <div ref={exportRef} className="rb-export" aria-hidden="true">
          <ReportBoard {...props} />
          {keywordPage && <KeywordBoard origin={props.origin} data={keywordPage} />}
        </div>
      )}
    </div>
  );
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
function CheckRow({ c, origin }: { c: CheckItem; origin?: string }) {
  const ui = CHECK_UI[c.status];
  return (
    <div className="flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-2">
        <span className={`mono rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>{ui.text}</span>
        <p className="text-sm font-medium text-ink">{c.item}</p>
      </div>
      <div className="text-sm text-ink2">
        <CheckBody c={c} origin={origin} />
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
                <CheckRow c={schemaCheck} origin={origin} />
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
                <CheckRow c={localBizCheck!} origin={origin} />
              </div>
            )}
          </>
        )}

        {tab === "generate" && <GenerateCompleteTab schemaCards={schemaCards} origin={origin} />}
      </div>
    </div>
  );
}

// 19 項逐條展開是報告裡最大一片文字。該先做的四項健檢報告圖的「優先處理順序」
// 已經挑出來了，這張表是「要查證時才翻」的明細，不該用一整片文字擋在路上，所以
// 預設收合。跟 BotAccessList 同一個原則：收合是預設呈現方式，不是藏資訊——標題列
// 保留三個狀態的數量，一鍵展開看全部。
function AuditTable({ checks, origin }: { checks: CheckItem[]; origin?: string }) {
  const [open, setOpen] = useState(false);
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="mono flex gap-3 text-xs">
            <span className="text-fail">需處理 {sc.fail}</span>
            <span className="text-warn">可優化 {sc.warn}</span>
            <span className="text-ok">正常 {sc.ok}</span>
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-line text-xs">
            {open ? "收合明細" : `展開 ${checks.length} 項明細`}
          </button>
        </div>
      </div>
      {!open && (
        <p className="text-xs leading-relaxed text-ink3">
          該先處理的幾項已經列在上面「健檢報告圖」的優先處理順序。這裡是全部 {checks.length}{" "}
          項的判定依據與量到的值，要查證某一項再展開。
        </p>
      )}
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
      {open && (
      <div className="hidden space-y-5 sm:block">
        {[...groups.entries()].map(([category, rows]) => (
          <div key={category}>
            <p className="mono mb-2 text-lg font-semibold tracking-wide text-[var(--goldInk)] uppercase">{category}</p>
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
                    <th>現況</th>
                    <th>問題頁面</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const ui = CHECK_UI[c.status];
                    const hasDetail = !!(c.impact || c.technical || c.evidence);
                    return (
                      <Fragment key={c.key}>
                        <tr className={hasDetail ? "has-detail" : undefined}>
                          <td>
                            <span className={`mono rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>
                              {ui.text}
                            </span>
                          </td>
                          <td className="item">{c.item}</td>
                          <td className="text-ink2">{linkifyGlossary(c.advice)}</td>
                          <td>
                            {c.details && c.details.length > 0 ? (
                              <DetailsToggle title={c.item} details={c.details} />
                            ) : (
                              <span className="text-ink3/50">—</span>
                            )}
                          </td>
                        </tr>
                        {/* 影響框與技術細節獨立一整列橫跨到底，不縮在現況欄裡——那欄寬度
                            只剩三百多 px，長一點的文字擠在裡面會被逼到逐字斷行。 */}
                        {hasDetail && (
                          <tr className="detail-row">
                            <td colSpan={4}>
                              <CheckBody c={c} origin={origin} withAdvice={false} />
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
      )}

      {open && (
      <div className="space-y-5 sm:hidden">
        {[...groups.entries()].map(([category, rows]) => (
          <div key={category}>
            <p className="mono mb-2 text-lg font-semibold tracking-wide text-[var(--goldInk)] uppercase">{category}</p>
            <div className="divide-y divide-line2 rounded-[10px] border border-ink/15 bg-card">
              {rows.map((c) => (
                <CheckRow key={c.key} c={c} origin={origin} />
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// 各家 AI 爬蟲存取權限：全部結果一致時（常見情況——多數網站的 robots.txt
// 對所有 bot 一視同仁）收成一行摘要，不要 8 列一字不差的重複；
// 有落差時（真正有故事可講——部分被擋、政策跟實測不一致）才展開逐項列表。
// 收合只是預設呈現方式，不是藏資訊——一鍵可以展開看明細。
// blocked／mismatch 才有話講：allowed 沒什麼好說的，unknown 是我們讀不到答案，
// 硬塞一段影響說明只是空話。回傳白話影響 + 技術細節兩段，跟深度健檢同一套結構。
function botAccessImpact(status: BotStatus, label: string): { impact: string; technical: string } | null {
  if (status === "blocked") {
    return {
      impact: `${label}被你的 robots.txt 擋在門外。它讀不到你的頁面，就不可能在回答裡引用你——這不是「排名比較後面」，是根本不在名單裡。`,
      technical: `robots.txt 有一條 Disallow 規則命中這個爬蟲。加一條 Allow: /，或拿掉那條 Disallow 規則。`,
    };
  }
  if (status === "mismatch") {
    return {
      impact: `你的 robots.txt 明明允許${label}，但實際連線被擋下來了。問題出在 WAF，不是 robots.txt——你以為開著的門，其實是關的，而且從外面看不出來。`,
      technical: `政策層允許，但用該爬蟲的 User-Agent 實測請求被擋。到防火牆設定把這個 User-Agent，或官方公告的來源 IP 段加進白名單。注意進階 WAF 會同時核對來源 IP，我們的探測不是從官方 IP 發出的，這裡只能說「UA 測試被擋」。`,
    };
  }
  return null;
}

// 內容使用授權：三張並排的狀態卡。原本是三列「標籤＋說明＋徽章」的文字，
// 但這一項的重點就是「搜尋索引／AI 引用／AI 訓練是三個獨立的開關」——並排才
// 看得出是三個開關，直排會被讀成一份清單。
function ContentSignalsSection({ signals }: { signals: ContentSignals }) {
  return (
    <div className="mt-8">
      <h2 className="eyebrow mb-3">內容使用授權（Content Signals）</h2>
    <div className="rounded-[10px] border border-line bg-card p-5">
        <p className="mb-4 max-w-[38em] text-sm leading-relaxed text-ink2">
          {signals.declared
            ? "這個網站有表態，分別宣告了內容可以被拿去做什麼："
            : "這個網站三項都還沒表態。這是 Cloudflare 在 2025 年提出、寫在 robots.txt 裡的欄位，可以把下面三件事分開講——想擋訓練但保留 AI 引用，只有它做得到，用 Allow / Disallow 表達不了。"}
        </p>

        {/* 三張並排的狀態卡取代原本三列文字：這一項的重點就是「三件事是
            分開的」，並排才看得出那是三個獨立的開關，直排會讀成一份清單。 */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {signals.items.map((s) => (
            <div key={s.key} className={`rounded-lg border p-3 ${SIGNAL_BADGE[s.value].className}`}>
              <div className="flex items-center gap-1.5">
                <StatusChip glyph={SIGNAL_BADGE[s.value].glyph} color={SIGNAL_BADGE[s.value].color} size={16} />
                <span className="text-[11px] font-semibold">{SIGNAL_BADGE[s.value].text}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{s.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-ink3">{s.meaning}</p>
            </div>
          ))}
        </div>

        {/* 只對「未表態」講影響：有明確表態（不管允許或不允許）都是網站主動
            的立場，不是缺陷，不該去建議別人改立場。 */}
        {signals.items.filter((s) => s.value === "unset").length > 0 && (
          <div className="mt-4">
            <CheckBody
              c={{
                key: "contentSignals",
                level: "",
                category: "",
                item: "內容使用授權",
                status: "warn",
                advice: "",
                impact: `${signals.items
                  .filter((s) => s.value === "unset")
                  .map((s) => s.label)
                  .join("、")}你還沒表態，等於留給各家 AI 引擎自己認定要不要這樣用你的內容。它們認定的方向不一定跟你想的一樣，而且不會通知你。`,
                technical: `在 robots.txt 的 Content-Signal 欄位加上 ${signals.items
                  .filter((s) => s.value === "unset")
                  .map((s) => `${s.key}=yes`)
                  .join(" 或 ")}（要封鎖就寫 =no）就是明確表態。`,
              }}
              withAdvice={false}
            />
          </div>
        )}

        {signals.declared && (
          <p className="mono mt-4 text-xs break-all text-ink3">
            Content-Signal: {signals.raw}
          </p>
        )}
      </div>
    </div>
  );
}

function BotAccessList({ results, origin }: { results: AiBotResult[]; origin?: string }) {
  const [showRules, setShowRules] = useState(false);
  if (results.length === 0) return null;

  const count = (st: BotStatus) => results.filter((r) => r.status === st).length;
  const blocked = results.filter((r) => r.status === "blocked");
  const mismatch = results.filter((r) => r.status === "mismatch");
  const unknown = count("unknown");

  // 一句話結論擺最上面，磚牆是佐證。原本這裡是「結果一致就收合、不一致才展開
  // 逐項」兩套分支——改成磚之後不需要分支了：8 塊全綠本身就是最好的一致性表達，
  // 而且比一句「結果一致」更有說服力（看得到是哪 8 家）。
  const headline =
    blocked.length + mismatch.length === 0
      ? unknown === results.length
        ? `${results.length} 家 AI 爬蟲全部無法判定`
        : `${results.length} 家 AI 爬蟲都讀得到你的網站`
      : `${results.length} 家裡有 ${blocked.length + mismatch.length} 家進不來`;

  // 有問題的才給影響說明，而且依狀態合併成一則，不是每家各講一次同樣的話
  const problems: { status: BotStatus; list: AiBotResult[] }[] = [
    { status: "blocked" as const, list: blocked },
    { status: "mismatch" as const, list: mismatch },
  ].filter((p) => p.list.length > 0);

  return (
    <div className="rounded-[10px] border border-line bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-ink">{headline}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink3">
          {(["allowed", "mismatch", "blocked", "unknown"] as const)
            .filter((st) => count(st) > 0)
            .map((st) => (
              <span key={st} className="flex items-center gap-1.5">
                <StatusChip glyph={BOT_TILE[st].glyph} color={BOT_TILE[st].color} size={13} />
                {BADGE[st].text} {count(st)}
              </span>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {results.map((r) => (
          <div
            key={r.ua}
            title={`${r.ua} · ${r.matchedRule}`}
            className="rounded-lg border border-line bg-paper p-2.5"
          >
            <div className="flex items-center gap-1.5">
              <StatusChip glyph={BOT_TILE[r.status].glyph} color={BOT_TILE[r.status].color} size={16} />
              <span className="truncate text-[11px] font-medium text-ink2">{BADGE[r.status].text}</span>
            </div>
            <p className="mt-1.5 text-xs leading-snug font-medium text-ink">{r.label}</p>
            <p className="mono mt-0.5 truncate text-[10px] text-ink3">{r.ua}</p>
          </div>
        ))}
      </div>

      {problems.map((p) => {
        const names = p.list.length === results.length ? `這 ${results.length} 家 AI 引擎` : p.list.map((r) => r.label).join("、");
        const detail = botAccessImpact(p.status, names);
        if (!detail) return null;
        return (
          <div key={p.status} className="mt-4">
            <CheckBody
              c={{
                key: `bot-${p.status}`,
                level: "",
                category: "",
                item: "AI 爬蟲的存取權限",
                status: p.status === "blocked" ? "fail" : "warn",
                advice: "",
                impact: detail.impact,
                technical: `${p.list.map((r) => `${r.ua}：${r.matchedRule}`).join("；")}。${detail.technical}`,
              }}
              origin={origin}
              withAdvice={false}
            />
          </div>
        );
      })}

      {/* 全部正常時也要給得出「憑什麼這樣判」——判定依據收在這裡，不佔版面 */}
      {problems.length === 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            className="mono text-xs text-ink3 underline decoration-limeDark decoration-2 underline-offset-2 hover:text-ink"
          >
            {showRules ? "收合判定依據" : "判定依據"}
          </button>
          {showRules && (
            <div className="mt-2 space-y-1 rounded-lg border border-line bg-paper p-3">
              {results.map((r) => (
                <p key={r.ua} className="mono text-[11px] leading-relaxed text-ink3">
                  <span className="text-ink2">{r.ua}</span>：{r.matchedRule}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

  // 把所有關鍵字查詢的引用來源彙總成一份「AI 目前的推薦名單」。
  // 純前端計算，資料是已經查回來的 keywordResults，不會多花任何 API 額度。
  const citedDomains = tallyCitedDomains(
    Object.entries(keywordResults).flatMap(([keyword, results]) =>
      results.map((r) => ({ keyword, citations: r.citations })),
    ),
  );
  // Perplexity 一個回答就會帶 20 筆引用，兩個關鍵字查下來動輒四十個網域，
  // 其中絕大多數只出現一次——那是長尾，不是 AI 真的在推的名單。畫面只列前十，
  // 剩下的用一句話帶過就好，不要逼使用者自己從四十行裡找重點。
  const TOP_DOMAINS = 10;
  const topDomains = citedDomains.slice(0, TOP_DOMAINS);
  const restDomainCount = citedDomains.length - topDomains.length;
  // 自己有被引用、但排在前十以外時要單獨補一列出來——不然畫面上既看不到自己、
  // 又不會出現「沒進名單」那句話，等於什麼都沒講。
  const selfRank = citedDomains.findIndex((d) => d.isSelf);
  const selfBelowTop = selfRank >= TOP_DOMAINS ? { rank: selfRank + 1, domain: citedDomains[selfRank] } : null;

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

        {/* Hero：深色、全幅背景。這支影片是拿小積木那張金色底圖去 Kling 的
            image-to-video 生的（Video 3.0、1080p、5s）。

            關鍵是**起始幀跟結束幀放同一張圖**：只給起始幀的話它會單向生成一段，
            末幀跟首幀差很多（實測平均像素差 15.4/255，鏡頭明顯推近了一截），
            循環播放時接點會跳一下。首末幀都給同一張之後差距降到 0.9/255，
            是真的無縫。prompt 也要跟著拿掉「緩慢推進」這種單調鏡頭運動——
            那本質上就不可能首尾呼應。

            編碼時砍掉最後一幀（-frames:v 120）：首末幀幾乎一樣，兩張都留著
            循環時會有 1/24 秒的重複幀，看起來像卡了一下。 */}
        <div className="relative overflow-hidden bg-ink text-paper">
          <video
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover object-[62%_52%] opacity-[.72]"
            poster="/hero-bg.webp"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/hero-bg.webm" type="video/webm" />
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
          {/* 左濃右淡：文字全部靠左，這層把左半邊壓暗保住可讀性，右半邊留給圖本身的光軌。
              原本圖上還疊了兩顆金色 radial glow 墊底（舊影片線條太稀疏會顯得空），新圖
              本身就夠滿，再加就變成一團糊掉的黃霧，拿掉了。 */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, rgba(48,60,84,.95) 0%, rgba(48,60,84,.90) 38%, rgba(48,60,84,.74) 62%, rgba(48,60,84,.26) 100%)",
            }}
          />
          <div className="relative pointer-events-none pb-24 pt-[104px]">
            <div className="mx-auto max-w-[1120px] px-10">
              <div className="eyebrow text-[#a7b1c2]">AI SEARCH VISIBILITY</div>
              <h1 className="mt-5 max-w-[16em] text-[60px] leading-[1.1] tracking-[-0.045em]">
                客戶問 AI 的時候，你在
                <mark className="bg-transparent whitespace-nowrap text-lime">答案裡</mark>嗎？
              </h1>
              <p className="mt-[22px] max-w-[32em] text-[17.5px] text-[#c6cdda]">
                我們用各家 AI 爬蟲的身分實際去讀你的網站，再實際去問 AI 認不認得你的品牌，最後跑一次多頁深度健檢。
              </p>
              <form onSubmit={handleCheck} className="pointer-events-auto mt-9 flex max-w-[560px] gap-2.5">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="輸入網址，例如 example.com"
                  aria-label="網址"
                  className="mono flex-1 rounded-lg border-0 bg-white/[.06] px-3.5 py-2.5 text-sm text-paper shadow-[inset_0_0_0_1px_rgba(255,255,255,.22)] placeholder:text-[#a2acbd] focus:shadow-[inset_0_0_0_2px_var(--lime)] focus:outline-none"
                />
                <button type="submit" disabled={loading} className="btn-lime shrink-0 px-[22px] py-[11px] text-[14.5px]">
                  {loading ? "檢測中…" : "開始檢測"}
                </button>
              </form>
              {/* 11.5px 的細字疊在光軌上，用 #a2acbd 實測只有 4.22:1（量法：把文字層
                  visibility:hidden 後截圖，取這一帶最亮的背景像素）。提亮到 #c6cdda 才過 4.5。 */}
              <p className="mono mt-3.5 text-[11.5px] text-[#c6cdda]">
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
                  <p className="mt-2 max-w-[26em] text-[13.5px] leading-relaxed text-[#a7b1c2]">{s.note}</p>
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
              {/* 小積木 2026-09-11 給的設計稿：長文字改成「圖示＋一句話」；間距數值是他用 tweaks 面板調出來的（靠左、圖示→編號 18px、左右 28px）。 */}
              <dl className="figs figs--steps mt-[30px] grid-cols-3">
                {HOME_STEPS.map((s) => (
                  <div key={s.no}>
                    <s.Icon />
                    <div className="k mt-[18px]">{s.no}</div>
                    <p className="mt-2.5 text-[19px] font-bold tracking-[-0.03em]">{s.title}</p>
                    <p className="mt-2.5 max-w-[22em] text-[13.5px] leading-[1.7] text-ink2">{s.body}</p>
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
                  { src: "/report-screenshot-1.webp", alt: "健檢報告圖：總分 80 分（B 級・良好）、需處理／可優化／正常計數、AI 爬蟲累積讀到的字數曲線" },
                  { src: "/report-screenshot-3.webp", alt: "健檢報告截圖：21 項深度健檢表格，逐項列出狀態、現況、這代表什麼與問題頁面" },
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
                      <div className="mt-2 text-sm text-ink2">
                        <CheckBody
                          c={{
                            key: "waf",
                            level: "",
                            category: "",
                            item: "防火牆把 AI 爬蟲擋在外面",
                            status: "fail",
                            advice: "",
                            impact: engine.wafHint.impact,
                            technical: engine.wafHint.technical,
                          }}
                          origin={engine.origin}
                          withAdvice={false}
                        />
                      </div>
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

            {/* 健檢報告圖：整份報告的入口。原本這上面還有「五分類總覽」（總分環＋
                雷達圖）跟「檢測總覽」（狀態色堆疊長條）兩塊，內容跟報告圖裡的雷達、
                甜甜圈完全重複，同一組數字在同一頁講三次——報告圖本來就是設計來取代
                它們的，所以整個拿掉，不是搬到別的地方。 */}
            <div className="mt-6">
              <ReportBoardSection
                origin={engine.origin}
                engine={engine}
                audit={status?.audit}
                pageWords={status?.pageWords}
                crawledPages={status?.progress.crawled ?? 0}
                keywordPage={
                  Object.keys(keywordResults).length > 0
                    ? { keywords: activeKeywords, results: keywordResults, citedDomains }
                    : null
                }
              />
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

              {citedDomains.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-[17px] font-bold text-ink">這些關鍵字底下，AI 在推誰</h3>
                  <p className="mb-3 mt-1.5 max-w-[34em] text-xs text-ink3">
                    把上面每個回答的引用來源依網域彙總起來，就是 AI 目前的推薦名單，依被引用次數排序。名單裡通常會混進百科、社群、論壇——那是 AI 找資料的地方，不是你的同業；要看的是跟你做同一件事、卻被引用到的那幾個網域。
                  </p>
                  <div className="rounded-[10px] border border-line bg-card p-6">
                    <ol className="space-y-2.5">
                      {topDomains.map((d, i) => (
                        <li key={d.domain} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="mono w-5 shrink-0 text-right text-xs text-ink3">{i + 1}</span>
                          <a href={d.sampleUrl} target="_blank" rel="noopener noreferrer" className="mono break-all text-sm">
                            {d.domain}
                          </a>
                          {d.isSelf && (
                            <span className="rounded-full border border-lime px-2 py-0.5 text-[11px] font-semibold text-ink">
                              你的網站
                            </span>
                          )}
                          <span className="mono text-xs text-ink3">{d.count} 次</span>
                          <span className="text-xs text-ink3">
                            {d.keywords.map((k) => `「${k}」`).join("")}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {selfBelowTop && (
                      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-t border-line pt-3">
                        <span className="mono w-5 shrink-0 text-right text-xs text-ink3">{selfBelowTop.rank}</span>
                        <a
                          href={selfBelowTop.domain.sampleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono break-all text-sm"
                        >
                          {selfBelowTop.domain.domain}
                        </a>
                        <span className="rounded-full border border-lime px-2 py-0.5 text-[11px] font-semibold text-ink">
                          你的網站
                        </span>
                        <span className="mono text-xs text-ink3">{selfBelowTop.domain.count} 次</span>
                        <span className="text-xs text-ink3">
                          {selfBelowTop.domain.keywords.map((k) => `「${k}」`).join("")}
                        </span>
                      </div>
                    )}
                    {restDomainCount > 0 && (
                      <p className="mt-3 text-xs text-ink3">
                        另外還有 {restDomainCount} 個網域被引用過，多半只出現一次，屬於長尾，這裡不列。
                      </p>
                    )}
                    {!citedDomains.some((d) => d.isSelf) && (
                      <p className="mt-4 border-t border-line pt-3 text-sm text-ink2">
                        你的網站沒有出現在這份名單裡。AI 現在拿來當答案的是上面那些網域。
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {engine.visibility && (
              <div className="mt-6">
                <h2 className="eyebrow mb-3">AI 眼中的你</h2>
                <div className={`rounded-[10px] border p-6 ${VISIBILITY[engine.visibility.status].className}`}>
                  <p className="text-lg font-bold text-ink">{VISIBILITY[engine.visibility.status].label}</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-ink">{engine.visibility.summary}</p>
                  <ContentMixBar
                    total={engine.visibility.textLength}
                    substantive={engine.visibility.substantiveChars}
                    furniture={engine.visibility.furnitureChars}
                  />

                  <div className="mt-4 rounded-lg border border-line bg-paper p-4">
                    <p className="text-xs font-medium text-ink3">AI 從這幾項判斷你網站是做什麼的：</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {engine.visibility.title || "（沒有寫標題）"}
                    </p>
                    {engine.visibility.description ? (
                      <p className="mt-1 text-sm leading-relaxed text-ink2">{engine.visibility.description}</p>
                    ) : (
                      <p className="mt-1 text-sm text-warn">
                        （這頁沒有寫摘要，AI 只能自己從標題和正文猜你這頁在講什麼）
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

                </div>
              </div>
            )}

            {engine.visibilityNote && <p className="mt-4 text-center text-sm text-ink3">{engine.visibilityNote}</p>}

            {status?.audit && status.schemaCards && (
              <SchemaSection audit={status.audit} schemaCards={status.schemaCards} origin={engine.origin} />
            )}

            <h2 className="eyebrow mt-8 mb-3">各家 AI 爬蟲的存取權限</h2>
            <BotAccessList results={engine.results} origin={engine.origin} />

            {engine.contentSignals && <ContentSignalsSection signals={engine.contentSignals} />}

            {engine.llmsTxt.exists !== null && <LlmsTxtCard llmsTxt={engine.llmsTxt} />}

            {/* 深度健檢：多頁爬蟲＋規則＋AI 語意判斷。這個區塊外層已經整包包在
                status.status === "completed" 底下，跑到這裡 status.audit 一定有值——
                進行中的畫面統一由最外層那張進度卡負責，這裡不用再重複一份。
                上面那張分佈圖講的就是這張表的組成，貼著放才是圖文對照。 */}
            {status?.audit && (
              <RbSoloCard className="mt-10 print:hidden">
                <RbCheckDistribution cats={buildCategories5(engine, status.audit)} />
              </RbSoloCard>
            )}
            <div className="mt-6">
              {status?.audit && (
                <AuditTable
                  checks={status.audit.filter((c) => c.key !== "schema" && c.key !== "localbiz")}
                  origin={engine.origin}
                />
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
