// 本機才有的頁面：列出存下來的 AI 回答（lib/paid-fetch.ts 在 next dev 時順手存的）。
// 2026-11-12 小積木要在瀏覽器看「測的結果」，不想去翻 .data/replay 的 JSON。正式站一律 404。

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { REPLAY_DIR, type Tape } from "@/lib/paid-fetch";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "存下來的 AI 回答", robots: { index: false } };

interface Row {
  file: string;
  savedAt: string;
  source: string;
  asked: string;
  answer: string;
}

function sourceOf(t: Tape, req: Record<string, unknown> | null): string {
  const host = new URL(t.url).host;
  if (host.includes("serper")) return "Serper（Google 搜尋）";
  if (host.includes("serpapi")) return new URL(t.url).searchParams.get("engine") === "google_ai_overview" ? "Google AI 摘要（補抓）" : "Google AI 摘要";
  const model = typeof req?.model === "string" ? req.model : "";
  if (model.startsWith("perplexity")) return `Perplexity（${model}）`;
  if (req?.plugins) return `ChatGPT（${model}）`;
  return `整理用的 AI（${model}）`;
}

function askedOf(t: Tape, req: Record<string, unknown> | null): string {
  if (!req) return new URL(t.url).searchParams.get("q") ?? "";
  if (typeof req.q === "string") return req.q;
  const msgs = Array.isArray(req.messages) ? (req.messages as { content?: unknown }[]) : [];
  const last = msgs.at(-1)?.content;
  return typeof last === "string" ? last : "";
}

function answerOf(t: Tape): string {
  try {
    const j = JSON.parse(t.body) as Record<string, unknown>;
    const choice = (j.choices as { message?: { content?: string } }[] | undefined)?.[0];
    if (choice?.message?.content) return choice.message.content;
    if (Array.isArray(j.organic)) return (j.organic as { title?: string; link?: string }[]).map((o) => `${o.title}\n${o.link}`).join("\n\n");
    const aio = j.ai_overview as { text_blocks?: { snippet?: string }[] } | undefined;
    if (aio?.text_blocks) return aio.text_blocks.map((b) => b.snippet ?? "").filter(Boolean).join("\n");
    if (!("ai_overview" in j) && "search_metadata" in j) return "（這題 Google 沒出 AI 摘要）";
  } catch {}
  return t.body.slice(0, 2000);
}

function load(): Row[] {
  let files: string[] = [];
  try {
    files = readdirSync(REPLAY_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const rows: Row[] = [];
  for (const f of files) {
    try {
      const t = JSON.parse(readFileSync(path.join(REPLAY_DIR, f), "utf8")) as Tape;
      let req: Record<string, unknown> | null = null;
      try {
        req = t.request ? (JSON.parse(t.request) as Record<string, unknown>) : null;
      } catch {}
      rows.push({ file: f, savedAt: t.savedAt, source: sourceOf(t, req), asked: askedOf(t, req), answer: answerOf(t) });
    } catch {}
  }
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export default function ReplayPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const rows = load();
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-10">
      <h1 className="text-[24px] font-bold text-ink">存下來的 AI 回答</h1>
      <p className="mt-2 text-[15px] text-ink2">
        本機跑健檢、問 AI 時，每一次呼叫 AI 的回答都會存一份。用 <code className="mono">npm run dev:replay</code> 啟動時，工具就拿這些回答來用，不花錢。共 {rows.length} 筆。
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-[10px] border border-line bg-card px-5 py-4 text-[15px] text-ink2">
          還沒有存下來的回答。本機正常跑一次健檢＋問 AI 之後，這裡就會出現。
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <details key={r.file} className="rounded-[10px] border border-line bg-card px-5 py-3">
              <summary className="cursor-pointer list-none">
                <span className="mono text-[14px] text-ink3">{new Date(r.savedAt).toLocaleString("zh-TW", { hour12: false })}</span>
                <span className="ml-3 text-[15px] font-semibold text-ink">{r.source}</span>
                <span className="ml-3 text-[15px] text-ink2">{r.asked.replace(/\s+/g, " ").slice(0, 60)}</span>
              </summary>
              <p className="mt-3 text-[14px] font-medium text-ink3">問的內容</p>
              <pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-lg bg-inset p-3 text-[14px] text-ink2">{r.asked}</pre>
              <p className="mt-3 text-[14px] font-medium text-ink3">AI 回答</p>
              <pre className="mt-1 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-inset p-3 text-[14px] text-ink">{r.answer}</pre>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
