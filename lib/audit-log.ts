// ── 健檢紀錄（誰跑了健檢）────────────────────────────
// GA 只知道頁面被開，看不出到底有幾個人真的跑了健檢。這裡每完成一次就記一行 JSONL：
// 時間、網域、爬了幾頁、正常／可優化／需處理各幾項、8 家爬蟲幾家進得來、花了幾秒。
// 只給 /admin 看，不記 IP、不記報告內容。
//
// 存檔位置由 AUDIT_LOG_PATH 決定（預設 ./data/audit-log.jsonl）。Zeabur 的容器檔案系統
// 重新部署會清掉——要留住紀錄得在 Zeabur 掛一個 Volume 到那個目錄。寫檔失敗不影響健檢，
// 只是那筆留在記憶體裡、重啟就沒了。

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface AuditLogEntry {
  at: string;          // ISO 時間
  host: string;
  status: 'completed' | 'failed';
  pages: number;
  ok: number;
  warn: number;
  fail: number;
  botsAllowed: number;
  botsTotal: number;
  seconds: number;
  error?: string;
}

const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(process.cwd(), 'data', 'audit-log.jsonl');

// 每次都讀檔，不做記憶體快取：Next 會把 API route 跟 page 打包成不同的 module 實例，
// 記憶體裡的陣列兩邊不共用，快取一開就會看到「API 記了、後台卻是 0」。檔案很小，讀檔不是成本。
// 寫檔失敗的那幾筆留在 unsaved，讀的時候併進去，至少這個實例活著時看得到。
const unsaved: AuditLogEntry[] = [];

async function readFileEntries(): Promise<AuditLogEntry[]> {
  try {
    const text = await readFile(LOG_PATH, 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as AuditLogEntry; } catch { return null; }
      })
      .filter((e): e is AuditLogEntry => !!e);
  } catch {
    return [];
  }
}

export async function appendAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    unsaved.push(entry);
    console.warn('[audit-log] 寫檔失敗，這筆只留在記憶體：', err instanceof Error ? err.message : err);
  }
}

export async function readAuditLog(): Promise<AuditLogEntry[]> {
  return [...(await readFileEntries()), ...unsaved];
}

export async function countAudits(): Promise<number> {
  return (await readAuditLog()).filter((e) => e.status === 'completed').length;
}

// /admin 用的彙總。放在這裡而不是 page 元件裡，是因為 React Compiler 的 purity 規則
// 不准在元件 render 期間叫 Date.now()。
export interface AuditLogSummary {
  all: AuditLogEntry[];          // 新的在前
  today: number;
  todayOk: number;
  week: number;
  weekOk: number;
  month: number;
  monthOk: number;
  total: number;
  totalOk: number;
  days: { day: string; n: number }[]; // 最近 14 天，舊的在前
  topHosts: [string, number][];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKeyTaipei(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD
}

export async function summarizeAuditLog(): Promise<AuditLogSummary> {
  const all = (await readAuditLog()).sort((a, b) => (a.at < b.at ? 1 : -1));
  const now = Date.now();
  const within = (days: number) => all.filter((e) => now - new Date(e.at).getTime() < days * DAY_MS);
  const okOf = (list: AuditLogEntry[]) => list.filter((e) => e.status === 'completed').length;
  const todayKey = dayKeyTaipei(new Date(now).toISOString());
  const today = all.filter((e) => dayKeyTaipei(e.at) === todayKey);
  const week = within(7);
  const month = within(30);

  const days: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = dayKeyTaipei(new Date(now - i * DAY_MS).toISOString());
    days.push({ day, n: all.filter((e) => dayKeyTaipei(e.at) === day).length });
  }

  const byHost = new Map<string, number>();
  for (const e of all) byHost.set(e.host, (byHost.get(e.host) ?? 0) + 1);
  const topHosts = [...byHost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return {
    all,
    today: today.length, todayOk: okOf(today),
    week: week.length, weekOk: okOf(week),
    month: month.length, monthOk: okOf(month),
    total: all.length, totalOk: okOf(all),
    days, topHosts,
  };
}
