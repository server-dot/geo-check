import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getAuditHistory, listAuditHistory } from '@/lib/audit-history';

// 檢測紀錄（只看得到自己的）
//   GET            → { items: [{ id, kind, url, createdAt, finishedAt }] }，新的在前
//   GET ?id=geo_x  → 那次健檢的完整結果（跟 /api/geo/status 同一包，多 finishedAt）
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先登入', needLogin: true }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const rec = await getAuditHistory(id, user.email).catch(() => null);
    if (!rec) return NextResponse.json({ error: '找不到這份檢測紀錄' }, { status: 404 });
    return NextResponse.json({ ...(rec.data as object), finishedAt: rec.item.finishedAt }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const items = await listAuditHistory(user.email).catch(() => []);
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
