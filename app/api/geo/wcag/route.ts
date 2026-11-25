import { NextRequest, NextResponse } from 'next/server';
import { getAuditHistory, saveAuditHistory } from '@/lib/audit-history';
import { getAuditJob, updateAuditJob, type AuditJob } from '@/lib/geo-audit-jobs';
import { getSessionUser } from '@/lib/auth';
import { runWcag } from '@/lib/wcag';
import type { WcagReport } from '@/lib/wcag-types';

// 無障礙檢查：第一次打開那一頁時跑（不花錢、約 10 秒），存進報告；舊報告也適用
export const maxDuration = 120;
const running = new Map<string, Promise<WcagReport>>();

async function load(jobId: string, email: string) {
  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === email ? job : null;
  const history = live ? null : await getAuditHistory(jobId, email).catch(() => null);
  return { live, history, data: (live ?? history?.data ?? null) as Partial<AuditJob> | null };
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const r = jobId ? await load(jobId, user.email) : null;
  if (!r?.data?.url) return NextResponse.json({ error: '找不到這份報告' }, { status: 410 });
  if (r.data.wcag) return NextResponse.json({ wcag: r.data.wcag });
  const key = `${user.email}|${jobId}`;
  try {
    let run = running.get(key);
    if (!run) {
      run = runWcag(r.data.url).finally(() => running.delete(key));
      running.set(key, run);
    }
    const wcag = await run;
    // 首頁讀不到就不存，下次打開再試
    if (wcag.pages.some((p) => p.readable)) {
      const cur = await load(jobId, user.email);
      if (cur.live) updateAuditJob(jobId, { wcag });
      // 跑的期間報告可能被別的步驟改過，用重讀的那份合併
      if (cur.history) await saveAuditHistory({ id: jobId, email: user.email, kind: cur.history.item.kind, url: cur.history.item.url, createdAt: Date.parse(cur.history.item.createdAt), data: { ...(cur.history.data as object), wcag } });
      else if (cur.live) {
        const h = await getAuditHistory(jobId, user.email).catch(() => null);
        if (h) await saveAuditHistory({ id: jobId, email: user.email, kind: h.item.kind, url: h.item.url, createdAt: Date.parse(h.item.createdAt), data: { ...(h.data as object), wcag } });
      }
    }
    return NextResponse.json({ wcag });
  } catch (e) {
    console.error('wcag', e);
    return NextResponse.json({ error: '檢查時出錯了，請稍後再試。' }, { status: 502 });
  }
}
