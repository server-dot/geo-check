import { NextRequest, NextResponse } from 'next/server';
import { getAuditHistory, saveAuditHistory } from '@/lib/audit-history';
import { getAuditJob, updateAuditJob, type AuditJob } from '@/lib/geo-audit-jobs';
import { getSessionUser, isAdmin } from '@/lib/auth';
import { askCompare } from '@/lib/geo-compare';
import { selfShortName } from '@/lib/geo-sentiment';
import { buildRivalMap, RIVAL_MAP_VERSION } from '@/lib/geo-rival-map';
import { applyStance, findStanceHits } from '@/lib/geo-rival-stance';
import { LIMITS, clientIp, hoursLeft, takeDaily } from '@/lib/rate-limit';

// 舊報告的競爭對手分析換成新做法（不重問推薦題）。約 US$0.1
export const maxDuration = 300;
const running = new Set<string>();

async function load(jobId: string, email: string) {
  const job = getAuditJob(jobId);
  const live = job && job.status === 'completed' && job.email === email ? job : null;
  const history = await getAuditHistory(jobId, email).catch(() => null);
  return { live, history, data: (live ?? history?.data ?? null) as Partial<AuditJob> | null };
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { jobId?: unknown; compare?: unknown } | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const compare = body?.compare === true;
  const r = jobId ? await load(jobId, user.email) : null;
  const rv = r?.data?.recommendVisibility;
  if (!r?.data?.url || !rv) return NextResponse.json({ error: '這份報告還沒問過 AI，沒有業者可以比' }, { status: 410 });
  const ready = rv.rivalMap?.v === RIVAL_MAP_VERSION && !!rv.rivalMap.topic;
  if (compare && rv.aiCompare) return NextResponse.json({ rivalMap: rv.rivalMap, aiCompare: rv.aiCompare });
  if (!compare && ready && rv.rivalMap!.points.length >= 3) return NextResponse.json({ rivalMap: rv.rivalMap });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !process.env.SERPER_API_KEY) return NextResponse.json({ error: '搜尋服務沒有設定' }, { status: 503 });
  const key = `${user.email}|${jobId}`;
  if (running.has(key)) return NextResponse.json({ error: '正在分析，請稍等' }, { status: 409 });
  const limited = isAdmin(user.email) ? null : takeDaily('recommend', clientIp(req), LIMITS.keywordRequestsPerDay);
  if (limited) return NextResponse.json({ error: `今天的次數用完了，${hoursLeft(limited.retryAfterMs)}後可以再試。` }, { status: 429 });
  running.add(key);
  try {
    const input = r.data.recommendCandidates?.input ?? { title: '', description: '' };
    const origin = new URL(r.data.url).origin;
    // 比較要用圖挑出來的同業；圖是舊的就先換新
    let rivalMap = ready ? rv.rivalMap! : await buildRivalMap(rv, input, origin, apiKey, (rv.aiCompare?.answers ?? []).map((a) => ({ engine: a.engine, answer: a.answer })));
    if (!rivalMap) return NextResponse.json({ error: '這次沒有查到足夠的資料，請稍後再試。' }, { status: 502 });
    const onMap = rivalMap.points.map((p) => p.name);
    // 圖上的全部一起問（11-27：只問 4 家，沒被問到的 AI 講得少、定位分數會偏低）
    const peers = [...onMap, ...(rivalMap.peers ?? []).filter((n) => !onMap.includes(n))].slice(0, Math.max(4, onMap.length));
    const aiCompare = compare && peers.length >= 2 ? await askCompare(selfShortName(rv.brandName), peers, rivalMap.topic ?? '', !!rivalMap.product, origin, apiKey).catch(() => null) : null;
    // 比較題的回答也拿來重算定位分數（原文越多越準）
    if (aiCompare) {
      const texts = [...rv.questions.flatMap((q) => q.results.map((x) => ({ engine: x.engine, answer: x.answer ?? '' }))), ...aiCompare.answers];
      rivalMap = applyStance(rivalMap, await findStanceHits(rivalMap, texts, apiKey).catch(() => null));
    }
    // 跑的期間報告可能被別的步驟改過，存之前重讀
    const cur = await load(jobId, user.email);
    const merge = (d: Partial<AuditJob>) => ({ ...d, recommendVisibility: d.recommendVisibility ? { ...d.recommendVisibility, rivalMap, ...(aiCompare ? { aiCompare } : {}) } : d.recommendVisibility });
    if (cur.live) updateAuditJob(jobId, { recommendVisibility: merge(cur.live).recommendVisibility });
    if (cur.history) await saveAuditHistory({ id: jobId, email: user.email, kind: cur.history.item.kind, url: cur.history.item.url, createdAt: Date.parse(cur.history.item.createdAt), data: merge(cur.history.data as Partial<AuditJob>) });
    if (compare && !aiCompare) return NextResponse.json({ error: '同業太少或 AI 沒有回答，請稍後再試。', rivalMap }, { status: 502 });
    return NextResponse.json({ rivalMap, aiCompare });
  } catch (e) {
    console.error('rival-map', e);
    return NextResponse.json({ error: '分析失敗，請稍後再試。' }, { status: 502 });
  } finally {
    running.delete(key);
  }
}
