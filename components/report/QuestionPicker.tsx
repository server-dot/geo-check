"use client";

import { useState } from "react";
import { track } from "@/lib/ga";

// 推薦題勾選（2026-11-11 小積木：推薦題表現大改）
// 1. 列出網友在論壇真的問過的相關問題（全部，附原文連結）——只給人看，不能勾
// 2. AI 參考這些網友問題＋首頁產生 10 題長句，另從首頁商品分類抓 5 個短關鍵字（「私密清潔凝露推薦」）
// 3. 使用者從 AI 題裡勾（或自己寫），按「問 AI」才真的去問
// 一次最多 3 題：每題要問 Perplexity、ChatGPT、Google 各一次。

export interface QuestionCandidates {
  forum: { question: string; source: { site: string; title: string; link: string } }[];
  forumAll?: { site: string; title: string; link: string }[];
  forumFailed?: boolean;
  ai: string[];
  keywords?: string[]; // 短關鍵字「品項＋推薦」；11-11 前的紀錄沒有
  input?: { brandName: string };
}

export const MAX_PICK = 3;

export function QuestionPicker<R>({
  jobId,
  candidates,
  initial,
  onDone,
  onCancel,
}: {
  jobId: string | null;
  candidates: QuestionCandidates | null;
  initial?: string[]; // 換題重問時：先勾上目前問過的題
  onDone: (r: R) => void;
  onCancel?: () => void;
}) {
  const forum = candidates?.forum ?? [];
  const ai = candidates?.ai ?? [];
  const keywords = candidates?.keywords ?? [];
  const known = new Set([...ai, ...keywords]);
  const [custom, setCustom] = useState<string[]>(() => (initial ?? []).filter((q) => !known.has(q)));
  const [picked, setPicked] = useState<string[]>(() => (initial ?? []).slice(0, MAX_PICK));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!jobId) return null;

  const full = picked.length >= MAX_PICK;
  function toggle(q: string) {
    setPicked((prev) => (prev.includes(q) ? prev.filter((p) => p !== q) : prev.length >= MAX_PICK ? prev : [...prev, q]));
  }
  function addCustom() {
    const q = draft.trim();
    if (q.length < 4 || q.length > 80) {
      setErr("自己寫的題目要 4 到 80 個字");
      return;
    }
    setErr("");
    if (!known.has(q) && !custom.includes(q)) setCustom((prev) => [...prev, q]);
    if (!picked.includes(q) && !full) setPicked((prev) => [...prev, q]);
    setDraft("");
  }
  async function submit() {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/geo/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, questions: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "問 AI 失敗");
      track("recommend_ask", {
        questions: picked.length,
        ai: picked.filter((q) => ai.includes(q)).length,
        keyword: picked.filter((q) => keywords.includes(q)).length,
        custom: picked.filter((q) => custom.includes(q)).length,
      });
      onDone(data.recommendVisibility as R);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "問 AI 失敗");
    } finally {
      setBusy(false);
    }
  }

  const row = (q: string, extra?: React.ReactNode) => {
    const on = picked.includes(q);
    const off = busy || (!on && full);
    return (
      <li key={q}>
        <label className={`flex gap-3 rounded-lg px-3 py-2.5 ${off && !on ? "opacity-50" : "cursor-pointer hover:bg-paper"} ${on ? "bg-paper" : ""}`}>
          <input type="checkbox" checked={on} disabled={off} onChange={() => toggle(q)} className="mt-[5px] h-4 w-4 shrink-0 accent-ink" />
          <span className="min-w-0">
            <span className="text-[16px] text-ink">{q}</span>
            {extra}
          </span>
        </label>
      </li>
    );
  };

  return (
    <div className="rounded-[10px] border border-line bg-card p-5">
      <h3 className="text-[16px] font-semibold text-ink">
        網友問過的 <span className="font-normal text-ink3">{forum.length > 0 ? `${forum.length} 則・Dcard、PTT、Threads、Mobile01、FB 社團原文` : ""}</span>
      </h3>
      {forum.length > 0 ? (
        <ul className="mt-2 space-y-1.5 px-3">
          {forum.map((f) => (
            <li key={f.source.link} className="flex gap-2 text-[15px]">
              <span className="w-[72px] shrink-0 text-ink3">{f.source.site}</span>
              <a href={f.source.link} target="_blank" rel="noopener noreferrer" className="report-table-link min-w-0">
                {f.source.title} ↗
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[15px] text-ink3">
          {candidates?.forumFailed ? "這次論壇搜尋失敗，沒查到網友問過的問題（不代表沒人問）。" : "論壇上找不到網友問過的相關問題。"}
        </p>
      )}

      <h3 className="mt-6 text-[16px] font-semibold text-ink">
        AI 產生的 <span className="font-normal text-ink3">{ai.length > 0 ? `${ai.length} 題・${forum.length > 0 ? "參考上面網友的問題和你的首頁" : "讀你的首頁推估"}，勾最多 ${MAX_PICK} 題` : ""}</span>
      </h3>
      {ai.length > 0 ? <ul className="mt-2 space-y-0.5">{ai.map((q) => row(q))}</ul> : <p className="mt-1 text-[15px] text-ink3">這次沒有產生題目。</p>}

      {keywords.length > 0 && (
        <>
          <h3 className="mt-6 text-[16px] font-semibold text-ink">
            短關鍵字 <span className="font-normal text-ink3">{keywords.length} 個・你主打的品項，像在搜尋框直接打的</span>
          </h3>
          <ul className="mt-2 space-y-0.5">{keywords.map((q) => row(q))}</ul>
        </>
      )}

      <h3 className="mt-6 text-[16px] font-semibold text-ink">自己寫</h3>
      {custom.length > 0 && <ul className="mt-2 space-y-0.5">{custom.map((q) => row(q))}</ul>}
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="客戶會怎麼問 AI，或直接打關鍵字（例如「雞粉推薦」，不要寫你的品牌名）"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[15px] text-ink"
          maxLength={80}
          disabled={busy}
        />
        <button type="button" onClick={addCustom} disabled={busy || !draft.trim()} className="rounded-lg border border-line px-4 py-2 text-[15px] font-semibold text-ink disabled:opacity-50">
          加入
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={submit} disabled={busy || picked.length === 0} className="rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-50">
          {busy ? "問 AI 中，約 1～2 分鐘…" : `問 AI（已勾 ${picked.length}/${MAX_PICK}）`}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="text-[15px] text-ink3">
            取消
          </button>
        )}
        {err && <p className="text-[15px] text-fail">✗ {err}</p>}
      </div>
    </div>
  );
}
