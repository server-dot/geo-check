"use client";

import { useState } from "react";

type BotStatus = "allowed" | "blocked" | "unknown";

interface AiBotResult {
  ua: string;
  label: string;
  status: BotStatus;
  matchedRule: string;
}

type VisibilityStatus = "ok" | "thin" | "empty";

interface ContentVisibility {
  status: VisibilityStatus;
  textLength: number;
  htmlLength: number;
  scriptCount: number;
  preview: string;
  title: string;
  description: string;
  h1: string[];
  jsonLdTypes: string[];
  advice: string;
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
  hasLlmsTxt: boolean | null;
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
};

const CHECK_UI: Record<CheckStatus, { badge: string; text: string }> = {
  ok: { badge: "bg-green-50 text-green-700 border-green-200", text: "正常" },
  warn: { badge: "bg-amber-50 text-amber-700 border-amber-200", text: "可優化" },
  fail: { badge: "bg-red-50 text-red-700 border-red-200", text: "需處理" },
};

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
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
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

export default function GeoPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusResponse | null>(null);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-center text-3xl font-bold text-gray-900">AI 搜尋能見度健檢</h1>
        <p className="mt-3 text-center text-gray-500">
          檢測你的網站對 ChatGPT、Claude、Perplexity 等 AI 搜尋引擎是否開放，並跑一次多頁深度健檢
        </p>

        <form onSubmit={handleCheck} className="mt-8 flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="輸入網址，例如 example.com"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "檢測中…" : "開始檢測"}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-red-600">{error}</p>}

        {engine && (
          <div className="mt-10">
            {/* 判定不出來時必須明講。給假綠燈比不給答案傷害更大 */}
            <div
              className={`rounded-xl border p-6 text-center ${
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

            {engine.visibility && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-gray-500">AI 眼中的你</h2>
                <div className={`rounded-xl border p-6 ${VISIBILITY[engine.visibility.status].className}`}>
                  <p className="text-lg font-bold text-gray-900">{VISIBILITY[engine.visibility.status].label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{engine.visibility.advice}</p>
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500">AI 爬蟲實際讀到的內容開頭：</p>
                    <div className="mt-1 rounded-lg border border-gray-200 bg-white/70 p-3 font-mono text-xs leading-relaxed break-all text-gray-700">
                      {engine.visibility.preview || "（完全沒有可讀的文字）"}
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-gray-500">可讀字數</dt>
                      <dd className="font-medium text-gray-900">{engine.visibility.textLength}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">標題</dt>
                      <dd className="font-medium text-gray-900">{engine.visibility.title || "（缺）"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">H1</dt>
                      <dd className="font-medium text-gray-900">
                        {engine.visibility.h1.length > 0 ? engine.visibility.h1.join("、") : "（缺）"}
                      </dd>
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
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {engine.results.map((r) => (
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

            {engine.contentSignals && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-gray-500">內容使用授權（Content Signals）</h2>
                <div className="rounded-xl border border-gray-200 bg-white p-5">
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

            {engine.hasLlmsTxt !== null && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
                <div>
                  <p className="font-medium text-gray-900">llms.txt</p>
                  <p className="text-xs text-gray-400">
                    {engine.hasLlmsTxt
                      ? "已部署，AI 有一份你親自寫的網站導覽可以參考"
                      : "尚未部署。這是給 AI 讀的網站地圖，能主動告訴 AI 你有哪些重要內容"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${
                    engine.hasLlmsTxt
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {engine.hasLlmsTxt ? "有" : "沒有"}
                </span>
              </div>
            )}

            {/* 深度健檢：多頁爬蟲＋規則＋AI 語意判斷，跑得比上面慢，進度誠實顯示 */}
            <div className="mt-10">
              {status && (status.status === "crawling" || status.status === "analyzing") && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4">
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
