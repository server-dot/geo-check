// ── 付費 API 的錄製／重播（只在本機開發用）──────────────────────────────
// 2026-11-12 小積木：「有沒有超便宜的測試方式」。完整跑一次健檢＋問 AI 約 US$0.6，
// 改畫面、改流程卻每次都要真的問 AI 太浪費。所有打 OpenRouter／SerpApi／Serper 的地方都走這支：
//
//   本機（NODE_ENV=development）平常照樣真的呼叫，但把回應存到 .data/replay/（不多花錢，順手錄）
//   GEO_REPLAY=1 npm run dev  → 不打付費 API，全部從錄好的回應拿：
//     1. 請求內容一模一樣 → 回當時的回應
//     2. 對不到（網站內容變了、prompt 改了）→ 拿「同一個 API、同一個模型、同一種 prompt 開頭」最近一筆錄音頂替，
//        終端機印 [replay] ≈ 提醒這筆是頂替的（內容可能跟題目不搭，測流程和畫面夠用，不能拿來判斷 AI 答得好不好）
//     3. 連頂替的都沒有 → 直接丟錯，絕不偷偷打付費 API
//   正式站（production）完全不碰，等於原本的 fetch。

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), '.data', 'replay');
const isDev = process.env.NODE_ENV === 'development';
const replaying = isDev && process.env.GEO_REPLAY === '1';

interface Tape {
  url: string;
  family: string; // 對不到時找頂替用：主機＋路徑＋模型＋prompt 開頭
  status: number;
  body: string;
  savedAt: string;
}

function familyOf(url: string, body: string | undefined): string {
  const u = new URL(url);
  let model = '';
  let head = '';
  if (body) {
    try {
      const j = JSON.parse(body) as { model?: string; q?: string; messages?: { content?: unknown }[] };
      model = j.model ?? '';
      const last = j.messages?.at(-1)?.content;
      // prompt 開頭 40 字通常就是模板的第一句（「下面是一個網站的資訊…」），足以分辨是哪一種請求
      head = typeof last === 'string' ? last.slice(0, 40) : '';
    } catch {}
  }
  // SerpApi 用 engine 參數分種類（google／google_ai_overview）
  const engine = u.searchParams.get('engine') ?? '';
  return [u.host, u.pathname, engine, model, head].join('|');
}

function keyOf(url: string, body: string | undefined): string {
  const u = new URL(url);
  u.searchParams.delete('api_key'); // 金鑰不進檔名雜湊，也不寫進錄音
  return createHash('sha256').update(`${u.toString()}\n${body ?? ''}`).digest('hex').slice(0, 32);
}

function cleanUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('api_key');
  return u.toString();
}

function findStandIn(family: string): Tape | null {
  let best: { tape: Tape; mtime: number } | null = null;
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  for (const f of files) {
    const p = path.join(DIR, f);
    try {
      const tape = JSON.parse(readFileSync(p, 'utf8')) as Tape;
      if (tape.family !== family || tape.status >= 400) continue;
      const mtime = statSync(p).mtimeMs;
      if (!best || mtime > best.mtime) best = { tape, mtime };
    } catch {}
  }
  return best?.tape ?? null;
}

export async function paidFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isDev) return fetch(url, init);
  const body = typeof init.body === 'string' ? init.body : undefined;
  const key = keyOf(url, body);
  const file = path.join(DIR, `${key}.json`);
  const family = familyOf(url, body);

  if (replaying) {
    let tape: Tape | null = null;
    try {
      tape = JSON.parse(readFileSync(file, 'utf8')) as Tape;
    } catch {}
    if (!tape) {
      tape = findStandIn(family);
      if (tape) console.log(`[replay] ≈ ${family}`);
    }
    if (!tape) throw new Error(`[replay] 沒有錄音可用，不打付費 API：${family}`);
    return new Response(tape.body, { status: tape.status, headers: { 'Content-Type': 'application/json' } });
  }

  const res = await fetch(url, init);
  const text = await res.text();
  if (res.ok) {
    try {
      mkdirSync(DIR, { recursive: true });
      const tape: Tape = { url: cleanUrl(url), family, status: res.status, body: text, savedAt: new Date().toISOString() };
      writeFileSync(file, JSON.stringify(tape));
    } catch {}
  }
  return new Response(text, { status: res.status, statusText: res.statusText, headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' } });
}
