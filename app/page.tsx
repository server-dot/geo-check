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

interface GeoResult {
  origin: string;
  robotsUrl: string;
  robotsStatus: "found" | "none" | "unreachable";
  robotsNote: string;
  results: AiBotResult[];
  visibility: ContentVisibility | null;
  visibilityNote: string;
  contentSignals: ContentSignals | null;
  hasLlmsTxt: boolean | null;
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

export default function GeoPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeoResult | null>(null);

  async function handleCheck(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "檢測失敗");
      setResult(data as GeoResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "檢測失敗");
    } finally {
      setLoading(false);
    }
  }

  const blockedCount = result?.results.filter((r) => r.status === "blocked").length ?? 0;
  const unknownCount = result?.results.filter((r) => r.status === "unknown").length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          AI 搜尋能見度健檢
        </h1>
        <p className="mt-3 text-center text-gray-500">
          檢測你的網站對 ChatGPT、Claude、Perplexity 等 AI 搜尋引擎是否開放
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

        {error && (
          <p className="mt-4 text-center text-red-600">{error}</p>
        )}

        {result && (
          <div className="mt-10">
            {/* 判定不出來時必須明講。給假綠燈比不給答案傷害更大——
                使用者會以為自己沒問題而什麼都不做。 */}
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
                  <p>{result.robotsNote}</p>
                  <p>
                    這<strong>不代表</strong>你的網站對 AI 開放——很可能有 robots.txt
                    但我們讀不到。請直接在瀏覽器打開{" "}
                    <a
                      href={result.robotsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline underline-offset-2"
                    >
                      {result.robotsUrl}
                    </a>{" "}
                    人工確認。
                  </p>
                </div>
              )}

              {result.robotsStatus === "none" && (
                <p className="mt-2 text-sm text-gray-500">
                  （這個網站沒有 robots.txt，依規範預設所有爬蟲都能存取）
                </p>
              )}

              {result.robotsStatus === "found" && (
                <p className="mt-2 text-xs text-gray-400">
                  規則來源：{result.robotsUrl}
                </p>
              )}
            </div>

            {/* robots.txt 只回答「AI 能不能進來」，這一段回答「AI 進來之後讀到什麼」。
                兩者是分開的問題：robots 全開但頁面靠 JS 渲染，AI 一樣什麼都拿不到。 */}
            {result.visibility && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-gray-500">
                  AI 眼中的你
                </h2>
                <div className={`rounded-xl border p-6 ${VISIBILITY[result.visibility.status].className}`}>
                  <p className="text-lg font-bold text-gray-900">
                    {VISIBILITY[result.visibility.status].label}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {result.visibility.advice}
                  </p>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500">
                      AI 爬蟲實際讀到的內容開頭：
                    </p>
                    <div className="mt-1 rounded-lg border border-gray-200 bg-white/70 p-3 font-mono text-xs leading-relaxed break-all text-gray-700">
                      {result.visibility.preview || "（完全沒有可讀的文字）"}
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-gray-500">可讀字數</dt>
                      <dd className="font-medium text-gray-900">{result.visibility.textLength}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">標題</dt>
                      <dd className="font-medium text-gray-900">{result.visibility.title || "（缺）"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">H1</dt>
                      <dd className="font-medium text-gray-900">
                        {result.visibility.h1.length > 0 ? result.visibility.h1.join("、") : "（缺）"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">結構化資料</dt>
                      <dd className="font-medium text-gray-900">
                        {result.visibility.jsonLdTypes.length > 0
                          ? result.visibility.jsonLdTypes.join("、")
                          : "（無）"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {result.visibilityNote && (
              <p className="mt-4 text-center text-sm text-gray-400">{result.visibilityNote}</p>
            )}

            <h2 className="mt-8 mb-3 text-sm font-semibold text-gray-500">
              各家 AI 爬蟲的存取權限
            </h2>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {result.results.map((r) => (
                <div key={r.ua} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{r.label}</p>
                    <p className="text-xs text-gray-400">{r.ua} · {r.matchedRule}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${BADGE[r.status].className}`}
                  >
                    {BADGE[r.status].text}
                  </span>
                </div>
              ))}
            </div>

            {/* Allow/Disallow 只管「能不能抓」，Content Signals 管「抓走以後可以拿來幹嘛」。
                爬蟲進得來不代表你同意它拿去訓練模型——這是兩個不同的問題。 */}
            {result.contentSignals && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-gray-500">
                  內容使用授權（Content Signals）
                </h2>
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  {result.contentSignals.declared ? (
                    <>
                      <p className="text-sm text-gray-600">
                        這個網站有表態，宣告內容可以被拿去做什麼用途：
                      </p>
                      <div className="mt-4 space-y-3">
                        {result.contentSignals.items.map((s) => (
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
                        Content-Signal: {result.contentSignals.raw}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-gray-600">
                      這個網站還沒有宣告 Content Signals。這是 Cloudflare 在 2025 年提出、
                      寫在 robots.txt 裡的新欄位，可以分別表明你的內容
                      <strong>能不能被搜尋索引、能不能當 AI 回答的來源、能不能拿去訓練模型</strong>
                      ——這三件事是分開的。想擋訓練但保留 AI 引用，就得靠它，光用 Allow / Disallow 表達不了。
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* llms.txt：放在根目錄、專門給 AI 看的網站導覽 */}
            {result.hasLlmsTxt !== null && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
                <div>
                  <p className="font-medium text-gray-900">llms.txt</p>
                  <p className="text-xs text-gray-400">
                    {result.hasLlmsTxt
                      ? "已部署，AI 有一份你親自寫的網站導覽可以參考"
                      : "尚未部署。這是給 AI 讀的網站地圖，能主動告訴 AI 你有哪些重要內容"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${
                    result.hasLlmsTxt
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {result.hasLlmsTxt ? "有" : "沒有"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
