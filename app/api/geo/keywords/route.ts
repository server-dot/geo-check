import { NextRequest, NextResponse } from 'next/server';
import { checkKeywordVisibility } from '@/lib/geo-keyword-visibility';

// 關鍵字 AI 能見度：使用者自己選好要測哪些關鍵字後才觸發，不是每次健檢自動跑——
// 一個關鍵字要查兩個引擎，關鍵字越多花的 API 額度越多，這裡刻意做成按需查詢，
// 讓使用者自己決定要花多少額度，不是幫他決定。
export const maxDuration = 30;

const MAX_KEYWORDS_PER_REQUEST = 8;

export async function POST(req: NextRequest) {
  let body: { keywords?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }

  const rawKeywords = Array.isArray(body.keywords) ? body.keywords : [];
  const keywords = rawKeywords
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS_PER_REQUEST);
  if (keywords.length === 0) return NextResponse.json({ error: '請提供至少一個關鍵字' }, { status: 400 });

  const input = typeof body.url === 'string' ? body.url.trim() : '';
  if (!input) return NextResponse.json({ error: '缺少網址' }, { status: 400 });

  let origin: string;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('unsupported protocol');
    origin = u.origin;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  const results = await Promise.all(
    keywords.map(async (keyword) => ({ keyword, results: await checkKeywordVisibility(keyword, origin) }))
  );

  return NextResponse.json({ ok: true, results });
}
