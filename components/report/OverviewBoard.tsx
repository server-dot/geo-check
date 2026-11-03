"use client";

// ── 總覽：Power BI 式儀表板 ────────────────────────────────
// 2026-11-03 小積木：「像 Power BI 一樣的感覺」——正式圖表（座標軸、格線、滑鼠提示），
// 一排 KPI 卡＋下面一格一格的圖。每張卡右上角「看完整 →」跳到那一頁。
// 圖表元件與色盤見 Charts.tsx。

import type { ReactNode } from "react";
import { shortEngine, type BrandTable } from "./ReportOverview";
import {
  BrandEngineColumns,
  BrandTotalBars,
  QuestionStacked,
  SelfVsRival,
  SentimentDiverging,
  SourceTreemap,
  SovDonut,
} from "./Charts";
import type { BrandProfile } from "@/lib/geo-brand-profile";
import { BrandProfileTable } from "./BrandProfile";
import { SOURCE_LABEL, type SourceType } from "@/lib/geo-source-type";

interface QuestionLike {
  question: string;
  results: { engine: string; namedSelf?: boolean; citedSelf: boolean }[];
}

interface SentimentLike {
  themes: { theme: string; polarity: "positive" | "negative"; count: number }[];
  answerCount: number;
}

const TYPE_COLORS: Record<SourceType, string> = {
  self: "#fcb418",
  competitor: "#303c54",
  shop: "#5f6a80",
  media: "#8f99ab",
  social: "#c9ced8",
  other: "#e3e6ec",
};

export function Card({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border border-line bg-card shadow-[0_1px_3px_rgba(48,60,84,.07)] ${className}`}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <p className="text-[16px] font-bold text-ink">{title}</p>
          {sub && <p className="mt-0.5 text-[14px] text-ink3">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="flex-1 px-5 pb-4 pt-3">{children}</div>
    </div>
  );
}

function GoLink({ label = "看完整", onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-[14px] font-medium text-goldInk hover:underline">
      {label} →
    </button>
  );
}

function Kpi({ label, value, unit, foot, tone }: { label: string; value: ReactNode; unit?: string; foot: ReactNode; tone?: "ok" | "warn" | "fail" }) {
  const bar = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "fail" ? "bg-fail" : "bg-line";
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-card px-5 py-4 shadow-[0_1px_3px_rgba(48,60,84,.07)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="text-[14px] font-medium text-ink3">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[34px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="text-[15px] text-ink3">{unit}</span>}
      </p>
      <div className="mt-2 text-[14px] text-ink2">{foot}</div>
    </div>
  );
}

export function OverviewBoard({
  table,
  questions,
  brandChecks,
  sentiment,
  profile,
  citedPages,
  onGo,
}: {
  table: BrandTable;
  questions: QuestionLike[];
  brandChecks: { engine: string; citedSelf: boolean }[];
  sentiment?: SentimentLike | null;
  profile?: BrandProfile | null;
  citedPages: { type: SourceType; count: number; brand: string; host: string }[];
  onGo: (page: string) => void;
}) {
  const self = table.rows.find((r) => r.isSelf)!;
  const ratio = self.count / Math.max(1, table.total);
  const lv = ratio >= 0.6 ? { t: "常被推薦", tone: "ok" as const } : ratio >= 0.3 ? { t: "有時被推薦", tone: "warn" as const } : { t: "很少被推薦", tone: "fail" as const };
  const found = brandChecks.filter((b) => b.citedSelf).length;
  const rank = table.selfRank;
  const pos = sentiment?.themes.filter((t) => t.polarity === "positive") ?? [];
  const neg = sentiment?.themes.filter((t) => t.polarity === "negative") ?? [];
  const brandsTop = table.rows.filter((r) => r.count > 0).slice(0, 6);
  const rival = table.rows.find((r) => !r.isSelf && r.count > 0);

  const qData = questions.map((q, qi) => ({
    label: q.question,
    full: q.question,
    byEngine: Object.fromEntries(
      table.engines.map((e) => {
        const rs = q.results.filter((r) => shortEngine(r.engine) === e);
        return [e, { named: rs.filter((r) => r.namedSelf).length, total: rs.length }];
      }),
    ),
  }));

  const typeOrder: SourceType[] = ["self", "competitor", "shop", "media", "social", "other"];
  const treemap = typeOrder
    .map((t) => ({ name: SOURCE_LABEL[t], size: citedPages.filter((p) => p.type === t).reduce((n, p) => n + p.count, 0), color: TYPE_COLORS[t] }))
    .filter((d) => d.size > 0)
    .sort((a, b) => b.size - a.size);
  const selfCited = citedPages.filter((p) => p.type === "self").reduce((n, p) => n + p.count, 0);
  const totalCited = citedPages.reduce((n, p) => n + p.count, 0);

  return (
    <div className="space-y-5">
      {/* KPI 列 */}
      <div className="grid grid-cols-5 gap-4">
        <Kpi label="推薦次數" value={`${self.count}/${table.total}`} unit="次回答" tone={lv.tone} foot={<span className="font-semibold">{lv.t}</span>} />
        <Kpi label="官網引用" value={`${found}/${brandChecks.length}`} unit="家" tone={found === brandChecks.length ? "ok" : found > 0 ? "warn" : "fail"} foot="介紹品牌時引用官網的平台數" />
        <Kpi label="推薦排名" value={rank ? `第 ${rank}` : "未上榜"} unit={rank ? "名" : ""} tone={rank && rank <= 3 ? "ok" : rank ? "warn" : "fail"} foot={`AI 點名的 ${table.rows.length} 個品牌裡`} />
        <Kpi
          label="品牌評價"
          value={
            <>
              <span className="text-ok">{pos.length}</span>
              <span className="mx-1 text-[20px] text-ink3">:</span>
              <span className="text-fail">{neg.length}</span>
            </>
          }
          tone={neg.length === 0 ? "ok" : pos.length >= neg.length ? "warn" : "fail"}
          foot="正面 : 負面描述"
        />
        <Kpi
          label="自有引用次數"
          value={selfCited}
          unit={`/ ${totalCited} 次`}
          tone={selfCited > 0 ? "ok" : "fail"}
          foot={`佔 AI 引用的 ${Math.round((selfCited / Math.max(1, totalCited)) * 100)}%`}
        />
      </div>

      {/* 第二列 */}
      <div className="grid grid-cols-12 gap-5">
        <Card title="各平台品牌推薦次數" sub="前 6 名品牌在各 AI 平台被推薦的次數" right={<GoLink onClick={() => onGo("brands")} />} className="col-span-8">
          <BrandEngineColumns rows={brandsTop} engines={table.engines} />
        </Card>
        <Card title="聲量佔有率" sub="各品牌在所有推薦提及中的佔比" className="col-span-4">
          <SovDonut rows={table.rows.filter((r) => r.count > 0)} />
        </Card>
      </div>

      {/* 第三列 */}
      <div className="grid grid-cols-12 gap-5">
        <Card title="推薦排名" sub={`${table.total} 次 AI 回答中的被推薦次數`} right={<GoLink onClick={() => onGo("brands")} />} className="col-span-5">
          <BrandTotalBars rows={brandsTop} total={table.total} />
        </Card>
        <Card title="各推薦題表現" sub={`${self.name} 在各推薦題被推薦的次數，依平台堆疊`} right={<GoLink onClick={() => onGo("questions")} />} className="col-span-7">
          <QuestionStacked questions={qData} engines={table.engines} />
        </Card>
      </div>

      {/* 第四列 */}
      <div className="grid grid-cols-12 gap-5">
        {sentiment && sentiment.themes.length > 0 && (
          <Card title="品牌評價" sub="正面描述往右、負面描述往左，長度為出現次數" right={<GoLink onClick={() => onGo("sentiment")} />} className="col-span-7">
            <SentimentDiverging themes={sentiment.themes.slice(0, 8)} />
          </Card>
        )}
        <Card title="引用類型" sub="AI 回答引用的網頁，依網站類型分" right={<GoLink onClick={() => onGo("citations")} />} className={sentiment ? "col-span-5" : "col-span-12"}>
          <SourceTreemap data={treemap} />
        </Card>
      </div>

      {rival && rival.byEngine && self.byEngine && (
        <div className="grid grid-cols-12 gap-5">
          <Card title={`競品比較：${rival.name}`} sub={`${self.name} 與推薦次數最多的競品，各平台推薦次數`} right={<GoLink onClick={() => onGo("competitors")} />} className="col-span-6">
            <SelfVsRival engines={table.engines} self={self.byEngine} rival={rival.byEngine} rivalName={rival.name} totals={table.engineTotals} />
          </Card>
          <Card title="品牌輪廓" sub={`各平台介紹 ${self.name} 時的品類與特色`} right={<GoLink onClick={() => onGo("brand-check")} />} className="col-span-6">
            {profile ? (
              <BrandProfileTable profile={profile} brandChecks={brandChecks} compact />
            ) : (
            <div className="flex h-full flex-wrap content-center gap-3">
              {brandChecks.map((b) => (
                <div key={b.engine} className={`flex-1 rounded-xl border p-5 text-center ${b.citedSelf ? "border-ok/30 bg-ok/5" : "border-fail/30 bg-fail/5"}`}>
                  <p className="text-[15px] text-ink2">{shortEngine(b.engine)}</p>
                  <p className={`mt-2 text-[26px] font-bold ${b.citedSelf ? "text-ok" : "text-fail"}`}>{b.citedSelf ? "✓ 已辨識" : "✗ 未辨識"}</p>
                  <p className="mt-1 text-[14px] text-ink3">你的官網</p>
                </div>
              ))}
            </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
