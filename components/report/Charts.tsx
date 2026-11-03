"use client";

// ── 報告圖表（recharts）────────────────────────────────────
// 2026-11-03 小積木：要像 Power BI 那樣的正式圖表（座標軸、格線、滑鼠移上去有數值）。
// 色盤（dataviz validate_palette.js 驗過，CVD 安全）：
//   三家 AI ＝ 藍 #2a78d6／綠 #1baf7a／紫 #6250d6（固定順序，跟著 AI 走，不跟名次）
//   你 ＝ 品牌金；對手 ＝ 灰（焦點＋背景）；正面 ＝ 綠、負面 ＝ 紅（另帶 ✓ ✗ 符號）
// 綠色對白底只有 2.74:1，所以每張圖都有圖例＋滑鼠提示，不靠顏色單獨辨識。

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";

const intTicks = (max: number) => Array.from({ length: max + 1 }, (_, i) => i).filter((i) => max <= 6 || i % Math.ceil(max / 6) === 0 || i === max);

export const ENGINE_COLORS: Record<string, string> = {
  Perplexity: "#2a78d6",
  ChatGPT: "#1baf7a",
  "Google AI 摘要": "#6250d6",
};
const FALLBACK = ["#2a78d6", "#1baf7a", "#6250d6"];
export const engineColor = (e: string, i: number) => ENGINE_COLORS[e] ?? FALLBACK[i % FALLBACK.length];
export const SELF = "#fcb418";
export const RIVAL = "#8f99ab";
const GRID = "#e6e8ee";
const TICK = { fontSize: 14, fill: "#5f6a80" };
const POS = "#1f7a4d";
const NEG = "#b8342c";

// 圖例文字一律用文字色，不染系列色（綠色字對白底太淡）；順序跟著系列，不要字母排序
const legendProps = {
  wrapperStyle: { fontSize: 14 },
  itemSorter: null,
  formatter: (v: string) => <span style={{ color: "#4a5468" }}>{v}</span>,
} as const;

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: "1px solid #dcdfe6", fontSize: 14, boxShadow: "0 4px 12px rgba(48,60,84,.12)" },
  labelStyle: { color: "#303c54", fontWeight: 700 },
  itemStyle: { color: "#303c54" },
  cursor: { fill: "rgba(48,60,84,.05)" },
};

// 品牌 × 三家 AI：分組直條
export function BrandEngineColumns({
  rows,
  engines,
}: {
  rows: { name: string; isSelf: boolean; byEngine: Record<string, number> | null }[];
  engines: string[];
}) {
  const data = rows.map((r) => ({ name: r.isSelf ? `${r.name}（你）` : r.name, ...Object.fromEntries(engines.map((e) => [e, r.byEngine?.[e] ?? 0])) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v} 次`, undefined]} />
        <Legend {...legendProps} iconType="circle" />
        {engines.map((e, i) => (
          <Bar key={e} dataKey={e} fill={engineColor(e, i)} maxBarSize={22} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// 品牌被推薦總次數：橫條，你＝金、其他＝灰
export function BrandTotalBars({ rows, total }: { rows: { name: string; isSelf: boolean; count: number }[]; total: number }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 38 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, total]} ticks={intTicks(total)} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v}/${total} 次回答`, "被推薦"]} />
        <Bar dataKey="count" maxBarSize={20} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 14, fill: "#4a5468" }}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.isSelf ? SELF : RIVAL} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 聲量佔比：甜甜圈（圖例自己畫在右邊，recharts 的右側圖例會把圓餅擠壞）
export function SovDonut({ rows }: { rows: { name: string; isSelf: boolean; count: number }[] }) {
  const top = rows.slice(0, 5);
  const restN = rows.slice(5).reduce((n, r) => n + r.count, 0);
  const shades = ["#303c54", "#5f6a80", "#8f99ab", "#b9c0cc", "#d4d8e0"];
  let k = 0;
  const data = [
    ...top.map((r) => ({ name: r.name, value: r.count, color: r.isSelf ? SELF : shades[Math.min(k++, 4)] })),
    ...(restN > 0 ? [{ name: "其他", value: restN, color: "#eceef2" }] : []),
  ];
  const sum = data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="h-[240px] w-[240px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={108} paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v} 次（${Math.round((Number(v) / sum) * 100)}%）`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-[14px]">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color, outline: d.color === "#eceef2" ? "1px solid #dcdfe6" : undefined }} />
            <span className="min-w-0 flex-1 truncate text-ink2">{d.name}</span>
            <span className="mono text-ink3 tabular-nums">{Math.round((d.value / Math.max(1, sum)) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 每一題：你被推薦的次數，依 AI 堆疊。橫條，題目整句寫在左邊（小積木：不講問題是啥誰知道）
function WrapTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props;
  const text = payload?.value ?? "";
  const per = 17;
  const lines: string[] = [];
  for (let i = 0; i < text.length && lines.length < 3; i += per) lines.push(text.slice(i, i + per));
  if (text.length > per * 3) lines[2] = lines[2].slice(0, per - 1) + "…";
  const dy = -((lines.length - 1) * 18) / 2;
  return (
    <text x={x - 8} y={y + dy} textAnchor="end" fontSize={14} fill="#303c54">
      {lines.map((l, i) => (
        <tspan key={i} x={x - 8} dy={i === 0 ? 5 : 18}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export function QuestionStacked({
  questions,
  engines,
}: {
  questions: { label: string; full: string; byEngine: Record<string, { named: number; total: number }> }[];
  engines: string[];
}) {
  const data = questions.map((q) => ({ name: q.label, full: q.full, ...Object.fromEntries(engines.map((e) => [e, q.byEngine[e]?.named ?? 0])) }));
  const max = Math.max(1, ...questions.map((q) => engines.reduce((n, e) => n + (q.byEngine[e]?.total ?? 0), 0)));
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, questions.length * 78 + 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, max]} ticks={intTicks(max)} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={290} tick={<WrapTick />} tickLine={false} axisLine={false} interval={0} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`推薦你 ${v} 次`, undefined]} />
        <Legend {...legendProps} iconType="circle" />
        {engines.map((e, i) => (
          <Bar key={e} dataKey={e} stackId="s" fill={engineColor(e, i)} maxBarSize={26} stroke="#fff" strokeWidth={2} radius={i === engines.length - 1 ? [0, 4, 4, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// 輿情：分向橫條（缺點往左、好話往右）
export function SentimentDiverging({ themes }: { themes: { theme: string; polarity: "positive" | "negative"; count: number }[] }) {
  const data = themes.map((t) => ({ name: t.theme, value: t.polarity === "positive" ? t.count : -t.count, pos: t.polarity === "positive" }));
  const m = Math.max(1, ...themes.map((t) => t.count));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[-m, m]} ticks={Array.from({ length: 2 * m + 1 }, (_, i) => i - m)} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.abs(v)}`} />
        <YAxis type="category" dataKey="name" width={230} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${Math.abs(Number(v))} 段回答`, Number(v) >= 0 ? "✓ 好話" : "✗ 缺點"]} />
        <Bar dataKey="value" maxBarSize={18} radius={4}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.pos ? POS : NEG} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 引用來源組成：矩形樹圖
export function SourceTreemap({ data }: { data: { name: string; size: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        stroke="#fff"
        isAnimationActive={false}
        content={(props: { x?: number; y?: number; width?: number; height?: number; name?: string; size?: number; color?: string; index?: number }) => {
          const { x = 0, y = 0, width = 0, height = 0, name, size, index = 0 } = props;
          const color = data[index]?.color ?? RIVAL;
          const dark = color === "#303c54" || color === "#5f6a80" || color === "#8f99ab";
          return (
            <g>
              <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={2} rx={4} />
              {width > 70 && height > 40 && (
                <>
                  <text x={x + 10} y={y + 24} fontSize={15} fontWeight={700} stroke="none" fill={dark ? "#fff" : "#303c54"}>
                    {name}
                  </text>
                  <text x={x + 10} y={y + 44} fontSize={14} stroke="none" fill={dark ? "#fff" : "#303c54"}>
                    {size} 次
                  </text>
                </>
              )}
            </g>
          );
        }}
      >
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v} 次引用`, undefined]} />
      </Treemap>
    </ResponsiveContainer>
  );
}

// 你 vs 對手：各家 AI 分組橫條
export function SelfVsRival({ engines, self, rival, rivalName, totals }: { engines: string[]; self: Record<string, number>; rival: Record<string, number>; rivalName: string; totals: Record<string, number> }) {
  const data = engines.map((e) => ({ name: e, 你: self[e] ?? 0, [rivalName]: rival[e] ?? 0, total: totals[e] }));
  const max = Math.max(1, ...engines.map((e) => totals[e] ?? 0));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, max]} ticks={intTicks(max)} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={120} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v} 次`, undefined]} />
        <Legend {...legendProps} iconType="square" />
        <Bar dataKey="你" fill={SELF} maxBarSize={18} radius={[0, 4, 4, 0]} />
        <Bar dataKey={rivalName} fill="#5f6a80" maxBarSize={18} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
