"use client";

import { useState } from "react";

interface AiBotResult {
  ua: string;
  label: string;
  allowed: boolean;
  matchedRule: string;
}

interface GeoResult {
  origin: string;
  robotsExists: boolean;
  results: AiBotResult[];
}

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

  const blockedCount = result?.results.filter((r) => !r.allowed).length ?? 0;

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
            <div
              className={`rounded-xl border p-6 text-center ${
                blockedCount === 0
                  ? "border-green-200 bg-green-50"
                  : blockedCount >= 4
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
              }`}
            >
              <p className="text-2xl font-bold">
                {blockedCount === 0
                  ? "🟢 AI 引擎都能存取你的網站"
                  : blockedCount >= 4
                    ? "🔴 主要 AI 引擎被擋住了"
                    : `🟡 有 ${blockedCount} 個 AI 引擎被擋住`}
              </p>
              {!result.robotsExists && (
                <p className="mt-2 text-sm text-gray-500">
                  （這個網站沒有 robots.txt，預設所有爬蟲都能存取）
                </p>
              )}
            </div>

            <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {result.results.map((r) => (
                <div key={r.ua} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{r.label}</p>
                    <p className="text-xs text-gray-400">{r.ua} · {r.matchedRule}</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-medium ${
                      r.allowed
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {r.allowed ? "可存取" : "被擋"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
