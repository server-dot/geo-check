import { NextRequest, NextResponse } from 'next/server';
import { getAuditJob, getAuditJobContext, updateAuditJob } from '@/lib/geo-audit-jobs';
import { runRecommendVisibility, sanitizeCustomQuestions } from '@/lib/geo-recommend-visibility';
import { matchQuestionsToPages } from '@/lib/geo-content-match';
import { LIMITS, clientIp, hoursLeft, takeDaily } from '@/lib/rate-limit';

// 使用者自己改推薦題再問一次。AI 猜的題目可能根本不是客戶會問的、或跟你主推的東西對不上，
// 那後面「AI 為什麼沒推薦你」三關的判斷全都建立在錯的題目上——所以要讓人能改。
// 爬到的頁面沿用原本那次健檢（job context），不重爬；job 過期（1 小時）就要重新健檢。
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  let body: { jobId?: unknown; questions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  const job = jobId ? getAuditJob(jobId) : undefined;
  const ctx = jobId ? getAuditJobContext(jobId) : undefined;
  if (!job || !ctx) {
    return NextResponse.json({ error: '這份報告已經過期（超過 1 小時），請重新健檢一次再改題目。' }, { status: 410 });
  }

  const questions = sanitizeCustomQuestions(Array.isArray(body.questions) ? body.questions : [], ctx.recommendInput.brandName);
  if (questions.length === 0) {
    return NextResponse.json({ error: '題目要 8 到 80 個字，而且不能有你的品牌名（有品牌名就變成問 AI 認不認得你）。' }, { status: 400 });
  }

  const limited = takeDaily('recommend', clientIp(req), LIMITS.keywordRequestsPerDay);
  if (limited) {
    return NextResponse.json(
      { error: `這個網路位置今天已經改題重問 ${LIMITS.keywordRequestsPerDay} 次，${hoursLeft(limited.retryAfterMs)}後可以再問。` },
      { status: 429 },
    );
  }

  const rec = await runRecommendVisibility(ctx.recommendInput, ctx.origin, questions).catch(() => null);
  if (!rec) return NextResponse.json({ error: '問 AI 的時候出錯了，請稍後再試。' }, { status: 502 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  const contentMatch = apiKey ? await matchQuestionsToPages(rec.questions, ctx.pages, apiKey).catch(() => null) : null;
  const recommendVisibility = { ...rec, contentMatch };
  // 存回 job，Markdown 版跟之後的輪詢拿到的才會是新題目的結果
  updateAuditJob(jobId, { recommendVisibility });

  return NextResponse.json({ ok: true, recommendVisibility });
}
