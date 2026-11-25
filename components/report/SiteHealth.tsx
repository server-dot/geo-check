"use client";

// ── 網站總體健檢：AI 有沒有被擋＋llms.txt＋無障礙（WCAG）──────────
// 11-25：只講問題在哪、小白要看得懂；處數、準則編號不放
// 11-25 小積木：基本的被擋、llms.txt 跟 WCAG 放一起，讀首頁那塊拿掉。第一眼三張卡，下面每個問題一張卡：一句白話＋實際截圖連到那一頁，不解釋什麼是無障礙（「現在聽到／改好聽到」被退：醜、看不懂）
import { useEffect, useState, type ReactNode } from "react";
import { MANUAL_ITEMS, WCAG_VERSION, type WcagExample, type WcagItem, type WcagReport, type WcagScan } from "@/lib/wcag-types";
import { Icon, StatTile } from "./StatTile";

type Mark = "ok" | "warn" | "fail" | "unknown";
const MARK: Record<Mark, { sign: string; cls: string }> = {
  fail: { sign: "✗", cls: "text-fail" },
  warn: { sign: "!", cls: "text-warn" },
  unknown: { sign: "?", cls: "text-ink3" },
  ok: { sign: "✓", cls: "text-ok" },
};

function Line({ mark, title, children }: { mark: Mark; title: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-line px-5 py-4">
      <span className={`text-[17px] font-bold ${MARK[mark].cls}`} aria-hidden="true">{MARK[mark].sign}</span>
      <div className="min-w-0 space-y-1 text-[15px] leading-relaxed text-ink2">
        <p className="text-[16px] font-bold text-ink">{title}</p>
        {children}
      </div>
    </div>
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

// 會即時回答客人的 AI 才亮燈；抓資料訓練模型的被擋，很多網站是故意的（或平台預設），只寫一行說明。
// 11-25 Relove：Shopline 擋了 GPTBot、ClaudeBot 等訓練爬蟲，ChatGPT 搜尋和 Perplexity 都進得來，混成「4 家被擋」是誤導
const ANSWER_BOTS: Record<string, string> = { "OAI-SearchBot": "ChatGPT 搜尋", "ChatGPT-User": "ChatGPT 讀網頁", PerplexityBot: "Perplexity" };
const TRAIN_NAME: Record<string, string> = { GPTBot: "ChatGPT", ClaudeBot: "Claude", CCBot: "Common Crawl", Bytespider: "抖音" };
const isShut = (r: { status: string }) => r.status === "blocked" || r.status === "mismatch";
function accessOf(a: AiAccess) {
  const answer = a.results.filter((r) => r.ua in ANSWER_BOTS);
  const shut = answer.filter(isShut);
  const unknown = answer.filter((r) => r.status === "unknown");
  const train = a.results.filter((r) => r.ua in TRAIN_NAME && isShut(r));
  const mark: Mark = answer.length === 0 ? "unknown" : shut.length > 0 ? "fail" : unknown.length > 0 ? "unknown" : "ok";
  return { answer, shut, unknown, train, mark };
}
// 有放就好，非必要
const llmsOf = (a: AiAccess): Mark => (a.llmsTxt.exists === null ? "unknown" : a.llmsTxt.exists ? "ok" : "warn");
const pageLabel = (url: string, pages: WcagReport["pages"]) => {
  try {
    if (new URL(url).pathname === "/") return "首頁";
  } catch {}
  return (pages.find((p) => p.url === url)?.title ?? "").replace(/【[^】]*】/g, "").split(/[｜|]/)[0].trim().slice(0, 20) || "內頁";
};

function AiLines({ a }: { a: AiAccess }) {
  const { answer, shut, unknown, train, mark } = accessOf(a);
  // 都沒問題時上面的卡已經講完，不重複
  if (mark === "ok" && train.length === 0 && a.llmsTxt.exists) return null;
  const names = (rs: AiAccess["results"]) => rs.map((r) => ANSWER_BOTS[r.ua] ?? TRAIN_NAME[r.ua]).join("、");
  return (
    <Group title="AI 讀取">
      <Line mark={mark} title={mark === "ok" ? "回答客人的 AI 都進得來" : mark === "fail" ? `${names(shut)} 進不來` : "讀不到網站設定，無法判定"}>
        {mark === "ok" && <p>測過：{names(answer)}</p>}
        {shut.length > 0 && <p>{shut.some((r) => r.status === "mismatch") ? "網站設定允許，但我們用它的名稱連線被擋，可能是防火牆或架站平台。" : "網站設定（robots.txt）不讓它進來。"}它可能讀不到你的網頁。</p>}
        {shut.length > 0 && unknown.length > 0 && <p>{names(unknown)} 無法判定。</p>}
        {mark === "unknown" && <p>這不代表對 AI 開放。{a.wafHint ? `可能原因：${a.wafHint.vendor}。` : ""}{a.robotsNote}</p>}
        {train.length > 0 && <p className="text-[14px] text-ink3">另外，抓資料訓練 AI 的程式（{names(train)}）進不來。很多網站或架站平台本來就會擋，跟上面回答客人的程式是分開的。</p>}
      </Line>
      <Line mark={llmsOf(a)} title={a.llmsTxt.exists === null ? "給 AI 的網站導覽（llms.txt）：無法判定" : a.llmsTxt.exists ? "有給 AI 的網站導覽（llms.txt）" : "沒有給 AI 的網站導覽（llms.txt）"}>
        {a.llmsTxt.exists === false && <p>非必要，有空再補。</p>}
      </Line>
    </Group>
  );
}

// 每種問題一個圖示
const G = (d: ReactNode) => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 shrink-0" aria-hidden="true">
    {d}
  </svg>
);
const PIC: Record<string, ReactNode> = {
  alt: G(<><rect x="6" y="9" width="36" height="30" rx="4" /><circle cx="17" cy="19" r="3.5" /><path d="M8 35l11-10 8 7 6-5 8 8" /></>),
  link: G(<><path d="M20 28a7 7 0 0 0 10 0l6-6a7 7 0 0 0-10-10l-2 2" /><path d="M28 20a7 7 0 0 0-10 0l-6 6a7 7 0 0 0 10 10l2-2" /></>),
  button: G(<><rect x="5" y="11" width="38" height="26" rx="8" /><circle cx="22" cy="22" r="5.5" /><path d="M26 26l5 5" /></>),
  field: G(<><rect x="5" y="14" width="38" height="20" rx="4" /><path d="M11 24h14M33 22l3 3 3-3" /></>),
  bypass: G(<><rect x="7" y="6" width="34" height="36" rx="4" /><path d="M13 13h22M13 18h22M13 23h22" strokeDasharray="3 4" /><path d="M24 27v9M20 33l4 4 4-4" /></>),
  zoom: G(<><rect x="13" y="4" width="22" height="40" rx="4" /><path d="M20 28l4-11 4 11M21.5 24h5" /></>),
  lang: G(<><circle cx="24" cy="24" r="18" /><path d="M6 24h36M24 6c6 5 8 11 8 18s-2 13-8 18c-6-5-8-11-8-18s2-13 8-18z" /></>),
  title: G(<><path d="M4 40V16h6l3-7h16l3 7h12v24z" /><path d="M17 13h8" /></>),
  frame: G(<><rect x="5" y="10" width="38" height="28" rx="4" /><path d="M20 18l10 6-10 6z" /></>),
  motion: G(<><path d="M5 18h26M5 26h34M5 34h20M36 14l6 4-6 4" /></>),
  refresh: G(<><path d="M39 24a15 15 0 1 1-4.5-10.7M39 8v8h-8" /></>),
};
// 例子本身沒有圖檔（圖示按鈕、欄位、整頁）：畫它在畫面上長什麼樣子，紅框標出有問題的地方
const T = (d: ReactNode) => (
  <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-24 w-32 text-ink" aria-hidden="true">
    {d}
  </svg>
);
const RED = { stroke: "var(--fail)" };
const inBox = (d: ReactNode) => T(<><rect x="16" y="8" width="32" height="32" rx="6" style={RED} />{d}</>);
const inField = (d: ReactNode) => T(<><rect x="6" y="14" width="52" height="20" rx="4" style={RED} />{d}</>);
function sketch(key: string, what: string): ReactNode {
  if (key === "bypass") return T(<><rect x="6" y="5" width="52" height="38" rx="3" /><path d="M12 11h8M24 11h8M36 11h8M12 17h8M24 17h8M36 17h8" style={RED} /><rect x="9" y="7.5" width="46" height="13.5" rx="2" style={RED} /><path d="M12 28h40M12 33h40M12 38h24" /></>);
  if (key === "zoom") return T(<><rect x="21" y="3" width="22" height="42" rx="4" /><path d="M26 14h12M26 18h12M26 22h8" strokeWidth={1.2} /><path d="M25 38l14-9M39 38l-14-9" style={RED} /></>);
  if (key === "lang") return T(<><circle cx="32" cy="24" r="15" /><path d="M17 24h30M32 9c5 4 7 9 7 15s-2 11-7 15c-5-4-7-9-7-15s2-11 7-15z" /></>);
  if (key === "title") return T(<><path d="M6 42V18h6l3-8h18l3 8h22v24z" /><path d="M19 15h10" style={RED} /></>);
  if (key === "frame") return inField(<path d="M29 19l8 5-8 5z" />);
  if (key === "motion") return T(<path d="M8 16h30M8 24h38M8 32h26M50 20l6 4-6 4" style={RED} />);
  if (key === "refresh") return T(<path d="M45 24a13 13 0 1 1-4-9.3M45 9v8h-8" style={RED} />);
  if (/欄位/.test(what)) return inField(/搜尋/.test(what) ? <><circle cx="14" cy="23" r="3.5" /><path d="M17 26l3 3" /></> : <path d="M13 20v8" />);
  if (/下拉/.test(what)) return inField(<><path d="M13 24h22" /><path d="M46 22l3.5 3.5 3.5-3.5" /></>);
  if (/勾選/.test(what)) return T(<><rect x="10" y="17" width="14" height="14" rx="2" style={RED} /><path d="M30 24h24" /></>);
  if (/搜尋/.test(what)) return inBox(<><circle cx="30" cy="22" r="6" /><path d="M35 27l6 6" /></>);
  if (/登入|會員/.test(what)) return inBox(<><circle cx="32" cy="19" r="4.5" /><path d="M23 34c1-6 5-8 9-8s8 2 9 8" /></>);
  if (/購物車/.test(what)) return inBox(<><path d="M22 16h4l3 12h10l3-9H27.5" /><circle cx="31" cy="33" r="1.5" /><circle cx="38" cy="33" r="1.5" /></>);
  if (/收藏/.test(what)) return inBox(<path d="M32 33l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6z" />);
  if (/選單/.test(what)) return inBox(<path d="M24 18h16M24 24h16M24 30h16" />);
  if (/關閉/.test(what)) return inBox(<path d="M26 18l12 12M38 18L26 30" />);
  if (/輪播/.test(what)) return inBox(<path d="M29 17l7 7-7 7" />);
  if (/社群/.test(what)) return inBox(<path d="M24 17h16v11H32l-5 5v-5h-3z" />);
  if (/分享/.test(what)) return inBox(<><circle cx="26" cy="24" r="2.5" /><circle cx="38" cy="18" r="2.5" /><circle cx="38" cy="30" r="2.5" /><path d="M28.5 23l7-4M28.5 25l7 4" /></>);
  if (key === "alt" || /圖|Logo/.test(what)) return inBox(<><circle cx="26" cy="18" r="2.5" /><path d="M19 35l8-8 5 5 4-4 8 8" /></>);
  if (/連結/.test(what)) return inBox(<path d="M29 26a4.5 4.5 0 0 0 6 0l4-4a4.5 4.5 0 0 0-6-6l-1 1M35 22a4.5 4.5 0 0 0-6 0l-4 4a4.5 4.5 0 0 0 6 6l1-1" />);
  return inBox(<circle cx="32" cy="24" r="5" />);
}

// 真的圖載不到就換示意圖
function Thumb({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 客戶網站上的圖，網址不固定
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-full w-full object-contain" />
  );
}

// 白話：哪裡不對、要請工程師做什麼
const SAY: Record<string, [string, string]> = {
  alt: ["圖片沒有文字說明", "幫圖片加上說明文字，例如「品牌 Logo」"],
  link: ["圖片或圖示可以點，但沒寫會去哪", "幫連結加上名稱，例如「登入」"],
  button: ["按鈕只有圖示，沒有名稱", "幫按鈕加上名稱，例如「搜尋」"],
  field: ["欄位沒寫要填什麼", "幫欄位加上名稱，例如「姓名」"],
  bypass: ["一進來就是一大排選單，不能跳過", "加上「跳到主要內容」的連結"],
  zoom: ["手機上不能放大", "打開放大功能"],
  lang: ["沒標明這是中文網頁", "把網頁語言設成中文"],
  title: ["網頁沒有標題", "每一頁都寫標題"],
  frame: ["影片或地圖沒有名稱", "幫影片、地圖加上名稱"],
  motion: ["文字一直跑，停不下來", "改成不會動的文字"],
  refresh: ["網頁會自己跳走", "取消自動跳頁"],
};

const CHECKS: Record<string, string> = { alt: "圖片說明", link: "連結名稱", button: "按鈕名稱", field: "欄位名稱", bypass: "跳過選單", zoom: "手機放大", lang: "網頁語言", title: "網頁標題", frame: "影片、地圖名稱", motion: "跑馬燈", refresh: "自動跳頁" };

function Example({ e, item, pages }: { e: WcagExample; item: WcagItem; pages: WcagReport["pages"] }) {
  const name = e.what || (item.key === "bypass" ? "頁首的選單" : "整頁");
  const page = pageLabel(e.url, pages);
  const pic = e.shot ? (
    // eslint-disable-next-line @next/next/no-img-element -- 檢查時截的圖，內嵌在報告裡
    <img src={e.shot} alt={`${page}的${name}，紅框標出位置`} className="h-full w-full object-cover" />
  ) : (
    <Thumb src={e.img} fallback={sketch(item.key, e.what)} />
  );
  return (
    <a href={e.url} target="_blank" rel="noopener noreferrer" className="group block min-w-0" style={{ textDecoration: "none", color: "inherit" }}>
      <span className="flex aspect-[2.2/1] items-center justify-center overflow-hidden rounded-lg border border-line bg-inset">{pic}</span>
      <span className="mt-2 block text-[15px] font-medium">{name}</span>
      <span className="block text-[14px] text-ink2 group-hover:underline">
        {page}
        {e.where && `・${e.where}`} ↗
      </span>
      {e.onCount > 1 && <span className="block text-[14px] text-ink3">{e.onCount === pages.filter((p) => p.readable).length ? "檢查的每一頁都有" : `共 ${e.onCount} 頁有`}</span>}
      {e.detail && <span className="block break-all text-[14px] text-ink3">{e.detail}</span>}
    </a>
  );
}

function WcagCard({ item, pages }: { item: WcagItem; pages: WcagReport["pages"] }) {
  const first = item.examples.slice(0, 3);
  const rest = item.examples.slice(3);
  const [problem, todo] = SAY[item.key] ?? [item.name, item.fix];
  return (
    <div className={`rounded-xl border border-line bg-card p-6 ${item.examples.length > 1 ? "col-span-2" : ""}`}>
      <div className="flex items-center gap-3 text-ink">
        {PIC[item.key]}
        <div className="min-w-0">
          <p className="text-[18px] font-bold">{problem}</p>
          <p className="text-[15px] text-ink2">請工程師：{todo}</p>
        </div>
      </div>
      <div className={`mt-5 grid gap-5 ${item.examples.length > 2 ? "grid-cols-3" : item.examples.length === 2 ? "grid-cols-2" : ""}`}>
        {first.map((e, i) => (
          <Example key={i} e={e} item={item} pages={pages} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="mt-5 border-t border-line pt-4">
          <summary className="cursor-pointer text-[15px] font-semibold text-ink2 hover:text-ink">看全部（還有 {rest.length} 個）</summary>
          <div className="mt-4 grid grid-cols-3 gap-5">
            {rest.map((e, i) => (
              <Example key={i} e={e} item={item} pages={pages} />
            ))}
          </div>
          {!!item.more && <p className="mt-3 text-[14px] text-ink3">另有 {item.more} 個類似的沒列出來</p>}
        </details>
      )}
    </div>
  );
}

function ScanLine({ scan }: { scan: WcagScan }) {
  const skipped = Object.entries(scan.skipped).filter(([, n]) => n > 0);
  const running = scan.status === "running";
  return (
    <div className="rounded-xl border border-line bg-card px-5 py-4 text-[15px] text-ink" role="status">
      <p className="font-semibold">
        {running ? `檢查中：${scan.done}／${scan.total} 頁，可以先去看別頁` : scan.status === "stopped" ? `對方網站開始擋，查到第 ${scan.done} 頁就停了，其他頁沒查到` : `全站查完，共 ${scan.done} 頁`}
      </p>
      {running && (
        <div className="progress-track mt-2">
          <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((scan.done / Math.max(1, scan.total)) * 100))}%` }} />
        </div>
      )}
      {skipped.length > 0 && <p className="mt-1 text-[14px] text-ink2">沒查的：{skipped.map(([k, n]) => `${k} ${n}`).join("、")}</p>}
      {scan.unreadable > 0 && <p className="mt-1 text-[14px] text-ink2">有 {scan.unreadable} 頁讀不到，不算通過</p>}
      {scan.capped && <p className="mt-1 text-[14px] text-ink2">網站很大，只查前 1,000 頁</p>}
    </div>
  );
}

export function SiteHealth({ ai, jobId, initial: saved, active, onDone }: { ai: AiAccess; jobId: string | null; initial?: WcagReport | null; active: boolean; onDone: (r: WcagReport) => void }) {
  const initial = saved?.v === WCAG_VERSION ? saved : null;
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const need = active && !!jobId && (!initial || initial.scan?.status === "running");
  useEffect(() => {
    if (!need) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      try {
        const r = await fetch("/api/geo/wcag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
        const d = (await r.json()) as { wcag?: WcagReport | null; error?: string };
        if (!alive) return;
        if (d.wcag) onDone(d.wcag);
        if (d.error) return setError(d.error);
        if (d.wcag && d.wcag.scan?.status !== "running") return;
      } catch {
        // 斷線就下次再問
      }
      if (alive) timer = setTimeout(ask, 4000);
    };
    void ask();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone 每次 render 都是新的，只在需要檢查時跑
  }, [need, jobId, tries]);

  const { answer, shut, unknown, mark } = accessOf(ai);
  const llms = llmsOf(ai);
  const readable = initial?.pages.some((p) => p.readable) ?? false;
  const items = readable ? initial!.items : [];
  const fails = items.filter((i) => i.bad > 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatTile icon={Icon.robot} value={mark === "ok" ? "進得來" : mark === "fail" ? "被擋" : "?"} label="回答客人的 AI" tone={mark} note={mark === "ok" ? answer.map((r) => ANSWER_BOTS[r.ua]).join("、") : mark === "fail" ? shut.map((r) => ANSWER_BOTS[r.ua]).join("、") : unknown.length > 0 ? "讀不到設定，無法判定" : "無法判定"} />
        <StatTile icon={Icon.map} value={llms === "unknown" ? "?" : llms === "ok" ? "有" : "沒有"} label="給 AI 的網站導覽" tone={llms} note={llms === "warn" ? "非必要" : undefined} />
        <StatTile icon={Icon.people} value={items.length > 0 ? (fails.length > 0 ? `${fails.length} 個問題` : "沒發現問題") : initial ? "?" : "…"} label="無障礙" tone={items.length === 0 ? "unknown" : fails.length > 0 ? "warn" : "ok"} note={items.length > 0 ? undefined : initial ? "讀不到網站內容" : error || !jobId ? "還沒檢查" : "檢查中"} />
      </div>
      <AiLines a={ai} />
      {fails.length > 0 ? (
        <div>
          <h3 className="mb-3 text-[16px] font-bold text-ink">無障礙</h3>
          <div className="grid grid-cols-2 gap-4">
            {[...fails].sort((a, b) => Number(b.examples.length > 1) - Number(a.examples.length > 1)).map((i) => (
              <WcagCard key={i.key} item={i} pages={initial!.pages} />
            ))}
          </div>
        </div>
      ) : (
        <Group title="無障礙">
          {items.length > 0 ? (
            <Line mark="ok" title="檢查的項目沒發現問題" />
          ) : (
            <p className="border-t border-line px-5 py-4 text-[15px] text-ink2" role="status">
              {initial ? "? 讀不到網站內容，無法判定。可能是網站擋住檢測，或內容要在瀏覽器執行才會出現。" : !jobId ? "這份報告沒有存檔，無法檢查。" : error || "正在檢查首頁，約 30 秒後先出結果，其他頁在背景繼續查…"}
              {!initial && error && (
                <button type="button" className="ml-3 underline" onClick={() => { setError(""); setTries((n) => n + 1); }}>
                  再試一次
                </button>
              )}
            </p>
          )}
        </Group>
      )}
      {initial?.scan && readable && <ScanLine scan={initial.scan} />}
      {initial && readable && (
        <details className="rounded-xl border border-line bg-card px-5 py-4">
          <summary className="cursor-pointer text-[15px] font-semibold text-ink2 hover:text-ink">檢查了哪些網頁、哪些項目</summary>
          <div className="mt-3 grid grid-cols-2 gap-6 text-[15px]">
            <ul className="max-h-[420px] space-y-1 overflow-y-auto">
              {initial.pages.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="report-table-link">
                    {p.readable ? pageLabel(p.url, initial.pages) : p.url} ↗
                  </a>
                  {!p.readable && <span className="text-ink3">（讀不到）</span>}
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-ink">
              {items.map((i) => (
                <li key={i.key}>
                  <span className={`mr-2 font-bold ${i.bad > 0 ? "text-fail" : i.checked === 0 ? "text-ink3" : "text-ok"}`}>{i.bad > 0 ? "✗" : i.checked === 0 ? "—" : "✓"}</span>
                  {CHECKS[i.key] ?? i.name}
                  {i.checked === 0 && <span className="text-ink3">（網頁上沒有）</span>}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      <p className="text-[14px] leading-relaxed text-ink3">
        用程式檢查（WCAG 2.2）。{MANUAL_ITEMS.slice(0, 2).join("、")}等要人工看，不等於取得無障礙標章。
      </p>
    </div>
  );
}
