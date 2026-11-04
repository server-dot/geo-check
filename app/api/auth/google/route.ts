import { NextRequest, NextResponse } from 'next/server';
import { STATE_COOKIE, googleConfigured, newState, redirectUri, safeNext } from '@/lib/auth';

// 開始 Google 登入：產生 state 存進 cookie（防 CSRF），帶使用者去 Google 同意畫面。
// ?next= 是登入完要回到的站內路徑（首頁會帶上 url、kind，回來後自動開跑）。
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.json({ error: '登入功能還沒設定（缺 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET）' }, { status: 503 });
  }
  const state = newState();
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  const res = NextResponse.redirect(google);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
