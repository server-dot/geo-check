// ── 次數限制（in-memory，單一實例）────────────────────────
// 免費全開不卡信箱是定案（見 STP），但「開放」不等於「無限」：一次健檢要打 8 家爬蟲、
// 爬 40 頁、叫 3 次以上 LLM；關鍵字查詢一次最多 8 個字 × 2 引擎。網址一公開，
// 一支腳本就能把 OpenRouter 額度燒完。這裡做兩道最便宜的閘：
//   1. 每個 IP 每天最多跑 N 次（健檢、關鍵字查詢分開算）
//   2. 全站同時只能有 M 個健檢在跑（保護記憶體跟對方網站）
// 存在記憶體裡，重啟歸零——跟 job store 同一個前提（Zeabur 單一常駐實例）。
// 數字都可以用環境變數調，不用改程式。

import type { NextRequest } from 'next/server';

const DAY = 24 * 60 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const LIMITS = {
  auditPerDay: envInt('AUDIT_DAILY_LIMIT', 5),
  keywordRequestsPerDay: envInt('KEYWORD_DAILY_LIMIT', 5),
  concurrentAudits: envInt('AUDIT_CONCURRENCY_LIMIT', 3),
};

// Cloudflare 在前面時真實 IP 在 cf-connecting-ip；沒有的話退回 x-forwarded-for 第一個
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const buckets = new Map<string, { count: number; resetAt: number }>();

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

// 回傳 null 代表放行（並記一次）；否則回傳還要等多久（毫秒）
export function takeDaily(scope: string, ip: string, limit: number): { retryAfterMs: number } | null {
  const now = Date.now();
  sweep(now);
  const key = `${scope}:${ip}`;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + DAY });
    return null;
  }
  if (b.count >= limit) return { retryAfterMs: b.resetAt - now };
  b.count += 1;
  return null;
}

let running = 0;
export function tryAcquireAuditSlot(): boolean {
  if (running >= LIMITS.concurrentAudits) return false;
  running += 1;
  return true;
}
export function releaseAuditSlot(): void {
  running = Math.max(0, running - 1);
}

export function hoursLeft(ms: number): string {
  const h = Math.ceil(ms / (60 * 60 * 1000));
  return h <= 1 ? '約 1 小時' : `約 ${h} 小時`;
}
