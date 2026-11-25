"use client";

// ── 總覽：Power BI 式儀表板 ────────────────────────────────
// 2026-11-03 小積木：「像 Power BI 一樣的感覺」——正式圖表（座標軸、格線、滑鼠提示），
// 一排 KPI 卡＋下面一格一格的圖。每張卡右上角「看完整 →」跳到那一頁。
// 圖表元件與色盤見 Charts.tsx。

import type { ReactNode } from "react";
import { shortEngine, type BrandTable } from "./ReportOverview";
import {
  BrandEngineColumns,
  SourceTreemap,
  SovDonut,
} from "./Charts";
import { RivalMapMini, type RivalMapLike } from "./CompetitorCompare";
import type { BrandProfile } from "@/lib/geo-brand-profile";
import { KeywordCloud } from "./BrandProfile";
import { SOURCE_LABEL, type SourceType } from "@/lib/geo-source-type";

interface SentimentLike {
  themes: { theme: string; polarity: "positive" | "negative"; count: number; quote?: string; quoteEngine?: string }[];
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

// 品牌評價：表情圖＋對話框（11-23 小積木：「改文字 配圖」，原本的次數長條只有一根）
function Face({ good, size }: { good: boolean; size: number }) {
  const c = good ? "var(--ok)" : "var(--fail)";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="shrink-0" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill={c} fillOpacity="0.12" stroke={c} strokeWidth="2.5" />
      <circle cx="23" cy="27" r="3.2" fill={c} />
      <circle cx="41" cy="27" r="3.2" fill={c} />
      <path d={good ? "M20 38 Q32 51 44 38" : "M21 45 Q32 34 43 45"} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SentimentBubbles({ themes }: { themes: SentimentLike["themes"] }) {
  // 最多 3 則；有負面就一定留一則，不會被正面擠掉
  const pos = themes.filter((t) => t.polarity === "positive");
  const neg = themes.filter((t) => t.polarity === "negative");
  const keepNeg = neg.slice(0, Math.max(1, 3 - pos.length));
  const shown = [...pos.slice(0, 3 - keepNeg.length), ...keepNeg];
  const solo = shown.length === 1;
  return (
    <ul className="flex h-full flex-col justify-center gap-3">
      {shown.map((t) => {
        const good = t.polarity === "positive";
        return (
          <li key={t.theme} className="flex items-center gap-5">
            <Face good={good} size={solo ? 104 : 56} />
            <div className={`relative min-w-0 flex-1 rounded-xl border px-4 py-3 ${good ? "border-ok/30 bg-ok/5" : "border-fail/30 bg-fail/5"}`}>
              <span className={`absolute top-1/2 -left-[7px] h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l bg-card ${good ? "border-ok/30" : "border-fail/30"}`} />
              <p className={`text-[14px] font-semibold ${good ? "text-ok" : "text-fail"}`}>{good ? "✓ 正面" : "✗ 負面"}</p>
              <p className={`mt-0.5 font-bold text-ink ${solo ? "text-[18px]" : "text-[15px]"}`}>{t.theme}</p>
              {t.quote && (
                <p className={`mt-1 text-[14px] leading-relaxed text-ink2 ${solo ? "line-clamp-4" : "line-clamp-2"}`}>
                  {t.quoteEngine}：「{t.quote}」
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OverviewBoard({
  table,
  brandChecks,
  sentiment,
  profile,
  citedPages,
  names,
  rivalMap,
  onGo,
}: {
  table: BrandTable;
  brandChecks: { engine: string; citedSelf: boolean }[];
  sentiment?: SentimentLike | null;
  profile?: BrandProfile | null;
  citedPages: { type: SourceType; count: number; brand: string; host: string }[];
  names: { name: string; isSelf: boolean; answers?: number[] }[];
  rivalMap?: RivalMapLike | null;
  onGo: (page: string) => void;
}) {
  const self = table.rows.find((r) => r.isSelf)!;
  const ratio = self.count / Math.max(1, table.total);
  const lv = ratio >= 0.6 ? { t: "常被推薦", tone: "ok" as const } : ratio >= 0.3 ? { t: "有時被推薦", tone: "warn" as const } : { t: "很少被推薦", tone: "fail" as const };
  const found = brandChecks.filter((b) => b.citedSelf).length;
  const rank = table.selfRank;
  const tied = !!rank && table.rows.filter((r) => r.count === self.count).length > 1;
  const pos = sentiment?.themes.filter((t) => t.polarity === "positive") ?? [];
  const neg = sentiment?.themes.filter((t) => t.polarity === "negative") ?? [];
  const brandsTop = table.rows.filter((r) => r.count > 0).slice(0, 6);

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
        <Kpi label="推薦排名" value={rank ? `${tied ? "並列" : ""}第 ${rank}` : "未上榜"} unit={rank ? "名" : ""} tone={rank && rank <= 3 ? "ok" : rank ? "warn" : "fail"} foot={`AI 點名的 ${table.rows.length} 個品牌裡`} />
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
        <Card title="聲量佔有率" sub="各品牌在所有推薦提及中的佔比，次數相同標並列" className="col-span-4">
          <SovDonut rows={table.rows.filter((r) => r.count > 0)} />
        </Card>
      </div>

      {/* 第三列 */}
      <div className="grid grid-cols-12 gap-5">
        {sentiment && sentiment.themes.length > 0 && (
          <Card title="品牌評價" sub="AI 怎麼說你" right={<GoLink onClick={() => onGo("sentiment")} />} className="col-span-7">
            <SentimentBubbles themes={sentiment.themes} />
          </Card>
        )}
        <Card title="引用類型" sub="AI 回答引用的網頁，依網站類型分" right={<GoLink onClick={() => onGo("citations")} />} className={sentiment ? "col-span-5" : "col-span-12"}>
          <SourceTreemap data={treemap} />
        </Card>
      </div>

      {/* 11-23 小積木：「你 vs 被推最多那家」的次數長條換成市場定位圖；其他圖維持原樣 */}
      {(rivalMap || profile?.keywords?.length || brandChecks.length > 0) && (
        <div className="grid grid-cols-12 gap-5">
          {rivalMap && (
            <Card title="競爭對手分析" sub="AI 推過的業者各站在哪個位置" right={<GoLink onClick={() => onGo("competitors")} />} className="col-span-6">
              <RivalMapMini names={names} rivalMap={rivalMap} onOpen={() => onGo("competitors")} />
            </Card>
          )}
          <Card title="品牌輪廓" sub={`AI 平台介紹 ${self.name} 時用到的描述與提到的平台數`} right={<GoLink onClick={() => onGo("brand-check")} />} className={rivalMap ? "col-span-6" : "col-span-12"}>
            {profile?.keywords?.length ? (
              <>
                <KeywordCloud keywords={profile.keywords.slice(0, 10)} total={profile.engines.length} size="sm" />
                {profile.summaries?.some(Boolean) && (
                  <dl className="mt-4 space-y-3 border-t border-line pt-4 text-[15px]">
                    {profile.engines.map((e, i) =>
                      profile.summaries?.[i] ? (
                        <div key={e}>
                          <dt className="text-[14px] font-bold text-ink">{e} 怎麼介紹你</dt>
                          <dd className="mt-0.5 leading-relaxed text-ink2">{profile.summaries[i]}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                )}
              </>
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
