"use client";

// ── 競爭對手分析 ───────────────────────────────────────────
// 參考 WorkDuo：選一個對手，每一題並排比「你被推幾次 vs 對手被推幾次」，標出誰贏。
// 資料全部來自推薦題（不多花 API）。樣本小：一題 3 個回答，所以寫次數不寫百分比。

import { useState } from "react";
import type { BrandTable } from "./ReportOverview";

export function CompetitorCompare({ table, questions }: { table: BrandTable; questions: { question: string }[] }) {
  const rivals = table.rows.filter((r) => !r.isSelf && r.count > 0 && r.hits).slice(0, 6);
  const self = table.rows.find((r) => r.isSelf);
  const [pick, setPick] = useState(rivals[0]?.name ?? "");
  const rival = rivals.find((r) => r.name === pick) ?? rivals[0];
  if (!self || !rival) return <p className="text-sm text-ink3">這次 AI 沒有點名其他品牌，沒有對手可以比。</p>;

  const perQ = (hits: number[] | null, qi: number) => (hits ?? []).filter((i) => table.flat[i]?.qi === qi).length;
  const totalPerQ = (qi: number) => table.flat.filter((f) => f.qi === qi).length;
  const rows = questions.map((q, qi) => {
    const me = perQ(self.hits, qi);
    const them = perQ(rival.hits, qi);
    return { q: q.question, me, them, total: totalPerQ(qi), diff: me - them };
  });
  const win = rows.filter((r) => r.diff > 0).length;
  const lose = rows.filter((r) => r.diff < 0).length;
  const tie = rows.length - win - lose;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink2">跟誰比：</span>
        {rivals.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => setPick(r.name)}
            className={`rounded-full border px-3 py-1 text-[13px] ${
              r.name === rival.name ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-card text-ink2 hover:border-ink3"
            }`}
          >
            {r.name}
            <span className={`mono ml-1.5 text-[11px] ${r.name === rival.name ? "text-paper/70" : "text-ink3"}`}>{r.count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[13px] text-ink2">整體被推薦</p>
          <p className="mt-1.5 text-[26px] font-bold leading-none text-ink tabular-nums">
            {self.count}
            <span className="mx-2 text-base font-normal text-ink3">vs</span>
            {rival.count}
          </p>
          <p className="mt-1.5 text-xs text-ink3">
            你 vs {rival.name}（{table.total} 次回答中）
          </p>
        </div>
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[13px] text-ink2">逐題比</p>
          <p className="mt-1.5 text-[26px] font-bold leading-none tabular-nums">
            <span className="text-ok">{win}</span>
            <span className="mx-1.5 text-base font-normal text-ink3">勝</span>
            <span className="text-fail">{lose}</span>
            <span className="mx-1.5 text-base font-normal text-ink3">敗</span>
            <span className="text-ink2">{tie}</span>
            <span className="ml-1.5 text-base font-normal text-ink3">平</span>
          </p>
          <p className="mt-1.5 text-xs text-ink3">共 {rows.length} 題</p>
        </div>
        <div className="rounded-[10px] border border-line bg-card px-5 py-4">
          <p className="text-[13px] text-ink2">各家 AI</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            {table.engines.map((e) => {
              const me = self.byEngine?.[e] ?? 0;
              const them = rival.byEngine?.[e] ?? 0;
              return (
                <li key={e} className="flex items-center justify-between gap-2">
                  <span className="text-ink2">{e}</span>
                  <span className="mono text-xs tabular-nums">
                    <span className={me > them ? "font-bold text-ok" : "text-ink2"}>{me}</span>
                    <span className="text-ink3"> vs </span>
                    <span className={them > me ? "font-bold text-fail" : "text-ink2"}>{them}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line bg-inset/60 text-left text-xs text-ink3">
              <th className="px-4 py-2.5 font-medium">題目</th>
              <th className="w-[90px] px-3 py-2.5 text-right font-medium">你</th>
              <th className="w-[110px] px-3 py-2.5 text-right font-medium">{rival.name}</th>
              <th className="w-[120px] px-3 py-2.5 font-medium">誰贏</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.q} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-2.5 text-ink">{r.q}</td>
                <td className="mono px-3 py-2.5 text-right text-xs text-ink2">
                  {r.me}/{r.total}
                </td>
                <td className="mono px-3 py-2.5 text-right text-xs text-ink2">
                  {r.them}/{r.total}
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  {r.diff > 0 ? (
                    <span className="font-semibold text-ok">✓ 你贏</span>
                  ) : r.diff < 0 ? (
                    <span className="font-semibold text-fail">✗ {rival.name}</span>
                  ) : (
                    <span className="text-ink3">＝ 平手</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
