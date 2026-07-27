import type { CheckResult } from './geo-audit-rules';
import type { RobotsStatus, AiBotResult, ContentSignals } from './geo-ai-crawlers';
import type { ContentVisibility } from './geo-content-visibility';
import type { WafHint } from './geo-waf-fingerprint';
import type { BrandVisibilityResult } from './geo-brand-visibility';
import type { LlmsTxtQuality } from './geo-llms-txt';

// ── GEO 深度健檢：背景工作進度存放（module 內 in-memory Map）────────────
// 多頁爬蟲＋AI 語意判斷跑起來要幾十秒到一兩分鐘，改成背景 job：
// route 開 job 後立即回 jobId，爬蟲/彙總在背景跑並更新進度，前端輪詢 status API。
// 部署環境要是常駐 Node（例如 Zeabur）背景 async 才會持續執行完；
// 純 serverless（請求結束就砍 process 的那種）不能用這個模式。

export type AuditJobStatus = 'engine' | 'crawling' | 'analyzing' | 'completed' | 'failed';

// 「AI 引擎可達性」這層的結果（原本 geo-check MVP 的四項檢測），
// 秒級跑完，跑完立刻更新 job 讓前端可以先顯示這段，不用整個等到深度健檢跑完
export interface EngineResult {
  origin: string;
  robotsUrl: string;
  robotsStatus: RobotsStatus;
  robotsNote: string;
  wafHint: WafHint | null;
  results: AiBotResult[];
  visibility: ContentVisibility | null;
  visibilityNote: string;
  contentSignals: ContentSignals | null;
  llmsTxt: { exists: boolean | null; quality: LlmsTxtQuality | null };
  brandVisibility: BrandVisibilityResult[];
}

export interface AuditJob {
  id: string;
  url: string;
  status: AuditJobStatus;
  message: string;
  progress: { crawled: number; discovered: number; cap: number };
  engine?: EngineResult;
  result?: CheckResult[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, AuditJob>();
const TTL = 60 * 60 * 1000; // 1 小時後清掉舊 job

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL) jobs.delete(id);
  }
}

export function createAuditJob(url: string): AuditJob {
  sweep();
  const now = Date.now();
  const id = `geo_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job: AuditJob = {
    id,
    url,
    status: 'engine',
    message: '檢測 AI 引擎可達性…',
    progress: { crawled: 0, discovered: 0, cap: 40 },
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return job;
}

export function updateAuditJob(id: string, patch: Partial<Omit<AuditJob, 'id' | 'createdAt'>>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export function getAuditJob(id: string): AuditJob | undefined {
  return jobs.get(id);
}
