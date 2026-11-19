import type { CheckResult } from './geo-audit-rules';
import type { KeywordCandidate, KeywordRank } from './seo-keyword-rank';
import type { RobotsStatus, AiBotResult, ContentSignals } from './geo-ai-crawlers';
import type { ContentVisibility } from './geo-content-visibility';
import type { WafHint } from './geo-waf-fingerprint';
import type { BrandVisibilityResult } from './geo-brand-visibility';
import type { LlmsTxtQuality } from './geo-llms-txt';
import type { SchemaTypeCard } from './geo-schema-check';
import type { RecommendVisibility, RecommendInput, RecommendCandidates } from './geo-recommend-visibility';
import type { SentimentResult } from './geo-sentiment';
import type { BrandProfile } from './geo-brand-profile';
import type { MatchPage } from './geo-content-match';
import type { AuditKind } from './quota';
import { saveAuditHistory } from './audit-history';

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
  // GEO（AI 推薦儀表板＋AI 爬蟲存取）或 SEO（多頁深度健檢）——兩條獨立的檢測
  kind: AuditKind;
  // 誰跑的：失敗時要把這個帳號的免費次數還回去
  email: string;
  status: AuditJobStatus;
  message: string;
  progress: { crawled: number; discovered: number; cap: number };
  engine?: EngineResult;
  result?: CheckResult[];
  schemaCards?: SchemaTypeCard[];
  // 逐頁可讀字數，依爬取順序。健檢報告圖的累積曲線用這個畫。
  pageWords?: number[];
  // 推薦題查詢結果（勾的題 × 各引擎 + 被點名的名單）。2026-11-11 起健檢不自動問，
  // 使用者在報告上勾題按「問 AI」才有（/api/geo/recommend）；沒問過就是 null。
  recommendVisibility?: RecommendVisibility | null;
  // 候選題：網友在論壇問過的＋AI 產生的，健檢時準備好給使用者勾
  recommendCandidates?: RecommendCandidates | null;
  // 不需要推薦題就能算的：品牌評價（直接問評價題＋品牌題的回答）、品牌輪廓。
  // 問過推薦題之後 recommendVisibility 裡也會帶一份（評價會加入推薦題回答重算）
  brandInsights?: { sentiment: SentimentResult | null; profile: BrandProfile | null } | null;
  // SEO 健檢：使用者自己填的關鍵字，查 Google 排名＋為什麼排不上去（/api/seo/keywords，見 lib/seo-keyword-rank.ts）
  seoKeywords?: KeywordRank[] | null;
  // 給人勾的候選關鍵字（第一次打開關鍵字排名頁時產生、存起來）
  seoKeywordCandidates?: KeywordCandidate[] | null;
  // 這次健檢有 AI 步驟因為 OpenRouter 額度不足失敗（報告會缺幾塊），前端要標出來
  aiCreditShort?: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, AuditJob>();
const TTL = 60 * 60 * 1000; // 1 小時後清掉舊 job

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL) {
      jobs.delete(id);
      contexts.delete(id);
    }
  }
}

export function createAuditJob(url: string, kind: AuditKind, email: string): AuditJob {
  sweep();
  const now = Date.now();
  const id = `geo_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job: AuditJob = {
    id,
    url,
    kind,
    email,
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
  // 完成（或完成後改題重問）就存進檢測紀錄，重新整理、隔天回來都還看得到
  if (job.status === 'completed') {
    saveAuditHistory({ id: job.id, email: job.email, kind: job.kind, url: job.url, createdAt: job.createdAt, data: auditJobPayload(job) }).catch(
      (e) => console.error('[history] 存檢測紀錄失敗', id, e),
    );
  }
}

// status API 回給前端的那包；檢測紀錄也原樣存這包
export function auditJobPayload(job: AuditJob) {
  const done = job.status === 'completed';
  return {
    ok: true,
    id: job.id,
    status: job.status,
    message: job.message,
    progress: job.progress,
    url: job.url,
    kind: job.kind,
    createdAt: new Date(job.createdAt).toISOString(),
    engine: job.engine,
    audit: done ? job.result : undefined,
    schemaCards: done ? job.schemaCards : undefined,
    pageWords: done ? job.pageWords : undefined,
    recommendVisibility: done ? job.recommendVisibility : undefined,
    recommendCandidates: done ? job.recommendCandidates : undefined,
    brandInsights: done ? job.brandInsights : undefined,
    seoKeywords: done ? job.seoKeywords : undefined,
    seoKeywordCandidates: done ? job.seoKeywordCandidates : undefined,
    aiCreditShort: done ? job.aiCreditShort || undefined : undefined,
    error: job.error,
  };
}

export function getAuditJob(id: string): AuditJob | undefined {
  return jobs.get(id);
}

// 使用者改題目重問時要用的原料：猜品牌名用的首頁資訊、爬到的頁面。
// 跟 job 分開放，因為 status API 會把整個 job 回給前端，40 頁內文不該跟著送出去。
export interface AuditJobContext {
  origin: string;
  recommendInput: RecommendInput;
  pages: MatchPage[];
  // 官網連出去的外部連結：判斷哪些引用來源是品牌自己的帳號
  siteExternalLinks: string[];
}

const contexts = new Map<string, AuditJobContext>();

export function setAuditJobContext(id: string, ctx: AuditJobContext): void {
  contexts.set(id, ctx);
}

export function getAuditJobContext(id: string): AuditJobContext | undefined {
  // job 被 sweep 掉之後 context 也不能用了
  if (!jobs.has(id)) {
    contexts.delete(id);
    return undefined;
  }
  return contexts.get(id);
}
