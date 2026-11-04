// ── 檢測紀錄：每次健檢完成就把整份結果存起來 ─────────────────────────────
// 健檢 job 本身放在記憶體、一小時就清掉，重新整理或過幾天回來就看不到了。
// 完成時把 status API 會回的那包 JSON 原樣存下（含檢測時間），報告頁用 ?report=<id> 直接載回。
//   - 有 DATABASE_URL → Postgres gc_audits（表在 quota.ts 一起建）
//   - 沒有（本機）→ .data/audits/<id>.json

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pg, type AuditKind } from './quota';

export interface HistoryItem {
  id: string;
  kind: AuditKind;
  url: string;
  createdAt: string;
  finishedAt: string;
}

interface FileRecord extends HistoryItem {
  email: string;
  data: unknown;
}

const DIR = path.join(process.cwd(), '.data', 'audits');
const SAFE_ID = /^geo_[a-z0-9_]+$/;

// 同一份報告可能存不只一次（完成時一次、之後改題重問又一次），以最後一次為準，時間保留第一次完成的
export async function saveAuditHistory(rec: {
  id: string;
  email: string;
  kind: AuditKind;
  url: string;
  createdAt: number;
  data: unknown;
}): Promise<void> {
  if (!SAFE_ID.test(rec.id)) return;
  const p = await pg();
  if (p) {
    await p.query(
      `INSERT INTO gc_audits (id, email, kind, url, created_at, data) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [rec.id, rec.email, rec.kind, rec.url, new Date(rec.createdAt), JSON.stringify(rec.data)],
    );
    return;
  }
  const file = path.join(DIR, `${rec.id}.json`);
  let finishedAt = new Date().toISOString();
  try {
    finishedAt = (JSON.parse(await readFile(file, 'utf8')) as FileRecord).finishedAt;
  } catch {}
  const out: FileRecord = {
    id: rec.id,
    email: rec.email,
    kind: rec.kind,
    url: rec.url,
    createdAt: new Date(rec.createdAt).toISOString(),
    finishedAt,
    data: rec.data,
  };
  await mkdir(DIR, { recursive: true });
  await writeFile(file, JSON.stringify(out));
}

export async function listAuditHistory(email: string, limit = 50): Promise<HistoryItem[]> {
  const p = await pg();
  if (p) {
    const { rows } = await p.query<{ id: string; kind: AuditKind; url: string; created_at: Date; finished_at: Date }>(
      'SELECT id, kind, url, created_at, finished_at FROM gc_audits WHERE email = $1 ORDER BY created_at DESC LIMIT $2',
      [email, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      url: r.url,
      createdAt: r.created_at.toISOString(),
      finishedAt: r.finished_at.toISOString(),
    }));
  }
  let names: string[] = [];
  try {
    names = await readdir(DIR);
  } catch {
    return [];
  }
  const items: HistoryItem[] = [];
  for (const n of names) {
    try {
      const r = JSON.parse(await readFile(path.join(DIR, n), 'utf8')) as FileRecord;
      if (r.email === email) items.push({ id: r.id, kind: r.kind, url: r.url, createdAt: r.createdAt, finishedAt: r.finishedAt });
    } catch {}
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

// 只回給本人
export async function getAuditHistory(id: string, email: string): Promise<{ item: HistoryItem; data: unknown } | null> {
  if (!SAFE_ID.test(id)) return null;
  const p = await pg();
  if (p) {
    const { rows } = await p.query<{ id: string; kind: AuditKind; url: string; created_at: Date; finished_at: Date; data: unknown }>(
      'SELECT id, kind, url, created_at, finished_at, data FROM gc_audits WHERE id = $1 AND email = $2',
      [id, email],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      item: { id: r.id, kind: r.kind, url: r.url, createdAt: r.created_at.toISOString(), finishedAt: r.finished_at.toISOString() },
      data: r.data,
    };
  }
  try {
    const r = JSON.parse(await readFile(path.join(DIR, `${id}.json`), 'utf8')) as FileRecord;
    if (r.email !== email) return null;
    return { item: { id: r.id, kind: r.kind, url: r.url, createdAt: r.createdAt, finishedAt: r.finishedAt }, data: r.data };
  } catch {
    return null;
  }
}
