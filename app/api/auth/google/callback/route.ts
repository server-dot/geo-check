import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, STATE_COOKIE, encodeSession, exchangeCode, publicOrigin, safeNext, sessionCookieOptions } from '@/lib/auth';
import { recordLogin } from '@/lib/quota';

// Google 登入回來：核對 state → 用授權碼換 id_token → 設 session cookie → 回到原本的頁面
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? '{}');
  } catch {
    // cookie 壞掉就當沒有，下面 state 比對會失敗
  }
  const next = safeNext(saved.next);
  const fail = (reason: string) => {
    const u = new URL(next, origin);
    u.searchParams.set('login_error', reason);
    const res = NextResponse.redirect(u);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (req.nextUrl.searchParams.get('error')) return fail('你取消了 Google 登入');
  if (!code || !state || state !== saved.state) return fail('登入逾時或驗證失敗，請再登入一次');

  try {
    const user = await exchangeCode(code, req);
    await recordLogin(user).catch(() => {}); // 記名單失敗不擋登入
    const res = NextResponse.redirect(new URL(next, origin));
    res.cookies.set(SESSION_COOKIE, encodeSession(user), sessionCookieOptions);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Google 登入失敗');
  }
}
