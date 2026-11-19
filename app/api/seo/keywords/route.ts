import { NextRequest, NextResponse } from 'next/server';
import { getAuditHistory, saveAuditHistory } from '@/lib/audit-history';
import { getAuditJob, updateAuditJob, type AuditJob } from '@/lib/geo-audit-jobs';
import { checkKeyword, guessBrand, MAX_KEYWORDS, suggestKeywords } from '@/lib/seo-keyword-rank';
import { LIMITS, clientIp, hoursLeft, takeDaily } from '@/lib/rate-limit';
import { getSessionUser, isAdmin } from '@/lib/auth';

// SEO 健檢：使用者填 ≤3 個關鍵字 → 查台灣 Google 排名、前 10 名，拿你最接近的頁跟前 3 名同業比，寫出要補什麼。
// 流程照 /api/geo/recommend：剛跑完的用記憶體裡的 job，從檢測紀錄打開的用存檔，結果存回去。
export const maxDuration = 300;

async function loadReport(req: NextRequest, jobId: string) {
  const user = getSessionUser(req);
  if (!user) return null;
  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === user.email ? job : null;
  const history = live ? null : await getAuditHistory(jobId, user.email).catch(() => null);
  const data = (live ?? (history?.data as Partial<AuditJob> | undefined) ?? null) as Partial<AuditJob> | null;
  return { user, live, history, data };
}

async function saveBack(r: NonNullable<Awaited<ReturnType<typeof loadReport>>>, jobId: string, patch: Partial<AuditJob>) {
  if (r.live) updateAuditJob(jobId, patch);
  else if (r.history)
    await saveAuditHistory({
      id: jobId,
      email: r.user.email,
      kind: r.history.item.kind,
      url: r.history.item.url,
      createdAt: Date.parse(r.history.item.createdAt),
      data: { ...(r.history.data as object), ...patch },
    });
}

// 候選關鍵字：第一次打開關鍵字排名頁時產生（gpt-4.1-mini 一次，約 US$0.001），存回報告
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId') ?? '';
  const r = jobId ? await loadReport(req, jobId) : null;
  if (!r) return NextResponse.json({ error: '請先用 Google 帳號登入', needLogin: true }, { status: 401 });
  if (!r.data?.url) return NextResponse.json({ error: '找不到這份報告' }, { status: 410 });
  if (r.data.seoKeywordCandidates?.length) return NextResponse.json({ candidates: r.data.seoKeywordCandidates });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ candidates: [] });
  const candidates = await suggestKeywords(new URL(r.data.url).origin, apiKey);
  if (candidates.length) await saveBack(r, jobId, { seoKeywordCandidates: candidates });
  return NextResponse.json({ candidates });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入', needLogin: true }, { status: 401 });
  let body: { jobId?: unknown; keywords?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) return NextResponse.json({ error: '缺少報告 id' }, { status: 400 });

  const keywords = [...new Set((Array.isArray(body.keywords) ? body.keywords : []).map((k) => (typeof k === 'string' ? k.trim() : '')).filter((k) => k.length >= 2 && k.length <= 40))];
  if (keywords.length === 0) return NextResponse.json({ error: '至少填一個關鍵字（2～40 字）' }, { status: 400 });
  if (keywords.length > MAX_KEYWORDS) return NextResponse.json({ error: `一次最多查 ${MAX_KEYWORDS} 個關鍵字` }, { status: 400 });

  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === user.email ? job : null;
  const history = live ? null : await getAuditHistory(jobId, user.email).catch(() => null);
  const data = (live ?? (history?.data as Partial<AuditJob> | undefined) ?? null) as Partial<AuditJob> | null;
  if (!data?.url) return NextResponse.json({ error: '找不到這份報告，請重新健檢一次。' }, { status: 410 });

  // 第一次查算在健檢裡；查過之後換關鍵字重查才算每日次數（跟推薦題換題重問同一個額度）
  const firstAsk = !data.seoKeywords;
  const limited = firstAsk || isAdmin(user.email) ? null : takeDaily('recommend', clientIp(req), LIMITS.keywordRequestsPerDay);
  if (limited) {
    return NextResponse.json({ error: `這個網路位置今天已經換關鍵字重查 ${LIMITS.keywordRequestsPerDay} 次，${hoursLeft(limited.retryAfterMs)}後可以再查。` }, { status: 429 });
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !process.env.BRIGHTDATA_API_KEY) return NextResponse.json({ error: '搜尋服務沒有設定' }, { status: 503 });

  const origin = new URL(data.url).origin;
  const brand = await guessBrand(origin);
  const results = await Promise.all(keywords.map((k) => checkKeyword(k, origin, brand, apiKey).catch(() => null)));
  const seoKeywords = results.filter((r): r is NonNullable<typeof r> => !!r);
  if (seoKeywords.length === 0) return NextResponse.json({ error: '查 Google 的時候出錯了，請稍後再試。' }, { status: 502 });

  if (live) {
    updateAuditJob(jobId, { seoKeywords });
  } else if (history) {
    await saveAuditHistory({
      id: jobId,
      email: user.email,
      kind: history.item.kind,
      url: history.item.url,
      createdAt: Date.parse(history.item.createdAt),
      data: { ...(history.data as object), seoKeywords },
    });
  }
  return NextResponse.json({ ok: true, seoKeywords, failed: keywords.filter((k) => !seoKeywords.some((r) => r.keyword === k)) });
}
