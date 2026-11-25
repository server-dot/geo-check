"use client";

// ── 產品線作戰清單（只有公司帳號看得到）─────────────────────
// 選產品線和關鍵字 → 看費用 → 跑 → 待辦清單＋開成 Google 試算表。邏輯在 lib/line-plan.ts。

import { useEffect, useState } from "react";
import { MAX_LINE_KEYWORDS, MAX_NAMED_RIVALS, estimateUsd, type LineCandidate, type LinePlan as Plan } from "@/lib/line-plan-types";

const TONE: Record<string, string> = { 高: "bg-fail/10 text-fail", 中: "bg-warn/15 text-warn", 低: "bg-inset text-ink2" };
const AI_TEXT = { named: "✓ 有推", not: "✗ 沒推", failed: "查詢失敗", absent: "沒出摘要" } as const;
const rankText = (r: number | null | "failed") => (r === "failed" ? "查詢失敗" : r === null ? "第一頁沒有" : `第 ${r} 名`);

export function LinePlan({ jobId }: { jobId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lines, setLines] = useState<LineCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rivals, setRivals] = useState(() => Array.from({ length: MAX_NAMED_RIVALS }, () => ({ name: "", url: "" })));
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState<"" | "load" | "lines" | "run">("load");
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  // 輪詢：跑的時候每 3 秒看一次；開始跑之後 setTick 再觸發
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const again = (ms: number) => {
      t = setTimeout(() => setTick((n) => n + 1), ms);
    };
    fetch(`/api/geo/line-plan?jobId=${encodeURIComponent(jobId)}`)
      .then((r) => r.json())
      .then((d: { running?: boolean; step?: string; error?: string; plan?: Plan | null }) => {
        if (!alive) return;
        if (d.running) {
          setBusy("run");
          setStep(d.step ?? "");
          again(3000);
          return;
        }
        setBusy("");
        if (d.error) setErr(d.error);
        else if (d.plan) {
          setPlan(d.plan);
          if (tick > 0) setLines(null);
        }
      })
      .catch(() => alive && again(6000));
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [jobId, tick]);

  const id = (l: string, k: string) => `${l}|${k}`;
  async function loadLines() {
    setBusy("lines");
    setErr("");
    try {
      const r = await fetch(`/api/geo/line-plan?mode=lines&jobId=${encodeURIComponent(jobId)}&focus=${encodeURIComponent(focus.trim())}`);
      const d = (await r.json()) as { lines?: LineCandidate[]; error?: string };
      if (!d.lines) setErr(d.error ?? "讀不到產品線");
      else {
        setLines(d.lines);
        setPicked(new Set([0, 1].flatMap((n) => d.lines!.flatMap((l) => l.keywords.slice(n, n + 1).map((k) => id(l.name, k.keyword)))).slice(0, MAX_LINE_KEYWORDS)));
      }
    } catch {
      setErr("連線失敗，請再試一次");
    }
    setBusy("");
  }
  async function run() {
    if (!lines) return;
    setErr("");
    setBusy("run");
    const picks = lines.flatMap((l) => l.keywords.filter((k) => picked.has(id(l.name, k.keyword))).map((k) => ({ line: l.name, pages: l.pages, keyword: k.keyword, words: k.words })));
    try {
      const r = await fetch("/api/geo/line-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, picks, rivals }) });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "沒跑起來");
        setBusy("");
        return;
      }
      setTick((n) => n + 1);
    } catch {
      setErr("連線失敗，請再試一次");
      setBusy("");
    }
  }

  const full = picked.size >= MAX_LINE_KEYWORDS;
  return (
    <div className="space-y-5">
      {err && <p className="rounded-lg border border-fail/30 bg-fail/5 px-4 py-3 text-[15px] text-fail">✗ {err}</p>}
      {busy === "run" && <p className="rounded-lg border border-line bg-card px-4 py-3 text-[16px] text-ink">{step || "開始…"}（約 5～10 分鐘，可以先看別頁）</p>}

      {busy !== "run" && busy !== "load" && !lines && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={focus}
            maxLength={16}
            aria-label="只看哪一塊"
            placeholder="只看哪一塊，例如：臉部保養（可不填）"
            onChange={(e) => setFocus(e.target.value)}
            className="w-[340px] rounded-lg border border-line bg-paper px-3 py-2.5 text-[15px] text-ink"
          />
          <button type="button" onClick={() => void loadLines()} disabled={busy === "lines"} className="btn-lime px-5 py-2.5 text-[15px]">
            {busy === "lines" ? "讀選單中…" : plan ? "重新選產品線" : "選產品線"}
          </button>
        </div>
      )}

      {lines && busy !== "run" && (
        <div className="space-y-4 rounded-xl border border-line bg-card p-5">
          {lines.map((l) => (
            <div key={l.name}>
              <p className="text-[16px] font-bold text-ink">{l.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {l.keywords.map((k) => {
                  const key = id(l.name, k.keyword);
                  const on = picked.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && full}
                      onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(key); else n.add(key); return n; })}
                      className={`rounded-full border px-3 py-1.5 text-[15px] ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink2 disabled:opacity-40"}`}
                    >
                      {on ? "✓ " : ""}
                      {k.keyword}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-[16px] font-bold text-ink">一定要比的對手</p>
            <p className="text-[14px] text-ink3">可不填。其他同業會從 AI 推薦名單自動找，一起比。</p>
            {rivals.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                {(["name", "url"] as const).map((f) => (
                  <input
                    key={f}
                    value={r[f]}
                    aria-label={`對手 ${i + 1} ${f === "name" ? "名稱" : "網址"}`}
                    placeholder={f === "name" ? "品牌名" : "官網網址"}
                    onChange={(e) => setRivals((rs) => rs.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[15px] text-ink"
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setLines(null)} className="report-table-link text-[15px]">重選</button>
            <button type="button" onClick={() => void run()} disabled={picked.size === 0} className="btn-lime px-5 py-2.5 text-[15px] disabled:opacity-50">
              開始跑 {picked.size} 個字
            </button>
            <span className="text-[14px] text-ink3">
              最多 {MAX_LINE_KEYWORDS} 個，預估 US${estimateUsd(picked.size).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {plan && busy !== "run" && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <a href={`/api/geo/line-plan/sheet?jobId=${encodeURIComponent(jobId)}`} className="btn-lime px-5 py-2.5 text-[15px]">
              開成 Google 試算表
            </a>
            <a href={`/api/geo/line-plan?mode=xlsx&jobId=${encodeURIComponent(jobId)}`} className="report-table-link text-[15px]">
              下載 Excel
            </a>
            <span className="text-[14px] text-ink3">{new Date(plan.checkedAt).toLocaleString("zh-TW", { hour12: false })}</span>
          </div>
          {plan.notes.length > 0 && <p className="text-[14px] text-warn">⚠ {plan.notes.join("；")}</p>}
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full text-[15px]">
              <thead className="bg-inset/60 text-left text-[14px] text-ink3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">關鍵字</th>
                  <th className="px-3 py-2.5 font-medium">Google</th>
                  <th className="px-3 py-2.5 font-medium">Google 前面是誰</th>
                  {["Perplexity", "ChatGPT", "Google AI"].map((e) => (
                    <th key={e} className="px-3 py-2.5 font-medium">{e}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.keywords.map((k) => (
                  <tr key={k.line + k.keyword} className="border-t border-line">
                    <td className="px-4 py-2.5 font-semibold text-ink">{k.keyword}</td>
                    <td className="px-3 py-2.5">{rankText(k.rank)}</td>
                    <td className="px-3 py-2.5 text-ink2">{k.top.filter((t) => !t.isSelf && !t.isPlatform && (typeof k.rank !== "number" || t.rank < k.rank)).slice(0, 3).map((t) => t.domain).join("、") || "—"}</td>
                    {k.ai.map((a) => (
                      <td key={a.engine} className={`px-3 py-2.5 ${a.state === "named" ? "text-ok" : a.state === "not" ? "text-fail" : "text-ink3"}`}>
                        {AI_TEXT[a.state]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.rivals.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-line bg-card">
              <table className="w-full min-w-max text-[15px]">
                <thead className="bg-inset/60 text-left text-[14px] text-ink3">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">對手比較</th>
                    <th className="px-3 py-2.5 font-medium">{plan.brand}</th>
                    {plan.rivalSites.map((r) => (
                      <th key={r.url} className="px-3 py-2.5 font-medium">{r.name}</th>
                    ))}
                    <th className="px-3 py-2.5 font-medium">怎麼做</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rivals.map((r) => (
                    <tr key={r.item} className="border-t border-line">
                      <td className="px-4 py-2.5 font-semibold text-ink">{r.item}</td>
                      {[r.self, ...r.cells.map((c) => c.text)].map((t, i) => (
                        <td key={i} className="max-w-[180px] px-3 py-2.5 text-ink2">{t}</td>
                      ))}
                      <td className={`px-3 py-2.5 ${r.action === "要追" ? "text-fail" : r.action === "可主打" ? "text-ok" : "text-ink3"}`}>{r.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <table className="w-full text-[15px]">
              <thead className="bg-inset/60 text-left text-[14px] text-ink3">
                <tr>
                  <th className="w-[70px] px-4 py-2.5 font-medium">優先</th>
                  <th className="px-3 py-2.5 font-medium">要做什麼</th>
                  <th className="w-[38%] px-3 py-2.5 font-medium">現況</th>
                  <th className="w-[80px] px-3 py-2.5 font-medium">誰做</th>
                </tr>
              </thead>
              <tbody>
                {plan.todos.map((t, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[14px] font-bold ${TONE[t.priority]}`}>{t.priority}</span></td>
                    <td className="px-3 py-3">
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="report-table-link font-semibold">{t.todo}</a>
                      {t.suggest && <p className="mt-1 text-[14px] text-ink3">草稿：{t.suggest}</p>}
                    </td>
                    <td className="px-3 py-3 text-ink2">{t.now}</td>
                    <td className="px-3 py-3 text-ink2">{t.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
