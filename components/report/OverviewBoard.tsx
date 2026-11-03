"use client";

// ── 總覽：摘要牆 ───────────────────────────────────────────
// 2026-11-03 小積木：要更像儀表板、多一點圖表，但走自己的風格。
// 總覽是一面摘要牆：每張卡都是別頁的精華，右上角「看完整 →」跳到那一頁。
// 配色規則：你＝品牌金、對手＝深藍灰深淺、正面＝綠、負面＝紅（色盲下一律另帶符號）。

import type { ReactNode } from "react";
import { Ring, shortEngine, type BrandTable } from "./ReportOverview";

interface QuestionLike {
  question: string;
  altQuestion?: string;
  results: { engine: string; namedSelf?: boolean; citedSelf: boolean }[];
}

interface SentimentLike {
  themes: { theme: string; polarity: "positive" | "negative"; count: number }[];
  answerCount: number;
}

const RIVAL_SHADES = ["#303c54", "#4a5468", "#5f6a80", "#8f99ab", "#b9c0cc"];

export function Card({
  title,
  right,
  children,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(48,60,84,.06)] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-[15px] font-bold text-ink">{title}</p>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function GoLink({ label = "看完整", onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[14px] font-medium text-goldInk hover:underline">
      {label} →
    </button>
  );
}

function level(r: number): { text: string; cls: string } {
  if (r >= 0.6) return { text: "常被推薦", cls: "text-ok" };
  if (r >= 0.3) return { text: "有時被推薦", cls: "text-warn" };
  return { text: "很少被推薦", cls: "text-fail" };
}

function HBar({ value, max, color, label, right }: { value: number; max: number; color: string; label: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr_64px] items-center gap-3 py-1.5">
      <span className="truncate text-[14px] text-ink">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-inset">
        <div className="h-full rounded-full" style={{ width: `${(value / Math.max(1, max)) * 100}%`, background: color }} />
      </div>
      <span className="mono text-right text-[14px] text-ink2 tabular-nums">{right}</span>
    </div>
  );
}

export function OverviewBoard({
  table,
  questions,
  brandChecks,
  sentiment,
  selfCited,
  topRivalCited,
  onGo,
}: {
  table: BrandTable;
  questions: QuestionLike[];
  brandChecks: { engine: string; citedSelf: boolean }[];
  sentiment?: SentimentLike | null;
  selfCited: number;
  topRivalCited: { name: string; count: number } | null;
  onGo: (page: string) => void;
}) {
  const self = table.rows.find((r) => r.isSelf)!;
  const ratio = self.count / Math.max(1, table.total);
  const lv = level(ratio);
  const found = brandChecks.filter((b) => b.citedSelf).length;
  const rank = table.selfRank;

  // 問題 × AI 熱力格
  const cells = questions.map((q) =>
    table.engines.map((e) => {
      const rs = q.results.filter((r) => shortEngine(r.engine) === e);
      return { named: rs.filter((r) => r.namedSelf).length, total: rs.length };
    }),
  );
  // 最大的缺口：換了說法還是沒推你的（題目 × AI）
  let gap: { qi: number; engine: string; total: number } | null = null;
  cells.forEach((row, qi) =>
    row.forEach((c, ei) => {
      if (c.total > 0 && c.named === 0 && (!gap || c.total > gap.total)) gap = { qi, engine: table.engines[ei], total: c.total };
    }),
  );
  const g = gap as { qi: number; engine: string; total: number } | null;

  const top = table.rows.filter((r) => r.count > 0).slice(0, 6);
  let shade = 0;
  const colorOf = (isSelf: boolean) => (isSelf ? "var(--lime)" : RIVAL_SHADES[Math.min(shade++, RIVAL_SHADES.length - 1)]);
  const topColored = top.map((r) => ({ ...r, color: colorOf(r.isSelf) }));

  const pos = sentiment?.themes.filter((t) => t.polarity === "positive") ?? [];
  const neg = sentiment?.themes.filter((t) => t.polarity === "negative") ?? [];

  // 聲量佔比
  const sovRows = table.rows.filter((r) => r.count > 0);
  const sovSum = sovRows.reduce((n, r) => n + r.count, 0);
  const R = 50;
  const C = 2 * Math.PI * R;
  let off = 0;
  let sovShade = 0;
  const sovSegs = [
    ...sovRows.slice(0, 5).map((r) => ({ name: r.name, v: r.count, color: r.isSelf ? "var(--lime)" : RIVAL_SHADES[Math.min(sovShade++, 4)] })),
    ...(sovRows.length > 5 ? [{ name: "其他", v: sovRows.slice(5).reduce((n, r) => n + r.count, 0), color: "#e3e6ec" }] : []),
  ];

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* 主卡：AI 推薦你 */}
      <Card title="AI 推薦你嗎" right={<GoLink label="看每一題" onClick={() => onGo("questions")} />} className="col-span-6 row-span-2">
        <div className="flex items-center gap-6">
          <div className="relative h-[132px] w-[132px] shrink-0">
            <Ring part={self.count} whole={table.total} size={132} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[30px] font-bold leading-none text-ink tabular-nums">
                {self.count}
                <span className="text-[17px] font-normal text-ink3">/{table.total}</span>
              </span>
              <span className="mt-1 text-[14px] text-ink3">次回答</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[22px] font-bold ${lv.cls}`}>{lv.text}</p>
            <p className="mt-1 text-[14px] text-ink3">
              {new Set(table.flat.map((f) => f.qi)).size} 個推薦題、{table.engines.length} 家 AI，大約每 {Math.max(1, Math.round(1 / Math.max(ratio, 0.01)))} 次回答有 1 次推你
            </p>
            <div className="mt-3">
              {table.engines.map((e) => (
                <HBar
                  key={e}
                  label={e}
                  value={self.byEngine?.[e] ?? 0}
                  max={table.engineTotals[e]}
                  color="var(--lime)"
                  right={`${self.byEngine?.[e] ?? 0}/${table.engineTotals[e]}`}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 小卡 */}
      <Card title="AI 認得你" className="col-span-3">
        <p className="text-[30px] font-bold leading-none text-ink tabular-nums">
          {found}
          <span className="text-[17px] font-normal text-ink3">/{brandChecks.length} 家</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {brandChecks.map((b) => (
            <span
              key={b.engine}
              className={`rounded-full px-2.5 py-1 text-[14px] font-medium ${b.citedSelf ? "bg-ok/15 text-ok" : "bg-fail/10 text-fail"}`}
            >
              {b.citedSelf ? "✓" : "✗"} {shortEngine(b.engine)}
            </span>
          ))}
        </div>
      </Card>
      <Card title="推薦排名" right={<GoLink onClick={() => onGo("brands")} />} className="col-span-3">
        <p className="text-[30px] font-bold leading-none text-ink">{rank ? (rank <= 3 ? "前 3 名" : `第 ${rank} 名`) : "未上榜"}</p>
        <p className="mt-3 text-[14px] text-ink3">
          AI 點名的 {table.rows.length} 個品牌裡{rank ? `，這次排第 ${rank}` : ""}
        </p>
      </Card>
      <Card title="AI 評價" right={<GoLink onClick={() => onGo("sentiment")} />} className="col-span-3">
        <p className="text-[30px] font-bold leading-none tabular-nums">
          <span className="text-ok">{pos.length}</span>
          <span className="mx-1 text-[17px] font-normal text-ink3">好評</span>
          <span className="text-fail">{neg.length}</span>
          <span className="ml-1 text-[17px] font-normal text-ink3">缺點</span>
        </p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-inset">
          <div className="bg-ok" style={{ width: `${(pos.length / Math.max(1, pos.length + neg.length)) * 100}%` }} />
          <div className="bg-fail" style={{ width: `${(neg.length / Math.max(1, pos.length + neg.length)) * 100}%` }} />
        </div>
      </Card>
      <Card title="你的網站被 AI 引用" right={<GoLink onClick={() => onGo("citations")} />} className="col-span-3">
        <p className="text-[30px] font-bold leading-none text-ink tabular-nums">
          {selfCited}
          <span className="ml-1 text-[17px] font-normal text-ink3">次</span>
        </p>
        {topRivalCited && (
          <div className="mt-2">
            <HBar label="你" value={selfCited} max={Math.max(selfCited, topRivalCited.count)} color="var(--lime)" right={selfCited} />
            <HBar label={topRivalCited.name} value={topRivalCited.count} max={Math.max(selfCited, topRivalCited.count)} color="#303c54" right={topRivalCited.count} />
          </div>
        )}
      </Card>

      {/* AI 推薦了誰 */}
      <Card title="AI 推薦了誰" right={<GoLink onClick={() => onGo("brands")} />} className="col-span-7">
        {topColored.map((r) => (
          <HBar
            key={r.name}
            label={
              <span className={r.isSelf ? "font-bold" : ""}>
                {r.name}
                {r.isSelf && <span className="ml-1.5 rounded-full bg-lime px-1.5 py-0.5 text-[12.5px] font-bold">你</span>}
              </span>
            }
            value={r.count}
            max={top[0]?.count ?? 1}
            color={r.color}
            right={`${r.count}/${table.total}`}
          />
        ))}
      </Card>

      {/* 聲量佔比 */}
      <Card title="聲量佔比" className="col-span-5">
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 140 140" className="h-[150px] w-[150px] shrink-0 -rotate-90" aria-hidden="true">
            {sovSegs.map((sg) => {
              const len = (sg.v / Math.max(1, sovSum)) * C;
              const el = (
                <circle key={sg.name} cx="70" cy="70" r={R} fill="none" stroke={sg.color} strokeWidth="22" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} />
              );
              off += len;
              return el;
            })}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {sovSegs.map((sg) => (
              <li key={sg.name} className="flex items-center gap-2 text-[14px]">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: sg.color }} />
                <span className="min-w-0 flex-1 truncate text-ink2">{sg.name}</span>
                <span className="mono text-ink3 tabular-nums">{Math.round((sg.v / Math.max(1, sovSum)) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 熱力格 */}
      <Card title="每一題 × 每家 AI" right={<GoLink onClick={() => onGo("questions")} />} className="col-span-7">
        <div className="grid gap-2" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${table.engines.length}, 96px)` }}>
          <span />
          {table.engines.map((e) => (
            <span key={e} className="text-center text-[14px] text-ink3">
              {e}
            </span>
          ))}
          {questions.map((q, qi) => (
            <div key={q.question} className="contents">
              <span className="truncate self-center text-[14px] text-ink" title={q.question}>
                第 {qi + 1} 題：{q.question}
              </span>
              {cells[qi].map((c, ei) => {
                const full = c.total > 0 && c.named === c.total;
                const cls = c.total === 0 ? "bg-inset text-ink3" : full ? "bg-ok text-white" : c.named > 0 ? "bg-ok/25 text-ok" : "bg-fail/15 text-fail";
                return (
                  <span key={ei} className={`flex h-11 items-center justify-center rounded-lg text-[15px] font-bold tabular-nums ${cls}`}>
                    {c.total === 0 ? "—" : `${c.named > 0 ? "✓" : "✗"} ${c.named}/${c.total}`}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {/* 好話／缺點＋最大缺口 */}
      <div className="col-span-5 flex flex-col gap-5">
        {sentiment && (
          <Card title="AI 說你的好話／缺點" right={<GoLink onClick={() => onGo("sentiment")} />}>
            <ul className="space-y-2">
              {[...pos.slice(0, 2), ...neg.slice(0, 2)].map((t) => (
                <li key={t.theme} className="flex items-start gap-2 text-[14px]">
                  <span className={`font-bold ${t.polarity === "positive" ? "text-ok" : "text-fail"}`}>{t.polarity === "positive" ? "✓" : "✗"}</span>
                  <span className="text-ink">{t.theme}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {g && (
          <Card title="最大的缺口" right={<GoLink label="看每一題" onClick={() => onGo("questions")} />}>
            <p className="text-[15px] leading-relaxed text-ink">
              <strong>{g.engine}</strong> 對第 {g.qi + 1} 題{g.total > 1 ? "換了說法也" : ""}沒有推你：
            </p>
            <p className="mt-1 text-[14px] text-ink3">「{questions[g.qi].question}」</p>
          </Card>
        )}
      </div>
    </div>
  );
}
