// 「AI 看不看得到你的網站」第一眼：四張大數字卡（11-13 小積木：去技術話、用圖示圖表）。
// 機器人名稱、robots.txt、原始文字、Content-Signal 原文、llms.txt 內容都收進下面的「技術細節」。

import { Icon, StatTile, type TileTone } from "./StatTile";

interface Props {
  bots: { status: string }[];
  visibility: {
    status: "ok" | "thin" | "empty";
    textLength: number;
    substantiveChars: number;
    title: string;
    description: string;
    h1: string[];
    leadParagraphs: string[];
  } | null;
  signals: { declared: boolean; items: { key: string; value: "yes" | "no" | "unset" }[] } | null;
  llms: {
    exists: boolean | null;
    quality: { status: "thin" | "ok"; title: string; summary: string; links: { text: string; url: string; description: string }[] } | null;
  };
}

export function CrawlerTiles({ bots, visibility, signals, llms }: Props) {
  const total = bots.length;
  const blocked = bots.filter((b) => b.status === "blocked").length;
  const unknown = bots.filter((b) => b.status === "unknown").length;
  const open = total - blocked - unknown;
  const accessTone: TileTone = unknown > 0 ? "unknown" : blocked === 0 ? "ok" : blocked >= 4 ? "fail" : "warn";

  const readTone: TileTone = !visibility ? "unknown" : visibility.status === "ok" ? "ok" : visibility.status === "thin" ? "warn" : "fail";

  // 沒表態＝預設允許（大多數網站都沒寫），不算問題
  const aiInput = signals?.items.find((i) => i.key === "ai-input")?.value ?? "unset";
  const citeTone: TileTone = aiInput === "no" ? "fail" : "ok";

  const links = llms.quality?.links.length ?? 0;
  const llmsTone: TileTone = llms.exists === null ? "unknown" : !llms.exists ? "warn" : llms.quality?.status === "ok" ? "ok" : "warn";

  const lead = (visibility?.leadParagraphs ?? []).filter((p) => p.trim().length >= 8).slice(0, 5);
  const shownLinks = llms.quality?.links.slice(0, 8) ?? [];
  const moreLinks = llms.quality?.links.slice(8) ?? [];

  return (
    <div className="space-y-5">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        icon={Icon.robot}
        value={unknown > 0 ? "?" : `${open}/${total}`}
        label="AI 進得來"
        tone={accessTone}
        note={unknown > 0 ? "讀不到設定，無法判定" : blocked === 0 ? "沒有擋任何 AI" : `${blocked} 家 AI 被擋在外面`}
        desc={`ChatGPT、Gemini、Claude、Perplexity 這些 AI 會派程式來讀網站。我們測了 ${total} 家，被擋在門外的 AI 讀不到你，回答時就不可能提到你。`}
      />
      <StatTile
        icon={Icon.page}
        value={!visibility ? "?" : visibility.status === "ok" ? "讀得懂" : visibility.status === "thin" ? "偏少" : "空白"}
        label="AI 看得懂你的首頁"
        tone={readTone}
        note={!visibility ? "讀不到首頁" : visibility.status === "ok" ? (visibility.description ? "標題、簡介、內文都讀得到" : "讀得到內文，但缺首頁簡介") : visibility.status === "thin" ? "AI 讀到的字偏少" : "AI 讀到一片空白"}
        desc="AI 不會看圖、也常不跑網頁程式，只讀得到文字。它讀到的內容就是它對你的第一印象，實際讀到什麼在下方。"
      />
      <StatTile
        icon={Icon.quote}
        value={aiInput === "no" ? "不允許" : "允許"}
        label="AI 可以引用你"
        tone={citeTone}
        note={aiInput === "unset" ? "沒特別設定，預設允許" : aiInput === "yes" ? "網站有明確允許" : "網站設定不讓 AI 引用"}
        desc="網站可以聲明「AI 能不能拿我的內容來回答問題」。設成不允許，AI 回答時就不會把你當參考來源。"
      />
      <StatTile
        icon={Icon.map}
        value={llms.exists === null ? "?" : llms.exists ? `${links} 頁` : "沒有"}
        label="給 AI 的網站導覽"
        tone={llmsTone}
        note={llms.exists === null ? "無法判定" : !llms.exists ? "目前沒有" : llms.quality?.status === "ok" ? "寫得完整" : "內容偏少"}
        desc={
          llms.exists
            ? "專門給 AI 看的網站目錄（llms.txt），告訴 AI 你有哪些重點頁。你列了哪些頁在下方。"
            : "專門給 AI 看的網站目錄（llms.txt），告訴 AI 你有哪些重點頁。沒有不會扣分，有的話 AI 比較快找到你的重點頁。"
        }
      />
    </div>

    {/* 11-13 小積木：「不是要講幾個字，是要說 AI 看到你的首頁寫了啥」「網頁導覽也是」 */}
    <div className="grid gap-5 lg:grid-cols-2">
      {visibility && (
        <div className="rounded-xl border-2 border-ink bg-card p-5">
          <p className="flex items-center gap-2 text-[16px] font-bold text-ink">
            <span className="h-5 w-5">{Icon.page}</span>AI 讀到你的首頁寫了什麼
          </p>
          <div className="mt-4 rounded-lg bg-[var(--limeTint)] px-4 py-3">
            <p className="text-[17px] font-bold text-ink">{visibility.title || "（首頁沒有寫標題）"}</p>
            {visibility.description ? (
              <p className="mt-1 text-[15px] leading-relaxed text-ink2">{visibility.description}</p>
            ) : (
              <p className="mt-1 text-[15px] font-semibold text-warn">! 首頁沒有寫簡介，AI 只能自己從內文猜你在做什麼</p>
            )}
          </div>
          {visibility.h1.length > 0 && (
            <p className="mt-3 text-[15px] text-ink">
              <span className="mr-2 text-[14px] text-ink3">大標題</span>
              {visibility.h1.join("、")}
            </p>
          )}
          {lead.length > 0 && (
            <>
              <p className="mt-3 text-[14px] text-ink3">頁面上的重點段落</p>
              <ul className="mt-1.5 space-y-1.5">
                {lead.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-ink2">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                    <span className="line-clamp-2">{p}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {llms.exists !== null && (
        <div className="rounded-xl border-2 border-ink bg-card p-5">
          <p className="flex items-center gap-2 text-[16px] font-bold text-ink">
            <span className="h-5 w-5">{Icon.map}</span>你給 AI 的網站導覽
          </p>
          {!llms.exists || !llms.quality ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink2">網站還沒有這份導覽。AI 要自己逛你的網站找重點頁，比較容易漏掉服務頁、價格頁。</p>
          ) : (
            <>
              {(llms.quality.title || llms.quality.summary) && (
                <div className="mt-4 rounded-lg bg-[var(--limeTint)] px-4 py-3">
                  {llms.quality.title && <p className="text-[17px] font-bold text-ink">{llms.quality.title}</p>}
                  {llms.quality.summary && <p className="mt-1 line-clamp-3 text-[15px] leading-relaxed text-ink2">{llms.quality.summary}</p>}
                </div>
              )}
              <p className="mt-3 text-[14px] text-ink3">列給 AI 的重點頁（共 {llms.quality.links.length} 頁）</p>
              <ul className="mt-1.5 space-y-1.5">
                {shownLinks.map((l) => (
                  <li key={l.url} className="flex gap-2 text-[15px] leading-relaxed">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                    <span className="min-w-0">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="report-table-link font-medium">
                        {l.text || l.url}
                      </a>
                      {l.description && <span className="text-ink2">：{l.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {moreLinks.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[14px] text-ink3 hover:text-ink">還有 {moreLinks.length} 頁</summary>
                  <ul className="mt-1.5 space-y-1 text-[14px]">
                    {moreLinks.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="report-table-link">
                          {l.text || l.url}
                        </a>
                        {l.description && <span className="text-ink2">：{l.description}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
