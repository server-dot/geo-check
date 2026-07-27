import { NextRequest, NextResponse } from 'next/server';
import { getAuditJob } from '@/lib/geo-audit-jobs';

// GEO 深度健檢：背景 job 狀態輪詢
// GET ?id=geo_xxx → { status, message, progress, engine（AI 引擎層,一開始就有）,
//                      audit（深度檢測,完成才有）, error? }
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 job id' }, { status: 400 });

  const job = getAuditJob(id);
  if (!job) return NextResponse.json({ error: '找不到這個健檢工作（可能已過期，請重新檢測）' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    status: job.status,
    message: job.message,
    progress: job.progress,
    url: job.url,
    engine: job.engine,
    audit: job.status === 'completed' ? job.result : undefined,
    error: job.error,
  });
}
