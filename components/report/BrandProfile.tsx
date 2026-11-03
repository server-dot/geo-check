"use client";

// ── 品牌輪廓 ─────────────────────────────────────────────
// 2026-11-03 小積木：表格「不夠有 AI 如何了解你的品牌輪廓的感」。改成畫像式：
// 上面是 AI 對品牌的共識關鍵詞（幾家 AI 都這樣講，越多家字越重），
// 下面每家 AI 一張卡：它開口第一句怎麼介紹你，再列它認知的品類、產品、特色、價格、通路。

import type { BrandProfile as Profile, ProfileKeyword } from "@/lib/geo-brand-profile";
import { shortEngine } from "./ReportOverview";

function chips(value: string): string[] {
  return value
    .split(/[、，／/]+|,(?!\d)/) // 千分位逗號不切（NT$1,000）
    .map((s) => s.trim())
    .filter(Boolean);
}

function kwStyle(n: number, total: number) {
  if (n >= total) return "bg-ink text-white text-[18px] font-bold px-4 py-2";
  if (n >= 2) return "bg-lime/25 text-ink text-[16px] font-semibold px-3.5 py-1.5 border border-lime";
  return "bg-card text-ink2 text-[15px] px-3 py-1.5 border border-line";
}

export function KeywordCloud({ keywords, total, size = "lg" }: { keywords: ProfileKeyword[]; total: number; size?: "lg" | "sm" }) {
  return (
    <div>
      <div className={`flex flex-wrap items-center ${size === "lg" ? "gap-3" : "gap-2"}`}>
        {keywords.map((k) => (
          <span key={k.word} title={`${k.engines.join("、")}`} className={`rounded-full ${kwStyle(k.engines.length, total)}`}>
            {k.word}
            <span className="ml-1.5 text-[14px] font-normal opacity-70">{k.engines.length}/{total}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-5 text-[14px] text-ink3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-ink" />
          {total} 家都這樣說
        </span>
        {total > 2 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border border-lime bg-lime/25" />2 家
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-line bg-card" />1 家
        </span>
      </div>
    </div>
  );
}

export function BrandProfileView({
  profile,
  brandChecks,
  brandName,
}: {
  profile: Profile;
  brandChecks: { engine: string; citedSelf: boolean }[];
  brandName: string;
}) {
  const total = profile.engines.length;
  const cited = (engine: string) => brandChecks.find((b) => shortEngine(b.engine) === engine)?.citedSelf;
  const conflicts = profile.rows.filter((r) => r.conflict);

  return (
    <div className="space-y-5">
      {profile.keywords && profile.keywords.length > 0 && (
        <div className="rounded-xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(48,60,84,.07)]">
          <p className="text-[16px] font-bold text-ink">AI 對 {brandName} 的認知關鍵詞</p>
          <p className="mt-0.5 mb-5 text-[14px] text-ink3">{profile.engines.join("、")} 介紹 {brandName} 時用到的描述，依提到的平台數排列</p>
          <KeywordCloud keywords={profile.keywords} total={total} />
          {conflicts.length > 0 && (
            <div className="mt-5 space-y-1.5 border-t border-line pt-4">
              {conflicts.map((r) => (
                <p key={r.key} className="text-[15px] text-ink2">
                  <span className="font-semibold text-warn">⚠ {r.label}說法不一致：</span>
                  {r.conflict}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {profile.engines.map((e, i) => {
          const ok = cited(e);
          return (
            <div key={e} className="flex flex-col rounded-xl border border-line bg-card shadow-[0_1px_3px_rgba(48,60,84,.07)]">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <p className="text-[16px] font-bold text-ink">{e}</p>
                <span className={`text-[14px] font-semibold ${ok ? "text-ok" : ok === false ? "text-fail" : "text-ink3"}`}>
                  {ok ? "✓ 引用官網" : ok === false ? "✗ 未引用官網" : ""}
                </span>
              </div>
              {profile.intros?.[i] && (
                <blockquote className="mx-5 mt-4 rounded-lg bg-inset px-4 py-3 text-[15px] leading-relaxed text-ink">「{profile.intros[i]}」</blockquote>
              )}
              <dl className="space-y-3.5 px-5 py-4">
                {profile.rows.map((r) => {
                  const c = r.cells[i];
                  return (
                    <div key={r.key}>
                      <dt className="mb-1.5 text-[14px] font-medium text-ink3">
                        {r.label}
                        {r.conflict && c.value && <span className="ml-1.5 text-warn">⚠</span>}
                      </dt>
                      <dd>
                        {c.value ? (
                          <div className="flex flex-wrap gap-1.5" title={`原文：${c.quote}`}>
                            {chips(c.value).map((w) => (
                              <span key={w} className="rounded-md border border-line bg-card px-2.5 py-1 text-[15px] text-ink">
                                {w}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[15px] text-ink3">未提及</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
