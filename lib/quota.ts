// ── 免費次數：每個 Google 帳號每天 GEO、SEO 各一次（台灣時間午夜換日）──────
// 跟 rate-limit.ts 不同，這個要跨部署、跨重啟都記得，所以要落地：
//   - 有 DATABASE_URL（正式站 Railway Postgres）→ 存 Postgres
//   - 沒有（本機開發）→ 存 .data/usage.json
// 健檢失敗（網站連不上、爬蟲出錯）要把次數還回去，不能讓人白白用掉唯一一次。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { isAdmin, type SessionUser } from './auth';

export type AuditKind = 'geo' | 'seo';
export const AUDIT_KINDS: AuditKind[] = ['geo', 'seo'];

export interface UsageRecord {
  url: string;
  at: string;
}
export type Usage = Record<AuditKind, UsageRecord | null>;

// 台灣時間的今天，YYYY-MM-DD
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

// ── Postgres ──
let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function db(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 3 });
    ready = pool
      .query(
        `CREATE TABLE IF NOT EXISTS gc_users (
           email TEXT PRIMARY KEY,
           name TEXT NOT NULL DEFAULT '',
           first_login TIMESTAMPTZ NOT NULL DEFAULT now(),
           last_login TIMESTAMPTZ NOT NULL DEFAULT now()
         );
         CREATE TABLE IF NOT EXISTS gc_usage (
           email TEXT NOT NULL,
           kind TEXT NOT NULL,
           day TEXT NOT NULL,
           url TEXT NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           PRIMARY KEY (email, kind, day)
         );`,
      )
      .then(() => undefined);
  }
  return pool;
}

async function pg(): Promise<Pool | null> {
  const p = db();
  if (p) await ready;
  return p;
}

// ── 本機檔案 ──
const FILE = path.join(process.cwd(), '.data', 'usage.json');
interface FileStore {
  users: Record<string, { name: string; firstLogin: string; lastLogin: string }>;
  // email → 日期 → 那天用過的
  usage: Record<string, Record<string, Partial<Record<AuditKind, UsageRecord>>>>;
}
let fileLock: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<FileStore> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as FileStore;
  } catch {
    return { users: {}, usage: {} };
  }
}

// 同一個 process 裡排隊寫，避免兩個請求同時讀改寫蓋掉對方
function withStore<T>(fn: (s: FileStore) => T | Promise<T>): Promise<T> {
  const run = fileLock.then(async () => {
    const s = await readStore();
    const out = await fn(s);
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(s, null, 2));
    return out;
  });
  fileLock = run.catch(() => {});
  return run;
}

// ── 對外 API ──

export async function recordLogin(user: SessionUser): Promise<void> {
  const p = await pg();
  if (p) {
    await p.query(
      `INSERT INTO gc_users (email, name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, last_login = now()`,
      [user.email, user.name],
    );
    return;
  }
  await withStore((s) => {
    const now = new Date().toISOString();
    s.users[user.email] = { name: user.name, firstLogin: s.users[user.email]?.firstLogin ?? now, lastLogin: now };
  });
}

export async function getUsage(email: string): Promise<Usage> {
  const out: Usage = { geo: null, seo: null };
  const p = await pg();
  if (p) {
    const { rows } = await p.query<{ kind: AuditKind; url: string; created_at: Date }>(
      'SELECT kind, url, created_at FROM gc_usage WHERE email = $1 AND day = $2',
      [email, today()],
    );
    for (const r of rows) if (r.kind in out) out[r.kind] = { url: r.url, at: r.created_at.toISOString() };
    return out;
  }
  const s = await readStore();
  return { ...out, ...(s.usage[email]?.[today()] ?? {}) };
}

// 搶到今天這次免費額度回 true；今天已經用過回 false。管理員一律放行、不記錄。
export async function reserveAudit(email: string, kind: AuditKind, url: string): Promise<boolean> {
  if (isAdmin(email)) return true;
  const p = await pg();
  if (p) {
    const { rowCount } = await p.query(
      'INSERT INTO gc_usage (email, kind, day, url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [email, kind, today(), url],
    );
    return (rowCount ?? 0) > 0;
  }
  return withStore((s) => {
    const u = ((s.usage[email] ??= {})[today()] ??= {});
    if (u[kind]) return false;
    u[kind] = { url, at: new Date().toISOString() };
    return true;
  });
}

// 健檢沒跑成功，把次數還回去
export async function releaseAudit(email: string, kind: AuditKind): Promise<void> {
  if (isAdmin(email)) return;
  const p = await pg();
  if (p) {
    await p.query('DELETE FROM gc_usage WHERE email = $1 AND kind = $2 AND day = $3', [email, kind, today()]);
    return;
  }
  await withStore((s) => {
    delete s.usage[email]?.[today()]?.[kind];
  });
}
