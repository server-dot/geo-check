"use client";

// ── 競爭對手分析：市場定位圖 ───────────────────────────────
// 11-18 小積木：SWOT「感覺不太好」、矩陣「不太適合」、縱軸用被推次數的象限圖「好醜而且完全用不到」。
// 兩個軸都看 AI 怎麼描述每一家（lib/geo-rival-map.ts 依產業挑軸，每個位置都附 AI 原話），不用任何次數。
// 第一眼看：誰跟你站在同一區（真正的對手）、哪一區沒人（可以主打的位置）。點一家看 AI 原話。

import { useId, useState } from "react";

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
export interface RivalMapLike {
  v?: number;
  missing?: string[];
  product?: string;
  x: AxisLike;
  y: AxisLike;
  self: { x: number; y: number; why: string; url?: string; type?: string; dims?: (DimLike | null)[]; off?: boolean };
  points: { name: string; x: number; y: number; type: string; quote: string; url?: string; dims?: (DimLike | null)[] }[];
  axes?: AxisLike[];
}
interface DimLike {
  v: number;
  why: string;
  label?: string;
  url?: string;
}

const Dot = ({ me }: { me?: boolean }) => <span aria-hidden="true" className={`inline-block h-[12px] w-[12px] shrink-0 rounded-full ${me ? "border-[1.5px] border-[var(--goldInk)] bg-lime" : "bg-ink"}`} />;
const num = (d?: DimLike | null) => Number(d?.label?.match(/[\d,]+(?= (元|個))/)?.[0].replace(/,/g, "") ?? 0);

// 一句話：單價是它的幾倍、通路差幾個
function brief(me?: (DimLike | null)[], it?: (DimLike | null)[], name = ""): string {
  const [p0, p1] = [num(me?.[0]), num(it?.[0])];
  const [c0, c1] = [num(me?.[1]), num(it?.[1])];
  const out: string[] = [];
  if (p0 && p1) out.push(Math.abs(p0 - p1) / p1 < 0.1 ? `單價跟${name}差不多` : p0 > p1 ? `單價是${name}的 ${(p0 / p1).toFixed(1)} 倍` : `單價比${name}低 ${Math.round((1 - p0 / p1) * 100)}%`);
  if (c0 && c1) out.push(c0 === c1 ? "通路數一樣" : c0 > c1 ? `通路多 ${c0 - c1} 個` : `通路少 ${c1 - c0} 個`);
  return out.join("，") + (out.length ? "。" : "");
}

// 長條圖：由高到低；點一家就換比較對象
function Bars({ title, sub, k, map, selfName, pick, onPick }: { title: string; sub: string; k: number; map: RivalMapLike; selfName: string; pick: string; onPick: (n: string) => void }) {
  const rows = [{ name: "__self", d: map.self.dims?.[k] }, ...map.points.map((p) => ({ name: p.name, d: p.dims?.[k] }))].filter((r) => r.d).sort((a, b) => num(b.d) - num(a.d));
  const max = Math.max(...rows.map((r) => num(r.d)), 1);
  return (
    <div className="rounded-[10px] border border-line bg-card p-4">
      <p className="text-[16px] font-bold text-ink">
        {title}
        <span className="ml-2 text-[13px] font-normal text-ink3">{sub}</span>
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const me = r.name === "__self";
          const on = r.name === pick;
          return (
            <li key={r.name}>
              <button type="button" disabled={me} onClick={() => onPick(r.name)} title={r.d!.why} className="grid w-full grid-cols-[8.5em_1fr_4.2em] items-center gap-2 text-left text-[14px]">
                <span className={`flex min-w-0 items-center gap-1.5 ${me ? "font-bold text-[var(--goldInk)]" : on ? "font-bold text-ink" : "text-ink2"}`}>
                  {(me || on) && <Dot me={me} />}
                  <span className="truncate">{me ? selfName : shortName(r.name)}</span>
                </span>
                <span className="h-4">
                  <span className={`block h-full rounded ${me ? "bg-lime" : on ? "bg-ink" : "bg-[#b9c0cc]"}`} style={{ width: `${Math.max(4, (num(r.d) / max) * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums text-ink">
                  {num(r.d)} {k === 0 ? "元" : "個"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
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
  if (m.v === 3) return m; // 新做法是實際數字換算的位置，照原位置畫
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
  const clip = useId(); // 總覽縮圖和這頁各有一張，id 不能一樣
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
        clipPath={`url(#${clip})`}
      />
      <clipPath id={clip}>
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

// 總覽用的縮圖：同一張定位圖，不帶右邊的逐軸對比；點哪一家都是去完整頁
export function RivalMapMini({ names, rivalMap, onOpen }: { names: NameLike[]; rivalMap: RivalMapLike; onOpen: () => void }) {
  const selfName = shortName(names.find((n) => n.isSelf)?.name ?? "你");
  return <Plot map={spreadOut(rivalMap)} selfName={selfName} pick="" onPick={onOpen} />;
}

function Renew({ text, jobId, onDone, done }: { done?: boolean; text: string; jobId: string | null; onDone: (m: RivalMapLike) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/geo/rival-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
      const d = (await res.json()) as { rivalMap?: RivalMapLike; error?: string };
      if (!res.ok || !d.rivalMap) throw new Error(d.error || "分析失敗，請稍後再試。");
      onDone(d.rivalMap);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "分析失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-[10px] border border-line bg-card p-5 text-[15px] text-ink2">
      <p>{text}</p>
      {jobId && !done && (
        <button type="button" onClick={go} disabled={busy} className="mt-3 rounded-lg bg-ink px-4 py-2 font-semibold text-paper disabled:opacity-50">
          {busy ? "重新分析中，約 30 秒…" : "用新做法重新分析"}
        </button>
      )}
      {err && <p className="mt-2 text-fail">✗ {err}</p>}
    </div>
  );
}

export function CompetitorCompare({
  names,
  rivalMap,
  jobId,
  onRenew,
}: {
  names: NameLike[];
  questions?: { question: string; results: ResultLike[] }[];
  rivalMap?: RivalMapLike | null;
  jobId: string | null;
  onRenew: (m: RivalMapLike) => void;
}) {
  const selfName = shortName(names.find((n) => n.isSelf)?.name ?? "你");
  const fresh = rivalMap?.v === 3;
  const map = rivalMap && fresh ? spreadOut(rivalMap) : null;
  // 跟你同一區的（兩個軸都同一邊）就是正面對手，先給人看最近的那家
  // 離你最近的＝距離 NEAR 以內、最多 3 家（你剛好在中線上時，用象限判斷會變成「沒有」）
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - map!.self.x, p.y - map!.self.y);
  // 最近的那一家一定列；其他在 NEAR 以內的才列
  const same = map ? [...map.points].sort((a, b) => near(a) - near(b)).filter((p, i) => i === 0 || near(p) <= NEAR).slice(0, 3) : [];
  const dist = (p: { x: number; y: number }) => (map ? Math.hypot(p.x - map.self.x, p.y - map.self.y) : 0);
  const first = [...(same.length ? same : map?.points ?? [])].sort((a, b) => dist(a) - dist(b))[0];
  const [pick, setPick] = useState(first?.name ?? "");

  if (rivalMap && !fresh)
    return <Renew jobId={jobId} onDone={onRenew} text="這份定位是舊做法（AI 打分數），位置可能不對，已停用。" />;
  if (map && map.points.length < 3)
    return <Renew jobId={jobId} onDone={onRenew} text="不畫定位圖：這個行業沒有容量可以換算單價，或查得到售價的同業不到 3 家。下面是 AI 的文字比較。" done />;
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

        <div className="space-y-4">
          {[0, 1].map((k) => (
            <Bars key={k} title={k === 0 ? "單價" : "買得到的通路"} sub={k === 0 ? `${map.product ?? ""}，每 100ml` : "購物搜尋看得到的"} k={k} map={map} selfName={selfName} pick={cur.name} onPick={setPick} />
          ))}
          <div className="rounded-[10px] border border-line bg-card p-4">
            <p className="flex flex-wrap items-center gap-x-2 text-[16px] font-bold">
              <Dot me />
              <span className="text-[var(--goldInk)]">{selfName}</span>
              <span className="font-normal text-ink3">vs</span>
              <Dot />
              <span className="text-ink">{cur.name}</span>
            </p>
            <p className="mt-2 text-[15px] text-ink2">{brief(map.self.dims, cur.dims, shortName(cur.name))}</p>
          </div>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-ink3">
        只比 AI 這次推過的同類業者。
        {map.product && `價格是「${map.product}」單品換算每 100ml（或 100g），取購物搜尋各通路的中間價，不含組合；促銷會變動。通路是購物搜尋看得到的，不代表全部。`}
        {map.missing && map.missing.length > 0 && `查不到足夠資料、沒畫的：${map.missing.map(shortName).join("、")}。`}
      </p>
    </div>
  );
}
