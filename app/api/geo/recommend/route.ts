import { NextRequest, NextResponse } from 'next/server';
import { getAuditHistory, saveAuditHistory } from '@/lib/audit-history';
import { getAuditJob, getAuditJobContext, updateAuditJob, type AuditJob } from '@/lib/geo-audit-jobs';
import { MAX_PICKED_QUESTIONS, sanitizeCustomQuestions, type PickedQuestion, type RecommendCandidates } from '@/lib/geo-recommend-visibility';
import { askPickedQuestions } from '@/lib/geo-recommend-ask';
import { LIMITS, clientIp, hoursLeft, takeDaily } from '@/lib/rate-limit';
import { getSessionUser, isAdmin } from '@/lib/auth';

// 使用者勾好推薦題（網友問過的、AI 產生的，或自己寫的）按「問 AI」。2026-11-11 起健檢不自動問推薦題，
// 一律走這支。剛跑完的健檢用記憶體裡的 job（有爬到的頁面，第 2 關能判斷）；
// 從檢測紀錄打開的舊報告 job 已經清掉，改用紀錄裡存的候選題原料，沒有頁面就不比對第 2 關。
export const maxDuration = 300;

type Payload = {
  url?: string;
  engine?: AuditJob['engine'];
  recommendVisibility?: AuditJob['recommendVisibility'];
  recommendCandidates?: RecommendCandidates | null;
  brandInsights?: AuditJob['brandInsights'];
};

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入', needLogin: true }, { status: 401 });
  let body: { jobId?: unknown; questions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) return NextResponse.json({ error: '缺少報告 id' }, { status: 400 });

  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === user.email ? job : null;
  const ctx = live ? getAuditJobContext(jobId) : undefined;
  const history = live ? null : await getAuditHistory(jobId, user.email).catch(() => null);
  const data: Payload | null = live ? live : ((history?.data as Payload | undefined) ?? null);
  const candidates = data?.recommendCandidates ?? null;
  const input = ctx?.recommendInput ?? candidates?.input;
  if (!data || !data.url || !input) {
    return NextResponse.json({ error: '找不到這份報告的題目資料，請重新健檢一次。' }, { status: 410 });
  }

  // 勾的題：AI 產生的要對得上候選清單；其他當成自己寫的（網友問過的只給人看，不能直接勾）
  const raw = Array.isArray(body.questions) ? body.questions : [];
  const picked: PickedQuestion[] = [];
  for (const r of raw) {
    const q = typeof r === 'string' ? r.trim() : r && typeof r === 'object' && typeof (r as { question?: unknown }).question === 'string' ? (r as { question: string }).question.trim() : '';
    if (!q || picked.some((p) => p.question === q)) continue;
    if (candidates?.keywords?.includes(q)) picked.push({ question: q, origin: 'keyword' });
    else if (candidates?.ai.includes(q)) picked.push({ question: q, origin: 'ai' });
    else {
      const [clean] = sanitizeCustomQuestions([q], input.brandName);
      if (!clean) {
        return NextResponse.json({ error: `「${q}」不能用：題目要 4 到 80 個字，而且不能有你的品牌名（有品牌名就變成問 AI 認不認得你）。` }, { status: 400 });
      }
      picked.push({ question: clean, origin: 'custom' });
    }
  }
  if (picked.length === 0) return NextResponse.json({ error: '至少勾一題' }, { status: 400 });
  if (picked.length > MAX_PICKED_QUESTIONS) return NextResponse.json({ error: `一次最多問 ${MAX_PICKED_QUESTIONS} 題` }, { status: 400 });

  // 第一次問算在健檢裡，不扣次數；問過之後換題重問才算每日次數
  const firstAsk = !data.recommendVisibility;
  const limited = firstAsk || isAdmin(user.email) ? null : takeDaily('recommend', clientIp(req), LIMITS.keywordRequestsPerDay);
  if (limited) {
    return NextResponse.json(
      { error: `這個網路位置今天已經換題重問 ${LIMITS.keywordRequestsPerDay} 次，${hoursLeft(limited.retryAfterMs)}後可以再問。` },
      { status: 429 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI 服務沒有設定' }, { status: 503 });
  const origin = ctx?.origin ?? new URL(data.url).origin;
  const recommendVisibility = await askPickedQuestions({
    input,
    origin,
    picked,
    pages: ctx?.pages ?? [],
    siteExternalLinks: ctx?.siteExternalLinks ?? [],
    brandChecks: data.engine?.brandVisibility ?? [],
    insights: data.brandInsights ?? null,
    apiKey,
  });
  if (!recommendVisibility) return NextResponse.json({ error: '問 AI 的時候出錯了，請稍後再試。' }, { status: 502 });

  // 存回 job／檢測紀錄：Markdown 版、重新整理、之後比較對手拿到的才會是這次的結果
  if (live) {
    updateAuditJob(jobId, { recommendVisibility });
  } else if (history) {
    await saveAuditHistory({
      id: jobId,
      email: user.email,
      kind: history.item.kind,
      url: history.item.url,
      createdAt: Date.parse(history.item.createdAt),
      data: { ...(history.data as object), recommendVisibility },
    });
  }
  return NextResponse.json({ ok: true, recommendVisibility });
}
