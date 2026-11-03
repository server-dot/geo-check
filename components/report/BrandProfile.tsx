"use client";

// ── 品牌輪廓表：列＝項目（品類、主力產品…），欄＝各家 AI ─────────
// 每格是 AI 的說法，打開「顯示原文」才看得到原句（報告字太多是 09-21 的回饋，預設收起）。
// 三家講法互相矛盾的項目在左欄標 ⚠。最後一列是這家 AI 介紹你時有沒有引用官網。

import { useState } from "react";
import type { BrandProfile as Profile } from "@/lib/geo-brand-profile";
import { shortEngine } from "./ReportOverview";

export function BrandProfileTable({
  profile,
  brandChecks,
  compact = false,
}: {
  profile: Profile;
  brandChecks: { engine: string; citedSelf: boolean }[];
  compact?: boolean;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const rows = compact ? profile.rows.filter((r) => r.key === "category" || r.key === "features") : profile.rows;
  const cited = (engine: string) => brandChecks.find((b) => shortEngine(b.engine) === engine)?.citedSelf;

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex justify-end">
          <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink2">
            <input type="checkbox" checked={showQuote} onChange={(e) => setShowQuote(e.target.checked)} className="h-4 w-4 accent-[#fcb418]" />
            顯示原文
          </label>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="bg-inset">
              <th className={`${compact ? "w-[22%]" : "w-[16%]"} px-4 py-3 text-[14px] font-semibold text-ink3`}>項目</th>
              {profile.engines.map((e) => (
                <th key={e} className="px-4 py-3 text-[14px] font-semibold text-ink2">
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <p className="text-[15px] font-semibold text-ink">{r.label}</p>
                  {r.conflict && !compact && <p className="mt-1 text-[14px] text-warn">⚠ 說法不一致：{r.conflict}</p>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-4 py-3">
                    {c.value ? (
                      <>
                        <p className="text-[15px] text-ink">{c.value}</p>
                        {showQuote && <p className="mt-1.5 border-l-2 border-line pl-2 text-[14px] text-ink3">「{c.quote}」</p>}
                      </>
                    ) : (
                      <p className="text-[15px] text-ink3">未提及</p>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line bg-inset/50">
              <td className="px-4 py-3 text-[15px] font-semibold text-ink">官網引用</td>
              {profile.engines.map((e) => {
                const ok = cited(e);
                return (
                  <td key={e} className={`px-4 py-3 text-[15px] font-semibold ${ok ? "text-ok" : ok === false ? "text-fail" : "text-ink3"}`}>
                    {ok ? "✓ 有引用" : ok === false ? "✗ 未引用" : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
