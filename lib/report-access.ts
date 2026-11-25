import type { NextRequest } from 'next/server';
import { getAuditHistory, saveAuditHistory } from './audit-history';
import { getAuditJob, updateAuditJob, type AuditJob } from './geo-audit-jobs';
import { getSessionUser, isAdmin, type SessionUser } from './auth';

// 公司帳號讀／寫自己的報告（剛跑完的在記憶體，其他從檢測紀錄）
export async function loadAdminReport(req: NextRequest, jobId: string): Promise<{ user: SessionUser; data: Partial<AuditJob>; save: (patch: Partial<AuditJob>) => Promise<void> } | 'login' | 'forbidden' | 'missing'> {
  const user = getSessionUser(req);
  if (!user) return 'login';
  if (!isAdmin(user.email)) return 'forbidden';
  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === user.email ? job : null;
  const history = live ? null : await getAuditHistory(jobId, user.email).catch(() => null);
  const data = (live ?? (history?.data as Partial<AuditJob> | undefined) ?? null) as Partial<AuditJob> | null;
  if (!data?.url) return 'missing';
  return {
    user,
    data,
    save: async (patch) => {
      if (live) return void updateAuditJob(jobId, patch);
      // 跑的期間報告可能被別的步驟改過，存之前重讀一次再合併
      const cur = await getAuditHistory(jobId, user.email).catch(() => null);
      if (cur) await saveAuditHistory({ id: jobId, email: user.email, kind: cur.item.kind, url: cur.item.url, createdAt: Date.parse(cur.item.createdAt), data: { ...(cur.data as object), ...patch } });
    },
  };
}
export const ACCESS_ERROR = {
  login: [401, '請先用 Google 帳號登入'],
  forbidden: [403, '這個功能只給公司帳號用'],
  missing: [410, '找不到這份報告'],
} as const;
