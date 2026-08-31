"use client";

import { useState } from "react";

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
  yes: { text: "允許", className: "border-green-200 bg-green-50 text-green-700" },
  no: { text: "不允許", className: "border-red-200 bg-red-50 text-red-700" },
  unset: { text: "未表態", className: "border-gray-200 bg-gray-50 text-gray-500" },
};

const VISIBILITY: Record<VisibilityStatus, { label: string; className: string }> = {
  ok: { label: "🟢 AI 讀得到你的內容", className: "border-green-200 bg-green-50" },
  thin: { label: "🟡 AI 讀到的內容偏少", className: "border-amber-200 bg-amber-50" },
  empty: { label: "🔴 AI 讀到的是一片空白", className: "border-red-200 bg-red-50" },
};

const BADGE: Record<BotStatus, { text: string; className: string }> = {
  allowed: { text: "可存取", className: "border-green-200 bg-green-50 text-green-700" },
  blocked: { text: "被擋", className: "border-red-200 bg-red-50 text-red-700" },
  unknown: { text: "無法判定", className: "border-gray-200 bg-gray-50 text-gray-500" },
  mismatch: { text: "政策允許但實測被擋", className: "border-orange-200 bg-orange-50 text-orange-700" },
};

const CHECK_UI: Record<CheckStatus, { badge: string; text: string }> = {
  ok: { badge: "bg-green-50 text-green-700 border-green-200", text: "正常" },
  warn: { badge: "bg-amber-50 text-amber-700 border-amber-200", text: "可優化" },
  fail: { badge: "bg-red-50 text-red-700 border-red-200", text: "需處理" },
};

// 狀態色（dataviz 技能的固定 status palette，不跟著品牌色跑）
const STATUS_COLOR = { ok: "#0ca30c", warn: "#fab219", fail: "#d03b3b" } as const;
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

// 分類總覽：橫向堆疊長條，狀態色（不是分類色）。取代雷達圖——
// 雷達圖的面積會失真，這裡改用有驗證過的形式做同樣的事：一眼看出哪個分類弱。
function CategoryOverview({ rows }: { rows: CategoryRow[] }) {
  const visible = rows.filter((r) => r.ok + r.warn + r.fail > 0);
  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500">檢測總覽</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
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
              <p className="w-28 shrink-0 truncate text-xs text-gray-600" title={row.name}>
                {row.name}
              </p>
              <div className="flex h-4 flex-1 gap-[2px] overflow-hidden rounded-r bg-white">
                {segs.map(
                  (s) =>
                    s.count > 0 && (
                      <div
                        key={s.status}
                        tabIndex={0}
                        title={`${row.name} · ${STATUS_LABEL[s.status]} ${s.count} 項`}
                        className="h-full outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        style={{ width: `${(s.count / total) * 100}%`, backgroundColor: STATUS_COLOR[s.status] }}
                      />
                    ),
                )}
              </div>
              <p className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-400">{total} 項</p>
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
        className="text-xs text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
      >
        查看更多（{details.length} 頁）
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <p className="text-sm font-semibold text-gray-800">
                {title}
                <span className="ml-2 text-xs font-normal text-gray-400">{details.length} 個問題頁面</span>
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-1 text-lg leading-none text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="divide-y divide-gray-50 overflow-y-auto overflow-x-hidden px-5 py-2">
              {details.map((d, i) => (
                <div key={i} className="flex gap-3 py-2.5 text-xs leading-relaxed">
                  <span className="w-6 shrink-0 text-right tabular-nums text-gray-300">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all font-mono text-blue-600 hover:underline"
                      title={d.url}
                    >
                      {urlToPath(d.url)}
                    </a>
                    <p className="mt-0.5 break-all text-gray-400">{d.note}</p>
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500">深度健檢（{checks.length} 項）</h2>
        <div className="flex gap-3 text-xs">
          <span className="text-red-600">需處理 {sc.fail}</span>
          <span className="text-amber-600">可優化 {sc.warn}</span>
          <span className="text-green-600">正常 {sc.ok}</span>
        </div>
      </div>
      {[...groups.entries()].map(([category, rows]) => (
        <div key={category} className="mb-4">
          <p className="mb-1.5 text-xs font-semibold text-gray-400">{category}</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {rows.map((c) => {
                  const ui = CHECK_UI[c.status];
                  return (
                    <tr key={c.key} className="border-t border-gray-100 align-top first:border-t-0">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}>{ui.text}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-800">{c.item}</td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {c.advice}
                        {c.evidence && <div className="mt-1 break-all text-xs text-gray-400">{c.evidence}</div>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {c.details && c.details.length > 0 ? (
                          <DetailsToggle title={c.item} details={c.details} />
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-700">
            {results.length} 個 AI 爬蟲的結果一致：
            <span className={`ml-2 rounded-full border px-3 py-1 text-sm font-medium ${BADGE[status].className}`}>
              {BADGE[status].text}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-xs text-blue-600 hover:underline"
          >
            {expanded ? "收合" : "這是哪幾個爬蟲？"}
          </button>
        </div>
        {expanded && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            {results.map((r) => (
              <span
                key={r.ua}
                title={`${r.ua} · ${r.matchedRule}`}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600"
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
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
      {results.map((r) => (
        <div key={r.ua} className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="font-medium text-gray-900">{r.label}</p>
            <p className="text-xs text-gray-400">
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
    <div
      className={`rounded-xl border p-6 shadow-sm ${
        result.citedSelf ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{result.engine}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">
        {result.citedSelf ? "🟢 引用了你自己的網站" : "🟡 沒有引用你自己的網站"}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{result.advice}</p>

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-500">我們實際問的問題：</p>
        <p className="mt-1 text-sm text-gray-800">「{result.query}」</p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-500">{result.engine} 的實際回答：</p>
        <div className="mt-1 rounded-lg border border-gray-200 bg-white/70 p-3 text-sm leading-relaxed text-gray-700">
          {renderAnswerMarkdown(result.answer, result.citations)}
        </div>
      </div>

      {result.citations.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500">引用來源：</p>
          <ul className="mt-1 space-y-1">
            {result.citations.map((c, i) => (
              <li key={i} className="text-xs">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`break-all underline underline-offset-2 ${
                    c.isSelf ? "font-medium text-green-700" : "text-blue-600"
                  }`}
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
    <div className="mt-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium text-gray-900">llms.txt</p>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${
            llmsTxt.exists && quality?.status === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {!llmsTxt.exists ? "沒有" : quality?.status === "ok" ? "格式完整" : "內容單薄"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        {llmsTxt.exists
          ? quality?.advice
          : "尚未部署。這是給 AI 讀的網站地圖，能主動告訴 AI 你有哪些重要內容。"}
      </p>

      {quality && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            {expanded ? "收合" : `看實際內容（${quality.links.length} 個連結）`}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <div>
                <p className="text-xs font-medium text-gray-500"># 標題</p>
                <p className="mt-0.5 text-sm text-gray-800">{quality.title || "（缺）"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">摘要引言</p>
                <p className="mt-0.5 text-sm text-gray-800">{quality.summary || "（缺）"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">頁面連結（{quality.links.length} 個，共 {quality.charCount} 字）</p>
                <div className="mt-1 max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                  {quality.links.map((l, i) => (
                    <div key={i} className="text-xs">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {l.text}
                      </a>
                      <p className="text-gray-500">{l.description || "（沒有附說明）"}</p>
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
  const blockedCount = engine?.results.filter((r) => r.status === "blocked").length ?? 0;
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-center text-xs font-semibold tracking-wide text-blue-600 uppercase">
          AI Search Visibility
        </p>
        <h1 className="mt-2 text-center text-3xl font-bold text-gray-900">AI 搜尋能見度健檢</h1>
        <p className="mt-3 text-center text-gray-500">
          檢測你的網站對 ChatGPT、Claude、Perplexity 等 AI 搜尋引擎是否開放，並跑一次多頁深度健檢
        </p>

        <form onSubmit={handleCheck} className="mt-8 flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="輸入網址，例如 example.com"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "檢測中…" : "開始檢測"}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-red-600">{error}</p>}

        {engine && (
          <div className="mt-10">
            {/* 判定不出來時必須明講。給假綠燈比不給答案傷害更大 */}
            <div
              className={`rounded-xl border p-6 text-center shadow-sm ${
                unknownCount > 0
                  ? "border-gray-300 bg-gray-50"
                  : blockedCount === 0
                    ? "border-green-200 bg-green-50"
                    : blockedCount >= 4
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
              }`}
            >
              <p className="text-2xl font-bold text-gray-900">
                {unknownCount > 0
                  ? "⚪ 無法判定"
                  : blockedCount === 0
                    ? "🟢 AI 引擎都能存取你的網站"
                    : blockedCount >= 4
                      ? "🔴 主要 AI 引擎被擋住了"
                      : `🟡 有 ${blockedCount} 個 AI 引擎被擋住`}
              </p>

              {unknownCount > 0 && (
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <p>{engine.robotsNote}</p>
                  <p>
                    這<strong>不代表</strong>你的網站對 AI 開放——很可能有 robots.txt
                    但我們讀不到。請直接在瀏覽器打開{" "}
                    <a
                      href={engine.robotsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline underline-offset-2"
                    >
                      {engine.robotsUrl}
                    </a>{" "}
                    人工確認。
                  </p>
                  {engine.wafHint && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white/70 p-3 text-left">
                      <p className="text-xs font-semibold text-gray-500">
                        偵測到可能的原因：{engine.wafHint.vendor}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">{engine.wafHint.advice}</p>
                    </div>
                  )}
                </div>
              )}

              {engine.robotsStatus === "none" && (
                <p className="mt-2 text-sm text-gray-500">
                  （這個網站沒有 robots.txt，依規範預設所有爬蟲都能存取）
                </p>
              )}
              {engine.robotsStatus === "found" && (
                <p className="mt-2 text-xs text-gray-400">規則來源：{engine.robotsUrl}</p>
              )}
            </div>

            <div className="mt-6">
              <CategoryOverview rows={buildCategoryRows(engine, status?.audit)} />
            </div>

            {engine.brandVisibility.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-gray-500">AI 認不認得你？（實際去問）</h2>
                <div className="space-y-4">
                  {engine.brandVisibility.map((r) => (
                    <BrandVisibilityCard key={r.engine} result={r} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h2 className="mb-1 text-sm font-semibold text-gray-500">
                關鍵字 AI 能見度（你想搶的主題，AI 推薦名單裡有你嗎？）
              </h2>
              <p className="mb-3 text-xs text-gray-400">
                上面看的是「AI 知不知道你」；這裡看的是「有人拿某個主題去問 AI，AI 會不會推薦到你」——這才是大部分人真正在意的問題。以下是從標題／描述自動抓的候選字，可以刪掉不要的，或自己加。
              </p>
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {activeKeywords.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-800"
                    >
                      {k}
                      <button
                        type="button"
                        onClick={() => removeKeyword(k)}
                        className="text-blue-400 hover:text-blue-700"
                        aria-label={`移除 ${k}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {activeKeywords.length === 0 && (
                    <span className="text-sm text-gray-400">（沒有抓到候選關鍵字，自己加一個試試）</span>
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
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addCustomKeyword}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    新增
                  </button>
                  <button
                    type="button"
                    onClick={runKeywordCheck}
                    disabled={keywordLoading || activeKeywords.length === 0}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {keywordLoading ? "查詢中…" : `查詢（${activeKeywords.length} 個關鍵字 × 2 引擎）`}
                  </button>
                </div>
                {keywordError && <p className="mt-2 text-sm text-red-600">{keywordError}</p>}
              </div>

              {Object.keys(keywordResults).length > 0 && (
                <div className="mt-4 space-y-6">
                  {activeKeywords
                    .filter((k) => keywordResults[k])
                    .map((k) => (
                      <div key={k}>
                        <p className="mb-2 text-sm font-semibold text-gray-700">「{k}」</p>
                        <div className="space-y-3">
                          {keywordResults[k].length === 0 ? (
                            <p className="text-sm text-gray-400">
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
                <h2 className="mb-3 text-sm font-semibold text-gray-500">AI 眼中的你</h2>
                <div className={`rounded-xl border p-6 shadow-sm ${VISIBILITY[engine.visibility.status].className}`}>
                  <p className="text-lg font-bold text-gray-900">{VISIBILITY[engine.visibility.status].label}</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-gray-800">{engine.visibility.summary}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    共 {engine.visibility.textLength} 字：正文約 {engine.visibility.substantiveChars} 字、選單／標籤約{" "}
                    {engine.visibility.furnitureChars} 字
                    {engine.visibility.textLength > 0
                      ? `（占 ${Math.round((engine.visibility.furnitureChars / engine.visibility.textLength) * 100)}%）`
                      : ""}
                  </p>

                  <div className="mt-4 rounded-lg border border-gray-200 bg-white/70 p-4">
                    <p className="text-xs font-medium text-gray-500">AI 從這幾項判斷你網站是做什麼的：</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {engine.visibility.title || "（沒有寫標題）"}
                    </p>
                    {engine.visibility.description ? (
                      <p className="mt-1 text-sm leading-relaxed text-gray-600">{engine.visibility.description}</p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700">
                        （沒有寫 meta description，AI 只能自己從標題和正文猜，建議補上一段簡短描述）
                      </p>
                    )}
                    {engine.visibility.h1.length > 0 && (
                      <p className="mt-2 text-xs text-gray-400">H1：{engine.visibility.h1.join("、")}</p>
                    )}
                    {engine.visibility.leadParagraphs.length > 0 && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-xs text-gray-400">頁面內容摘錄：</p>
                        <div className="mt-1 space-y-2">
                          {engine.visibility.leadParagraphs.map((p, i) => (
                            <p key={i} className="text-sm leading-relaxed text-gray-700">
                              {p}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {engine.visibility.duplicateBlockChars > 0 && (
                    <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
                      ⚠️ 已排除約 {engine.visibility.duplicateBlockChars} 字的重複內容區塊（可能是跑馬燈效果），建議加上{" "}
                      <code className="rounded bg-amber-100 px-1 py-0.5">aria-hidden=&quot;true&quot;</code>。
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowRawContent((v) => !v)}
                    className="mt-3 text-xs text-blue-600 underline underline-offset-2"
                  >
                    {showRawContent ? "收起" : "查看"} AI 實際讀到的原始文字片段（技術細節，一般不用看）
                  </button>
                  {showRawContent &&
                    (() => {
                      const blocks = engine.visibility.previewBlocks;
                      return (
                        <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-white/70 p-4">
                          {blocks.length === 0 && <p className="text-sm text-gray-500">（完全沒有可讀的文字）</p>}
                          {blocks.map((block, i) =>
                            block.kind === "tags" ? (
                              <p key={i} className="border-l-2 border-gray-200 pl-2 text-xs leading-relaxed text-gray-400">
                                {block.items.join("、")}
                              </p>
                            ) : (
                              <p key={i} className="text-sm leading-relaxed text-gray-700">
                                {block.text}
                              </p>
                            )
                          )}
                        </div>
                      );
                    })()}

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-gray-500">可讀字數</dt>
                      <dd className="font-medium text-gray-900">{engine.visibility.textLength}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">結構化資料</dt>
                      <dd className="font-medium text-gray-900">
                        {engine.visibility.jsonLdTypes.length > 0 ? engine.visibility.jsonLdTypes.join("、") : "（無）"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {engine.visibilityNote && <p className="mt-4 text-center text-sm text-gray-400">{engine.visibilityNote}</p>}

            <h2 className="mt-8 mb-3 text-sm font-semibold text-gray-500">各家 AI 爬蟲的存取權限</h2>
            <BotAccessList results={engine.results} />

            {engine.contentSignals && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-gray-500">內容使用授權（Content Signals）</h2>
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  {engine.contentSignals.declared ? (
                    <>
                      <p className="text-sm text-gray-600">這個網站有表態，宣告內容可以被拿去做什麼用途：</p>
                      <div className="mt-4 space-y-3">
                        {engine.contentSignals.items.map((s) => (
                          <div key={s.key} className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{s.label}</p>
                              <p className="text-xs text-gray-400">{s.meaning}</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${SIGNAL_BADGE[s.value].className}`}
                            >
                              {SIGNAL_BADGE[s.value].text}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 font-mono text-xs break-all text-gray-400">
                        Content-Signal: {engine.contentSignals.raw}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-gray-600">
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
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4 shadow-sm">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                  <p className="text-sm text-blue-800">{status.message}</p>
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
