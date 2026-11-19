"use client";

// ── 競爭對手分析：市場定位圖 ───────────────────────────────
// 11-18 小積木：SWOT「感覺不太好」、矩陣「不太適合」、縱軸用被推次數的象限圖「好醜而且完全用不到」。
// 兩個軸都看 AI 怎麼描述每一家（lib/geo-rival-map.ts 依產業挑軸，每個位置都附 AI 原話），不用任何次數。
// 第一眼看：誰跟你站在同一區（真正的對手）、哪一區沒人（可以主打的位置）。點一家看 AI 原話。

import { useState } from "react";

interface ResultLike {
  answer?: string;
}
interface NameLike {
  name: string;
  isSelf: boolean;
  answers?: number[];
}
interface AxisLike {
  low: string;
  high: string;
}
interface RivalMapLike {
  x: AxisLike;
  y: AxisLike;
  self: { x: number; y: number; why: string; url?: string; type?: string; dims?: (DimLike | null)[] };
  points: { name: string; x: number; y: number; type: string; quote: string; url?: string; dims?: (DimLike | null)[] }[];
  axes?: AxisLike[];
}
interface DimLike {
  v: number;
  why: string;
}

// 一條軸上你（金）跟它（深）的位置，-2～2
function Track({ a, me, it }: { a: AxisLike; me: DimLike | null; it: DimLike | null }) {
  const pos = (v: number) => `${((v + 2) / 4) * 100}%`;
  return (
    <div>
      <div className="flex justify-between text-[12.5px] text-ink3">
        <span>{a.low}</span>
        <span>{a.high}</span>
      </div>
      <div className="relative mt-1.5 h-[10px]">
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded bg-line" />
        {/* 同一格時兩點錯開一點，不然它被你蓋住 */}
        {it && (
          <span
            className="absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
            style={{ left: me && me.v === it.v ? `calc(${pos(it.v)} + 9px)` : pos(it.v) }}
          />
        )}
        {me && (
          <span className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[var(--goldInk)] bg-lime" style={{ left: it && me.v === it.v ? `calc(${pos(me.v)} - 9px)` : pos(me.v) }} />
        )}
      </div>
      <dl className="mt-1.5 grid grid-cols-[2.2em_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 text-[13.5px] leading-snug">
        <dt className="font-bold text-[var(--goldInk)]">你</dt>
        <dd className="text-ink2">{me?.why || "—"}</dd>
        <dt className="font-bold text-ink">它</dt>
        <dd className="text-ink2">{it?.why || "—"}</dd>
      </dl>
    </div>
  );
}

const shortName = (n: string) => {
  const s = n.split(/[（(／/]/)[0].trim();
  const head = s.split(" ")[0];
  return s.length > 8 && head.length >= 2 && /[\u4e00-\u9fff]/.test(head) ? head : s;
};

// AI 給分很極端（大多 ±2、±1.5），照原分數畫會全擠在四個角（11-18 小積木：「為何還是很偏激」）。
// 改成照順序平均攤開：每個軸上把出現過的分數由小到大排，等距放；順序不變、同分的還是同一個位置。
// 圖上看的是「各家互相比誰比較偏哪邊」，不是絕對分數。
function spreadOut(m: RivalMapLike): RivalMapLike {
  const rank = (vs: number[]) => {
    const u = [...new Set(vs)].sort((a, b) => a - b);
    return (v: number) => (u.length < 2 ? 0 : -1.6 + (3.2 * u.indexOf(v)) / (u.length - 1));
  };
  const rx = rank([m.self.x, ...m.points.map((p) => p.x)]);
  const ry = rank([m.self.y, ...m.points.map((p) => p.y)]);
  return { ...m, self: { ...m.self, x: rx(m.self.x), y: ry(m.self.y) }, points: m.points.map((p) => ({ ...p, x: rx(p.x), y: ry(p.y) })) };
}

const NEAR = 1.2; // 「離你最近」的半徑（攤開後的座標）
const SIZE = 460; // 圖的高（viewBox）；寬多留右邊給最右排的名字
const W = SIZE + 120;
const PAD = 48;

function Plot({ map, selfName, pick, onPick }: { map: RivalMapLike; selfName: string; pick: string; onPick: (n: string) => void }) {
  const inner = SIZE - PAD * 2;
  // 分數 ±2 的點不要壓在框線上（會跟軸的文字疊在一起），內縮 22
  const IN = 22;
  const px = (v: number) => PAD + IN + ((v + 2) / 4) * (inner - IN * 2);
  const py = (v: number) => PAD + IN + ((2 - v) / 4) * (inner - IN * 2);
  // 圓點一律畫在真正的位置；只有名字避讓：跟已經放好的名字重疊就上下挪，挪過的拉一條細線回圓點
  const GAP = 17;
  const textW = (t: string) => [...t].reduce((w, ch) => w + (/[\u0000-\u00ff]/.test(ch) ? 7 : 12.5), 0);
  const all = [{ name: "__self", x: map.self.x, y: map.self.y }, ...map.points]
    .map((p) => ({ ...p, cx: px(p.x), cy: py(p.y), ly: py(p.y), w: textW(p.name === "__self" ? selfName : shortName(p.name)) + 16 }))
    .sort((a, b) => a.cy - b.cy || (a.name === "__self" ? -1 : 1) || a.cx - b.cx);
  const placed: { x1: number; x2: number; y: number }[] = [];
  const hits = (cx: number, cy: number, w: number) => placed.some((p) => cx - 6 < p.x2 && cx + w > p.x1 && Math.abs(cy - p.y) < GAP - 1);
  for (const d of all) {
    const base = d.cy;
    let cy = base;
    for (let k = 1; hits(d.cx, cy, d.w) && k < 40; k++) cy = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * GAP;
    d.ly = Math.min(Math.max(cy, PAD - 8), SIZE - PAD + 8);
    placed.push({ x1: d.cx - 6, x2: d.cx + d.w, y: d.ly });
  }
  const dots = all;
  const mid = SIZE / 2;
  const axisText = "fill-[var(--ink3)] text-[12px]";
  return (
    <svg viewBox={`0 0 ${W} ${SIZE}`} className="mx-auto w-full max-w-[620px]" role="img" aria-label="市場定位圖">
      {/* 離你 NEAR 以內淡淡上色 */}
      <ellipse
        cx={px(map.self.x)}
        cy={py(map.self.y)}
        rx={(NEAR / 4) * (inner - IN * 2)}
        ry={(NEAR / 4) * (inner - IN * 2)}
        fill="var(--limeTint)"
        clipPath="url(#plot-clip)"
      />
      <clipPath id="plot-clip">
        <rect x={PAD} y={PAD} width={inner} height={inner} />
      </clipPath>
      <line x1={PAD} y1={mid} x2={SIZE - PAD} y2={mid} stroke="var(--line)" />
      <line x1={mid} y1={PAD} x2={mid} y2={SIZE - PAD} stroke="var(--line)" />
      <rect x={PAD} y={PAD} width={inner} height={inner} fill="none" stroke="var(--line)" />
      <text x={PAD} y={SIZE - PAD + 22} className={axisText}>← {map.x.low}</text>
      <text x={SIZE - PAD} y={SIZE - PAD + 22} textAnchor="end" className={axisText}>{map.x.high} →</text>
      <text x={PAD - 12} y={PAD} transform={`rotate(-90 ${PAD - 12} ${PAD})`} textAnchor="end" className={axisText}>{map.y.high} →</text>
      <text x={PAD - 12} y={SIZE - PAD} transform={`rotate(-90 ${PAD - 12} ${SIZE - PAD})`} className={axisText}>← {map.y.low}</text>
      {dots.map((d) => {
        const self = d.name === "__self";
        const on = d.name === pick;
        const label = self ? selfName : shortName(d.name);
        return (
          <g key={d.name} onClick={self ? undefined : () => onPick(d.name)} className={self ? "" : "cursor-pointer"}>
            <circle cx={d.cx} cy={d.cy} r={12} fill="transparent" />
            <circle
              cx={d.cx}
              cy={d.cy}
              r={self ? 7 : on ? 6 : 5}
              fill={self ? "var(--lime)" : on ? "var(--ink)" : "var(--gray)"}
              stroke={self ? "var(--goldInk)" : "none"}
              strokeWidth={1.5}
            />
            {d.ly !== d.cy && <line x1={d.cx + 4} y1={d.cy} x2={d.cx + 9} y2={d.ly} stroke="var(--line)" />}
            <text
              x={d.cx + 10}
              y={d.ly + 4}
              className={`text-[12.5px] ${self ? "fill-[var(--goldInk)] font-bold" : on ? "fill-[var(--ink)] font-bold" : "fill-[var(--ink2)]"}`}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function CompetitorCompare({
  names,
  rivalMap,
}: {
  names: NameLike[];
  questions?: { question: string; results: ResultLike[] }[];
  rivalMap?: RivalMapLike | null;
}) {
  const selfName = shortName(names.find((n) => n.isSelf)?.name ?? "你");
  const map = rivalMap ? spreadOut(rivalMap) : null;
  // 跟你同一區的（兩個軸都同一邊）就是正面對手，先給人看最近的那家
  // 離你最近的＝距離 NEAR 以內、最多 3 家（你剛好在中線上時，用象限判斷會變成「沒有」）
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - map!.self.x, p.y - map!.self.y);
  // 最近的那一家一定列；其他在 NEAR 以內的才列
  const same = map ? [...map.points].sort((a, b) => near(a) - near(b)).filter((p, i) => i === 0 || near(p) <= NEAR).slice(0, 3) : [];
  const dist = (p: { x: number; y: number }) => (map ? Math.hypot(p.x - map.self.x, p.y - map.self.y) : 0);
  const first = [...(same.length ? same : map?.points ?? [])].sort((a, b) => dist(a) - dist(b))[0];
  const [pick, setPick] = useState(first?.name ?? "");

  if (!map || !first)
    return (
      <p className="text-[15px] text-ink3">
        {rivalMap === undefined
          ? "這份報告是舊版，沒有市場定位圖；重新問一次 AI 就會有。"
          : "AI 這次推薦的業者大多只列了名字，沒有足夠的描述能判斷各家的定位，所以不畫圖。"}
      </p>
    );

  const cur = map.points.find((p) => p.name === pick) ?? first;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:items-start">
        <div className="rounded-[10px] border border-line bg-card p-3">
          <Plot map={map} selfName={selfName} pick={cur.name} onPick={setPick} />
        </div>

        <div className="rounded-[10px] border border-line bg-card p-4">
          <p className="text-[16px] font-bold text-ink">
            <span className="text-[var(--goldInk)]">{selfName}</span>
            <span className="mx-2 font-normal text-ink3">vs</span>
            {cur.name}
          </p>
          {/* 圖例：金點＝你、深點＝它，順便帶各自的類型 */}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[12px] w-[12px] rounded-full border-[1.5px] border-[var(--goldInk)] bg-lime" />
              <span className="font-bold text-[var(--goldInk)]">你</span>
              {map.self.type && <span className="text-ink3">{map.self.type}</span>}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-full bg-ink" />
              <span className="font-bold text-ink">它</span>
              {cur.type && <span className="text-ink3">{cur.type}</span>}
            </span>
          </div>
          {map.axes && cur.dims && map.self.dims ? (
            <div className="mt-3 space-y-4">
              {map.axes.map((a, k) => (
                <Track key={k} a={a} me={map.self.dims![k] ?? null} it={cur.dims![k] ?? null} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[15px] leading-relaxed text-ink2">AI 查到：{cur.quote}</p>
          )}
          <p className="mt-3 text-[13px] text-ink3">
            {same.length > 0 && <>離你最近：{same.map((p) => shortName(p.name)).join("、")}。</>}點圖上其他家換著比
            {cur.url && (
              <a href={cur.url} target="_blank" rel="noopener noreferrer" className="report-table-link ml-2">
                {shortName(cur.name)} 的資料來源 ↗
              </a>
            )}
          </p>
        </div>
      </div>
      <p className="text-[13px] text-ink3">只畫 AI 這次推過的業者（平台、通路不算）。兩個軸依你的產業挑，每家的位置是另外請 AI 上網查官網、價目、案例判斷的，圖上是各家互相比的相對位置；點一家看理由和來源。</p>
    </div>
  );
}
