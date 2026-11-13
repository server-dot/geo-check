// ── 大數字卡（跟積木官網那排數據卡同款：米白漸層、深藍粗框、線條圖示＋大數字）──────────
// 2026-11-13 小積木：「AI 爬蟲存取、引用來源沒人看得懂…盡量用圖示圖表來呈現，方便行銷人員跟客戶說明」。
// 一張卡只講一件事：圖示＋數字＋一行字；狀態一律「符號＋顏色＋文字」（金紅色盲下同色，不能只靠顏色）。

import type { ReactNode } from "react";

export type TileTone = "ok" | "warn" | "fail" | "unknown" | "self" | "plain";

const TONE_MARK: Record<TileTone, { mark: string; cls: string }> = {
  ok: { mark: "✓", cls: "text-ok" },
  warn: { mark: "!", cls: "text-warn" },
  fail: { mark: "✗", cls: "text-fail" },
  unknown: { mark: "?", cls: "text-ink3" },
  self: { mark: "", cls: "" },
  plain: { mark: "", cls: "" },
};

export function StatTile({
  icon,
  value,
  label,
  tone = "plain",
  note,
  desc,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  tone?: TileTone;
  note?: ReactNode;
  desc?: ReactNode; // 這張卡在講什麼、為什麼重要（白話一兩句；11-13 小積木：只有數字「誰看得懂」）
}) {
  const t = TONE_MARK[tone];
  const frame =
    tone === "fail" ? "border-fail" : tone === "self" ? "border-ink bg-lime" : "border-ink bg-gradient-to-b from-card to-[var(--limeTint)]";
  return (
    <div className={`relative flex flex-col items-center rounded-xl border-2 px-4 pt-5 pb-4 text-center ${frame} ${tone === "fail" ? "bg-card" : ""}`}>
      {t.mark && (
        <span className={`absolute top-2.5 right-3 text-[16px] font-bold ${t.cls}`} aria-label={tone === "ok" ? "正常" : tone === "fail" ? "有問題" : tone === "warn" ? "注意" : "無法判定"}>
          {t.mark}
        </span>
      )}
      <div className="h-10 w-10 text-ink">{icon}</div>
      <p className="mt-2 text-[30px] leading-none font-bold text-ink tabular-nums">{value}</p>
      <p className="mt-2 text-[15px] font-medium text-ink">{label}</p>
      {note && <p className={`mt-1.5 text-[14px] leading-snug ${tone === "fail" ? "text-fail font-semibold" : "text-ink2"}`}>{note}</p>}
      {desc && <p className="mt-3 border-t border-ink/15 pt-3 text-left text-[14px] leading-relaxed text-ink2">{desc}</p>}
    </div>
  );
}

// 線條圖示（24×24、stroke 1.6，跟官網那排 icon 同調）
const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
    {d}
  </svg>
);

export const Icon = {
  robot: svg(
    <>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5M2 12.5v2.5M22 12.5v2.5" />
      <circle cx="12" cy="3.5" r="1" />
    </>,
  ),
  page: svg(
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 11h6M9 14h6M9 17h4" />
    </>,
  ),
  quote: svg(
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M9 9.5c0-.8.6-1.5 1.5-1.5M14 9.5c0-.8.6-1.5 1.5-1.5M9 9.5v2M14 9.5v2" />
    </>,
  ),
  map: svg(
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>,
  ),
  home: svg(
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10M10 20v-5h4v5" />
    </>,
  ),
  people: svg(
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 14.6c2.5-.3 4.7 1 5.3 4" />
    </>,
  ),
  store: svg(
    <>
      <path d="M4 9l1.5-5h13L20 9" />
      <path d="M4 9c0 1.4 1.1 2.5 2.7 2.5S9.3 10.4 9.3 9c0 1.4 1.2 2.5 2.7 2.5S14.7 10.4 14.7 9c0 1.4 1.1 2.5 2.6 2.5S20 10.4 20 9M5.5 11.5V20h13v-8.5M10 20v-4.5h4V20" />
    </>,
  ),
  news: svg(
    <>
      <rect x="3" y="4" width="15" height="16" rx="1.5" />
      <path d="M18 8h3v10.5a1.5 1.5 0 0 1-3 0M6.5 8h8M6.5 11.5h8M6.5 15h5" />
    </>,
  ),
  chat: svg(
    <>
      <path d="M4 5h11v8H8l-4 3z" />
      <path d="M15 9h5v8l-3-2.5h-6V13" />
    </>,
  ),
  globe: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" />
    </>,
  ),
};
