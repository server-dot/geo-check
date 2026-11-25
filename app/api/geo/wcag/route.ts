import { NextRequest, NextResponse } from 'next/server';
import { getAuditHistory, saveAuditHistory } from '@/lib/audit-history';
import { getAuditJob, updateAuditJob, type AuditJob } from '@/lib/geo-audit-jobs';
import { getSessionUser } from '@/lib/auth';
import { runWcag } from '@/lib/wcag';
import { WCAG_VERSION, type WcagReport } from '@/lib/wcag-types';

// 無障礙檢查：第一次打開那一頁時跑（不花錢；先出幾頁的結果，全站在背景查），存進報告；舊報告也適用
export const maxDuration = 60;
const running = new Map<string, { report: WcagReport | null; failed: boolean }>();

async function load(jobId: string, email: string) {
  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === email ? job : null;
  const history = live ? null : await getAuditHistory(jobId, email).catch(() => null);
  return { live, history, data: (live ?? history?.data ?? null) as Partial<AuditJob> | null };
}

async function save(jobId: string, email: string, wcag: WcagReport) {
  const cur = await load(jobId, email);
  if (cur.live) updateAuditJob(jobId, { wcag });
  // 跑的期間報告可能被別的步驟改過，用重讀的那份合併
  const h = cur.history ?? (await getAuditHistory(jobId, email).catch(() => null));
  if (h) await saveAuditHistory({ id: jobId, email, kind: h.item.kind, url: h.item.url, createdAt: Date.parse(h.item.createdAt), data: { ...(h.data as object), wcag } });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const r = jobId ? await load(jobId, user.email) : null;
  if (!r?.data?.url) return NextResponse.json({ error: '找不到這份報告' }, { status: 410 });
  const saved = r.data.wcag;
  if (saved?.v === WCAG_VERSION && saved.scan?.status !== 'running') return NextResponse.json({ wcag: saved });
  // 背景跑，畫面每幾秒來問一次進度
  const key = `${user.email}|${jobId}`;
  let state = running.get(key);
  if (!state) {
    const fresh: { report: WcagReport | null; failed: boolean } = { report: null, failed: false };
    state = fresh;
    running.set(key, fresh);
    void runWcag(r.data.url, (x) => (fresh.report = x))
      .then((wcag) => (wcag.pages.some((p) => p.readable) ? save(jobId, user.email, wcag) : undefined)) // 首頁讀不到就不存，下次再試
      .catch((e) => {
        console.error('wcag', e);
        fresh.failed = true;
      })
      .finally(() => setTimeout(() => running.delete(key), 60_000));
  }
  if (state.failed) return NextResponse.json({ error: '檢查時出錯了，請稍後再試。' }, { status: 502 });
  return NextResponse.json({ wcag: state.report });
}
