import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 只給本機開發用：讀 .dev-fixtures/<name>.json（存下來的一份完整健檢結果），
// 改報告畫面時不用每次真的跑一次健檢、燒 OpenRouter 的錢。正式環境一律 404。
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const name = req.nextUrl.searchParams.get('name') ?? '';
  if (!/^[a-z0-9-]+$/.test(name)) return NextResponse.json({ error: 'bad name' }, { status: 400 });
  try {
    const raw = await readFile(path.join(process.cwd(), '.dev-fixtures', `${name}.json`), 'utf8');
    return new NextResponse(raw, { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return NextResponse.json({ error: 'fixture not found' }, { status: 404 });
  }
}
