"use client";

// ── 網站總體健檢：AI 有沒有被擋＋llms.txt＋無障礙（WCAG）──────────
// 11-25 小積木：基本的被擋、llms.txt 跟 WCAG 放一起，讀首頁那塊拿掉。第一眼三張卡＋兩張表，說明收在每列裡
import { useEffect, useState, type ReactNode } from "react";
import { MANUAL_ITEMS, type WcagItem, type WcagReport } from "@/lib/wcag-types";
import { Icon, StatTile } from "./StatTile";

type Mark = "ok" | "warn" | "fail" | "unknown" | "none";
const MARK: Record<Mark, { text: string; cls: string }> = {
  fail: { text: "✗ 有問題", cls: "text-fail" },
  warn: { text: "! 可以補", cls: "text-warn" },
  unknown: { text: "? 無法判定", cls: "text-ink3" },
  ok: { text: "✓ 沒發現問題", cls: "text-ok" },
  none: { text: "— 網頁上沒有", cls: "text-ink3" },
};
const path = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname) || "/";
  } catch {
    return u;
  }
};
const state = (i: WcagItem): Mark => (i.checked === 0 ? "none" : i.bad > 0 ? "fail" : "ok");

function Row({ name, mark, value, children }: { name: string; mark: Mark; value: string; children: ReactNode }) {
  return (
    <details className="border-t border-line">
      <summary className="grid cursor-pointer grid-cols-[1fr_8.5rem_8rem] items-baseline gap-4 px-5 py-3 text-[15px] hover:bg-inset/50">
        <span className="font-medium text-ink">{name}</span>
        <span className={`font-semibold ${MARK[mark].cls}`}>{MARK[mark].text}</span>
        <span className="text-right tabular-nums text-ink2">{value}</span>
      </summary>
      <div className="space-y-2 bg-inset/40 px-5 py-4 text-[15px] leading-relaxed text-ink2">{children}</div>
    </details>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <h3 className="px-5 py-3 text-[16px] font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export interface AiAccess {
  robotsUrl: string;
  robotsStatus: "found" | "none" | "unreachable";
  robotsNote: string;
  wafHint: { vendor: string; impact: string } | null;
  results: { ua: string; label: string; status: "allowed" | "blocked" | "unknown" | "mismatch"; matchedRule: string }[];
  llmsTxt: { exists: boolean | null; quality: { status: "thin" | "ok"; advice: string; links: { text: string; url: string }[] } | null };
}

// 讀不到就是無法判定，不給假綠燈；robots.txt 允許但實際被擋（mismatch）也算被擋
function accessOf(a: AiAccess) {
  const shut = a.results.filter((r) => r.status === "blocked" || r.status === "mismatch");
  const unknown = a.results.filter((r) => r.status === "unknown");
  const open = a.results.length - shut.length - unknown.length;
  const mark: Mark = a.results.length === 0 ? "unknown" : shut.length > 0 ? "fail" : unknown.length > 0 ? "unknown" : "ok";
  return { shut, unknown, open, mark };
}
function llmsOf(a: AiAccess): Mark {
  const l = a.llmsTxt;
  return l.exists === null ? "unknown" : l.exists && l.quality?.status === "ok" ? "ok" : "warn";
}

function AiRows({ a }: { a: AiAccess }) {
  const { shut, unknown, open, mark } = accessOf(a);
  const links = a.llmsTxt.quality?.links ?? [];
  return (
    <Group title="AI 讀取">
      <Row name="AI 有沒有被擋" mark={mark} value={open + shut.length > 0 ? `${open}／${a.results.length} 家進得來` : ""}>
        <p>ChatGPT、Claude、Perplexity 會派程式來讀網站，被擋在外面就讀不到你的內容。</p>
        {shut.length > 0 && (
          <ul className="space-y-1 text-ink">
            {shut.map((r) => (
              <li key={r.ua}>✗ {r.label}：{r.status === "blocked" ? "網站設定（robots.txt）不讓它進來" : "設定允許，但實際連線被擋（多半是防火牆）"}</li>
            ))}
          </ul>
        )}
        {unknown.length > 0 && (
          <p className="text-ink">
            ? {unknown.length === a.results.length ? "全部" : unknown.map((r) => r.label).join("、")}無法判定，不代表對 AI 開放。{a.robotsNote}
          </p>
        )}
        {a.wafHint && <p className="text-ink">可能原因：{a.wafHint.vendor}。{a.wafHint.impact}</p>}
        <p className="text-[13px] text-ink3">
          {a.robotsStatus === "none" ? "網站沒有 robots.txt，預設都能進來" : <a href={a.robotsUrl} target="_blank" rel="noopener noreferrer" className="report-table-link break-all">{a.robotsUrl}</a>}
        </p>
        <p className="text-[13px] text-ink3">檢查了：{a.results.map((r) => r.ua).join("、")}</p>
      </Row>
      <Row name="給 AI 的網站導覽（llms.txt）" mark={llmsOf(a)} value={a.llmsTxt.exists ? `列了 ${links.length} 頁` : a.llmsTxt.exists === false ? "沒有" : ""}>
        <p>專門給 AI 看的重點頁清單，非必要，沒有不算錯誤。</p>
        {a.llmsTxt.exists && a.llmsTxt.quality?.status === "thin" && <p className="text-ink">{a.llmsTxt.quality.advice}</p>}
        {links.length > 0 && (
          <p>
            {links.slice(0, 8).map((l, i) => (
              <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer" className="report-table-link mr-3">
                {l.text || l.url}
              </a>
            ))}
            {links.length > 8 && `等 ${links.length} 頁`}
          </p>
        )}
      </Row>
    </Group>
  );
}

function WcagRow({ item }: { item: WcagItem }) {
  const s = state(item);
  return (
    <Row name={item.name} mark={s} value={s === "none" ? "" : item.bad > 0 ? `${item.bad}／${item.checked} 處` : `檢查 ${item.checked} 處`}>
      <p>{item.why}</p>
      {s === "fail" && (
        <>
          <p className="text-ink">改法：{item.fix}</p>
          <p>
            出現在：
            {item.pages.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="report-table-link mr-3 break-all">
                {path(p.url)}（{p.bad}）
              </a>
            ))}
          </p>
          {item.samples.length > 0 && <p className="mono break-all text-[13px] text-ink3">例：{item.samples.join("、")}</p>}
        </>
      )}
      <p className="text-[13px] text-ink3">WCAG 2.2 準則 {item.sc}（{item.level} 級）</p>
    </Row>
  );
}

export function SiteHealth({ ai, jobId, initial, active, onDone }: { ai: AiAccess; jobId: string | null; initial?: WcagReport | null; active: boolean; onDone: (r: WcagReport) => void }) {
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const need = active && !initial && !!jobId;
  useEffect(() => {
    if (!need) return;
    let alive = true;
    fetch("/api/geo/wcag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) })
      .then(async (r) => {
        const d = (await r.json()) as { wcag?: WcagReport; error?: string };
        if (!alive) return;
        if (d.wcag) onDone(d.wcag);
        else setError(d.error || "檢查時出錯了，請稍後再試。");
      })
      .catch(() => alive && setError("連線失敗，請稍後再試。"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone 每次 render 都是新的，只在需要檢查時跑
  }, [need, jobId, tries]);

  const { shut, unknown, open, mark } = accessOf(ai);
  const llms = llmsOf(ai);
  const read = initial?.pages.filter((p) => p.readable) ?? [];
  const unread = (initial?.pages.length ?? 0) - read.length;
  const items = read.length > 0 ? initial!.items : [];
  const fails = items.filter((i) => state(i) === "fail");
  const order: Record<Mark, number> = { fail: 0, warn: 1, unknown: 2, ok: 3, none: 4 };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatTile icon={Icon.robot} value={mark === "unknown" && open === 0 ? "?" : `${open}/${ai.results.length}`} label="AI 進得來" tone={mark === "fail" ? "fail" : mark === "ok" ? "ok" : "unknown"} note={shut.length > 0 ? `${shut.length} 家被擋${unknown.length > 0 ? `，${unknown.length} 家無法判定` : ""}` : mark === "ok" ? "沒有擋任何 AI" : "無法判定"} />
        <StatTile icon={Icon.map} value={llms === "unknown" ? "?" : ai.llmsTxt.exists ? `${ai.llmsTxt.quality?.links.length ?? 0} 頁` : "沒有"} label="給 AI 的網站導覽" tone={llms === "ok" ? "ok" : llms === "warn" ? "warn" : "unknown"} note={llms === "unknown" ? "無法判定" : !ai.llmsTxt.exists ? "非必要" : llms === "ok" ? "寫得完整" : "內容偏少"} />
        <StatTile icon={Icon.people} value={items.length > 0 ? `${fails.length} 項` : initial ? "?" : "…"} label="無障礙有問題" tone={items.length === 0 ? "unknown" : fails.length > 0 ? "warn" : "ok"} note={items.length > 0 ? `測 ${items.length} 項、${read.length} 頁${unread > 0 ? `，${unread} 頁讀不到` : ""}` : initial ? "讀不到網站內容" : error || !jobId ? "還沒檢查" : "檢查中"} />
      </div>
      <AiRows a={ai} />
      <Group title="無障礙（WCAG 2.2）">
        {items.length > 0 ? (
          [...items].sort((a, b) => order[state(a)] - order[state(b)]).map((i) => <WcagRow key={i.key} item={i} />)
        ) : (
          <p className="border-t border-line px-5 py-4 text-[15px] text-ink2" role="status">
            {initial ? "? 讀不到網站內容，無法判定。可能是網站擋住檢測，或內容要在瀏覽器執行才會出現。" : !jobId ? "這份報告沒有存檔，無法檢查。" : error || "正在檢查首頁和幾個內頁，約 10 秒…"}
            {!initial && error && (
              <button type="button" className="ml-3 underline" onClick={() => { setError(""); setTries((n) => n + 1); }}>
                再試一次
              </button>
            )}
          </p>
        )}
      </Group>
      <p className="text-[14px] leading-relaxed text-ink3">無障礙要人工看的：{MANUAL_ITEMS.join("、")}。這份結果不等於符合 WCAG 或取得無障礙標章。</p>
    </div>
  );
}
