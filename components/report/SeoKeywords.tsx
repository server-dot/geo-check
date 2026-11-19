"use client";

// ── SEO 健檢：關鍵字排名＋為什麼排不上去 ─────────────────────
// 11-18 小積木：「目前 SEO 還是很陽春」。照 GEO 的流程：自己填 ≤3 個關鍵字 → Google 第一頁 →
// 你排第幾、前 10 名是誰 → 你最接近的頁跟前 3 名同業比，這頁具體要補什麼（lib/seo-keyword-rank.ts）。
// 第一眼：關鍵字＋名次；前 10 名一行一家；建議用條列，依據小字放後面（11-21 報告太多字）。

import { useEffect, useState } from "react";
import type { KeywordCandidate, KeywordRank } from "@/lib/seo-keyword-rank";

const MAX = 3;

// 11-18 小積木看第一版：「我要怎讀？」——兩欄等重、十名清單和五點建議全攤開，不知道先看哪。
// 改成固定的閱讀順序：最上面一張總表（每個關鍵字一行：排名＋一句話）→ 每個關鍵字一張卡，
// 第一眼只有「為什麼」一句＋「先補這段」一點＋建議標題；其他建議、第一頁 10 個結果收進展開（11-21 報告太多字）。
const rankText = (r: KeywordRank) => (r.selfRank ? `第 ${r.selfRank} 名` : "第一頁沒有你");

function Summary({ rows }: { rows: KeywordRank[] }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
      <table className="w-full text-[15px]">
        <thead className="bg-inset/60 text-[13px] text-ink3">
          <tr>
            <th className="px-4 py-2 text-left font-normal">關鍵字</th>
            <th className="px-4 py-2 text-left font-normal">你的排名</th>
            <th className="hidden px-4 py-2 text-left font-normal md:table-cell">差在哪</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.keyword} className="border-t border-line align-top">
              <td className="px-4 py-2.5 font-medium text-ink">
                <a href={`#kw-${encodeURIComponent(r.keyword)}`} className="report-table-link">
                  {r.keyword}
                </a>
              </td>
              <td className={`whitespace-nowrap px-4 py-2.5 font-bold ${r.selfRank ? "text-[var(--goldInk)]" : "text-ink2"}`}>{rankText(r)}</td>
              <td className="hidden px-4 py-2.5 text-ink2 md:table-cell">{r.verdict || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Result({ r }: { r: KeywordRank }) {
  const [first, ...rest] = r.todos;
  const rivalNames = r.rivals.map((p) => new URL(p.url).hostname.replace(/^www\./, ""));
  return (
    <div id={`kw-${encodeURIComponent(r.keyword)}`} className="scroll-mt-4 rounded-[10px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[17px] font-bold text-ink">{r.keyword}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${r.selfRank ? "bg-lime text-ink" : "border border-line bg-inset text-ink2"}`}>{rankText(r)}</span>
      </div>

      {r.verdict ? (
        <>
          <p className="mt-3 text-[16px] font-medium leading-relaxed text-ink">{r.verdict}</p>
          {r.selfPage && rivalNames.length > 0 && (
            <p className="mt-1 text-[13px] text-ink3">
              比的是你的
              <a href={r.selfPage.url} target="_blank" rel="noopener noreferrer" className="report-table-link mx-1">
                {r.selfPage.title.split(/[｜|]/)[0].trim() || "網頁"}
              </a>
              和排在前面的 {rivalNames.join("、")}
            </p>
          )}

          {first && (
            <div className="mt-4 rounded-lg border border-lime/60 bg-lime/[.08] px-4 py-3">
              <p className="text-[13px] font-semibold text-[var(--goldInk)]">先補這段</p>
              <p className="mt-0.5 text-[15px] leading-relaxed text-ink">{first.what}</p>
            </div>
          )}
          {r.titleSuggestion && (
            <p className="mt-3 text-[15px]">
              <span className="text-ink3">網頁標題（Google 結果上那行藍字）改成：</span>
              <span className="font-medium text-ink">{r.titleSuggestion}</span>
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-[15px] text-ink3">排在前面的大多是討論區、社群或平台，沒有同行的網站可以比，這次不給建議。</p>
      )}

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        {rest.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[14px] font-medium text-ink2">還可以補的 {rest.length} 點</summary>
            <ul className="mt-2 space-y-2 pl-1">
              {rest.map((t) => (
                <li key={t.what} className="text-[15px] leading-relaxed text-ink">
                  • {t.what}
                  {t.basis && <span className="block pl-3 text-[13px] text-ink3">為什麼：{t.basis}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-[14px] font-medium text-ink2">Google 第一頁是誰</summary>
          <ol className="mt-2 space-y-1 text-[14px]">
            {r.top.map((t) => (
              <li key={t.rank} className={`flex gap-2 rounded px-1.5 py-0.5 ${t.isSelf ? "bg-lime/20" : ""}`}>
                <span className="w-[1.4em] shrink-0 text-right tabular-nums text-ink3">{t.rank}</span>
                <span className="min-w-0 flex-1 truncate">
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className={`report-table-link ${t.isSelf ? "font-bold" : ""}`} title={t.title}>
                    {t.domain}
                  </a>
                  <span className="ml-1.5 text-ink3">{t.title}</span>
                </span>
                {t.isPlatform && <span className="shrink-0 text-[12px] text-ink3">討論區／平台</span>}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}

export function SeoKeywords({ jobId, initial, onDone }: { jobId: string | null; initial?: KeywordRank[] | null; onDone?: (r: KeywordRank[]) => void }) {
  const [results, setResults] = useState<KeywordRank[] | null>(initial ?? null);
  const [cands, setCands] = useState<KeywordCandidate[] | null>(null);
  const [picked, setPicked] = useState<string[]>(initial?.map((r) => r.keyword) ?? []);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 候選字：網站讀完由 AI 列，小白不用自己想（11-18「我的客戶是小白，哪有關鍵字的概念」）；預設勾前 3 個
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    fetch(`/api/seo/keywords?jobId=${encodeURIComponent(jobId)}`)
      .then((r) => r.json())
      .then((d: { candidates?: KeywordCandidate[] }) => {
        if (!alive) return;
        const c = d.candidates ?? [];
        setCands(c);
        setPicked((p) => (p.length ? p : c.slice(0, MAX).map((x) => x.keyword)));
      })
      .catch(() => alive && setCands([]));
    return () => {
      alive = false;
    };
  }, [jobId]);

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= MAX ? p : [...p, k]));
  const addCustom = () => {
    const k = custom.trim();
    if (!k || picked.includes(k) || picked.length >= MAX) return;
    setCands((c) => [...(c ?? []), { keyword: k, who: "你自己加的" }]);
    setPicked((p) => [...p, k]);
    setCustom("");
  };

  const run = async () => {
    if (!jobId || picked.length === 0) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/seo/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, keywords: picked }) });
      const d = (await res.json()) as { seoKeywords?: KeywordRank[]; error?: string; failed?: string[] };
      if (!res.ok || !d.seoKeywords) throw new Error(d.error || "查詢失敗");
      setResults(d.seoKeywords);
      onDone?.(d.seoKeywords);
      if (d.failed?.length) setErr(`「${d.failed.join("、")}」這次沒查到，可以再查一次。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setBusy(false);
    }
  };

  // 版面照 GEO 推薦題勾選（QuestionPicker）：單欄清單、深色勾選框、底部一顆主按鈕
  const picker = (
      <div className="rounded-[10px] border border-line bg-card p-5">
        <h3 className="text-[16px] font-semibold text-ink">
          客人可能會搜的字 <span className="font-normal text-ink3">從你的網站推估，勾最多 {MAX} 個</span>
        </h3>
        {cands === null ? (
          <p className="mt-2 text-[15px] text-ink3">正在看你的網站，列出客人可能會搜的字…</p>
        ) : cands.length === 0 ? (
          <p className="mt-2 text-[15px] text-ink3">這次沒有列出關鍵字，可以在下面自己加。</p>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {cands.map((c) => {
              const on = picked.includes(c.keyword);
              const off = !on && picked.length >= MAX;
              return (
                <li key={c.keyword}>
                  <label className={`flex gap-3 rounded-lg px-3 py-2.5 ${off ? "opacity-50" : "cursor-pointer hover:bg-paper"} ${on ? "bg-paper" : ""}`}>
                    <input type="checkbox" checked={on} disabled={off} onChange={() => toggle(c.keyword)} className="mt-[5px] h-4 w-4 shrink-0 accent-ink" />
                    <span className="min-w-0">
                      <span className="text-[16px] text-ink">{c.keyword}</span>
                      {c.who && <span className="ml-2 text-[14px] text-ink3">{c.who}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="mt-6 text-[16px] font-semibold text-ink">自己加</h3>
        <div className="mt-2 flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="想查別的字，例如：台中 n8n 外包"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[15px] text-ink"
          />
          <button type="button" onClick={addCustom} disabled={busy || !custom.trim() || picked.length >= MAX} className="rounded-lg border border-line px-4 py-2 text-[15px] font-semibold text-ink disabled:opacity-50">
            加入
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" onClick={run} disabled={busy || picked.length === 0} className="rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-50">
            {busy ? "查詢中，約 1 分鐘…" : results ? `重新查（${picked.length} 個）` : `查排名（${picked.length} 個）`}
          </button>
          <span className="text-[14px] text-ink3">會實際在 Google 搜一次，約 1 分鐘</span>
          {err && <p className="text-[15px] text-fail">✗ {err}</p>}
        </div>
      </div>
  );

  // 查過之後：總表 → 每個關鍵字一張卡 → 換關鍵字收在最下面
  if (results?.length)
    return (
      <div className="space-y-4">
        <Summary rows={results} />
        {results.map((r) => (
          <Result key={r.keyword} r={r} />
        ))}
        <details className="rounded-[10px] border border-line bg-card px-5 py-3">
          <summary className="cursor-pointer text-[15px] font-medium text-ink2">換關鍵字重查</summary>
          <div className="mt-3">{picker}</div>
        </details>
      </div>
    );
  return picker;
}
