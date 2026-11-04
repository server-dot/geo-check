import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, googleConfigured, isAdmin } from '@/lib/auth';
import { getUsage } from '@/lib/quota';

// 前端用：目前登入的是誰、GEO／SEO 各用過了沒
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ user: null, loginAvailable: googleConfigured() });
  const usage = await getUsage(user.email).catch(() => ({ geo: null, seo: null }));
  return NextResponse.json({ user, usage, admin: isAdmin(user.email), loginAvailable: true });
}
