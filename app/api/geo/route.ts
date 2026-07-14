import { NextRequest, NextResponse } from 'next/server';
import { checkAiCrawlerAccess } from '@/lib/geo-ai-crawlers';

// GEO 健檢 MVP：抓目標網站的 robots.txt，判斷各家 AI 引擎爬蟲能不能進來。
// 先做同步回應（單一 fetch 很快，不用背景 job + 輪詢）。
export const maxDuration = 30;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url?: string };
  const input = body.url?.trim();
  if (!input) return NextResponse.json({ error: '請輸入要檢測的網址' }, { status: 400 });

  let origin: string;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    origin = u.origin;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let robotsExists = false;
    let robotsTxt = '';
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': UA },
        signal: controller.signal,
      });
      robotsExists = res.ok;
      if (res.ok) robotsTxt = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const results = checkAiCrawlerAccess(robotsTxt);
    return NextResponse.json({ ok: true, origin, robotsExists, results });
  } catch {
    return NextResponse.json({ error: '連不到這個網站，請確認網址是否正確' }, { status: 502 });
  }
}
