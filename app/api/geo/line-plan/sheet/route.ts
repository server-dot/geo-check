import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_ERROR, loadAdminReport } from '@/lib/report-access';
import { STATE_COOKIE, googleConfigured, newState, redirectUri } from '@/lib/auth';

// 「開成 Google 試算表」：多要一次 drive.file 權限（只能碰這個程式自己建的檔），
// 回來走同一個登入 callback（不用在 Google 後台多設網址），建完直接轉到試算表。權杖用完就丟，不存。
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId') ?? '';
  const r = await loadAdminReport(req, jobId);
  if (typeof r === 'string') return NextResponse.json({ error: ACCESS_ERROR[r][1] }, { status: ACCESS_ERROR[r][0] });
  if (!r.data.linePlan) return NextResponse.json({ error: '還沒有作戰清單' }, { status: 404 });
  if (!googleConfigured()) return NextResponse.json({ error: 'Google 登入還沒設定' }, { status: 503 });
  const state = newState();
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/drive.file',
    login_hint: r.user.email,
    state,
  }).toString();
  const res = NextResponse.redirect(google);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: `/?report=${encodeURIComponent(jobId)}`, sheet: jobId }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
