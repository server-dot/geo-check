import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { summarizeAuditLog } from "@/lib/audit-log";

// 只有小積木看的後台：到底有幾個人跑了健檢。
// 用 ?key=<ADMIN_KEY> 開，key 不對或沒設環境變數就 404，外面看起來像沒這頁。
export const metadata: Metadata = {
  title: "健檢紀錄",
  robots: { index: false, follow: false },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const expected = process.env.ADMIN_KEY;
  if (!expected || key !== expected) notFound();

  const s = await summarizeAuditLog();
  const all = s.all;
  const maxN = Math.max(1, ...s.days.map((d) => d.n));

  const stat = (label: string, value: number, note?: string) => (
    <div className="rounded-[10px] border border-line bg-card px-5 py-4">
      <div className="text-xs text-ink3">{label}</div>
      <div className="mt-1 text-[30px] font-bold leading-none tracking-[-0.03em]">{value}</div>
      {note && <div className="mono mt-2 text-[11px] text-ink3">{note}</div>}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-[24px] font-bold tracking-[-0.03em]">健檢紀錄</h1>
      <p className="mt-1 text-sm text-ink3">每完成一次健檢記一筆。不記 IP、不記報告內容。</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("今天", s.today, `${s.todayOk} 成功`)}
        {stat("7 天", s.week, `${s.weekOk} 成功`)}
        {stat("30 天", s.month, `${s.monthOk} 成功`)}
        {stat("全部", s.total, `${s.totalOk} 成功`)}
      </div>

      <h2 className="mt-10 text-sm font-semibold text-ink2">最近 14 天</h2>
      <div className="mt-3 flex h-28 items-end gap-1.5 rounded-[10px] border border-line bg-card px-4 pt-4 pb-6">
        {s.days.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.day}：${d.n} 次`}>
            <span className="mono text-[10px] text-ink3">{d.n || ""}</span>
            <div className="w-full rounded-t bg-lime" style={{ height: `${(d.n / maxN) * 64}px`, minHeight: d.n ? 3 : 0 }} />
            <span className="mono text-[9px] text-ink3">{d.day.slice(5)}</span>
          </div>
        ))}
      </div>

      {s.topHosts.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold text-ink2">被測最多次的網域</h2>
          <ol className="mt-3 space-y-1.5 rounded-[10px] border border-line bg-card px-5 py-4">
            {s.topHosts.map(([host, n], i) => (
              <li key={host} className="mono flex items-baseline gap-3 text-sm">
                <span className="w-5 text-right text-xs text-ink3">{i + 1}</span>
                <span className="break-all">{host}</span>
                <span className="ml-auto text-xs text-ink3">{n} 次</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <h2 className="mt-10 text-sm font-semibold text-ink2">最近 100 筆</h2>
      <div className="mt-3 overflow-x-auto rounded-[10px] border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink3">
              <th className="px-4 py-3 font-medium">時間</th>
              <th className="px-4 py-3 font-medium">網域</th>
              <th className="px-4 py-3 font-medium">頁數</th>
              <th className="px-4 py-3 font-medium">正常/可優化/需處理</th>
              <th className="px-4 py-3 font-medium">爬蟲進得來</th>
              <th className="px-4 py-3 font-medium">秒</th>
            </tr>
          </thead>
          <tbody>
            {all.slice(0, 100).map((e, i) => (
              <tr key={`${e.at}-${i}`} className="border-t border-line2">
                <td className="mono whitespace-nowrap px-4 py-2.5 text-xs text-ink3">{fmt(e.at)}</td>
                <td className="mono break-all px-4 py-2.5">
                  {e.host}
                  {e.status === "failed" && <span className="ml-2 text-xs text-fail">失敗{e.error ? `：${e.error}` : ""}</span>}
                </td>
                <td className="mono px-4 py-2.5 text-xs">{e.pages}</td>
                <td className="mono whitespace-nowrap px-4 py-2.5 text-xs">
                  <span className="text-ok">{e.ok}</span> / <span className="text-warn">{e.warn}</span> / <span className="text-fail">{e.fail}</span>
                </td>
                <td className="mono px-4 py-2.5 text-xs">{e.botsAllowed}/{e.botsTotal}</td>
                <td className="mono px-4 py-2.5 text-xs">{e.seconds}</td>
              </tr>
            ))}
            {all.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink3">還沒有任何紀錄。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
