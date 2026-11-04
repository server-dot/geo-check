// ── 登入：Google 帳號（Google Cloud OAuth 2.0）＋簽章 cookie ─────────────
// 2026-11-04 小積木定案：健檢要先用 Google 登入，登入後 GEO、SEO 每天各免費一次（11-04 同日改成每日；公司網域不限）
// （推翻 08-31「免費全開不卡信箱」）。只需要知道「這是哪個信箱」來記次數，
// 所以不裝 next-auth：自己走 authorization code flow，拿到 id_token 解出 email，
// session 存成 HMAC 簽章的 cookie（不另外存 session 表）。
//
// 需要的環境變數：
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  Google Cloud Console → API 和服務 → 憑證 → OAuth 用戶端 ID（網頁應用程式）
//   AUTH_SECRET    簽 cookie 用的隨機字串（openssl rand -hex 32）
//   AUTH_URL       對外網址，正式站 https://geo.stack.com.tw；沒設時正式環境用 SITE_URL、本機用請求網址
//   ADMIN_EMAILS   逗號分隔，這些帳號不限次數（自己測試用）
//   ADMIN_DOMAINS  逗號分隔的信箱網域，整個網域不限次數；沒設時預設 stack.com.tw（公司帳號）

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { SITE_URL } from './site';

export const SESSION_COOKIE = 'gc_session';
export const STATE_COOKIE = 'gc_oauth_state';
const SESSION_DAYS = 30;

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET 沒有設定');
  return 'geo-check-dev-secret';
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function encodeSession(user: SessionUser): string {
  const payload = b64url(JSON.stringify({ ...user, exp: Date.now() + SESSION_DAYS * 86400_000 }));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser & { exp: number };
    if (!data.email || data.exp < Date.now()) return null;
    return { email: data.email, name: data.name, picture: data.picture };
  } catch {
    return null;
  }
}

export function getSessionUser(req: NextRequest): SessionUser | null {
  return decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 86400,
};

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// 公司網域（預設 @stack.com.tw）和 ADMIN_EMAILS 不限次數。登入時已要求 email_verified，
// 所以拿得到 @stack.com.tw 的一定是能收這個信箱的人。
export function isAdmin(email: string): boolean {
  const e = email.toLowerCase();
  if (list(process.env.ADMIN_EMAILS).includes(e)) return true;
  const domains = process.env.ADMIN_DOMAINS === undefined ? ['stack.com.tw'] : list(process.env.ADMIN_DOMAINS);
  return domains.some((d) => e.endsWith(`@${d}`));
}

// Railway 前面有 proxy，req.nextUrl.origin 在正式站可能是內部位址，所以正式環境固定用對外網址
export function publicOrigin(req: NextRequest): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? SITE_URL : req.nextUrl.origin;
}

export function redirectUri(req: NextRequest): string {
  return `${publicOrigin(req)}/api/auth/google/callback`;
}

export function newState(): string {
  return randomBytes(16).toString('hex');
}

// 只接受站內相對路徑，避免 ?next=https://evil.com 變成開放轉址
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// 用授權碼跟 Google 換 id_token。token 是我們自己用 TLS 直接跟 Google 拿的，
// 依 Google 文件這種情況可以直接解 payload，不用再驗簽；但 aud、iss 還是要核對。
export async function exchangeCode(code: string, req: NextRequest): Promise<SessionUser> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.id_token) throw new Error(data.error_description ?? data.error ?? 'Google 登入失敗');
  const claims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8')) as {
    aud?: string;
    iss?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Google 登入驗證失敗（aud 不符）');
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('Google 登入驗證失敗（iss 不符）');
  if (!claims.email || !claims.email_verified) throw new Error('這個 Google 帳號的信箱還沒驗證');
  return { email: claims.email.toLowerCase(), name: claims.name ?? claims.email, picture: claims.picture };
}
