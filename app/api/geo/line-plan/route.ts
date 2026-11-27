import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_ERROR, loadAdminReport } from '@/lib/report-access';
import { assertPublicUrl } from '@/lib/geo-url-guard';
import { cleanPlan, runLinePlan, suggestLines } from '@/lib/line-plan';
import { buildPlanWorkbook } from '@/lib/line-plan-excel';
import { MAX_LINE_KEYWORDS, MAX_NAMED_RIVALS, type LinePlan, type LinePlanInput } from '@/lib/line-plan-types';
import { selfShortName } from '@/lib/geo-sentiment';
import { isSameSite, hostnameOf } from '@/lib/geo-brand-visibility';

// 產品線作戰清單：公司帳號才能用。
// GET ?mode=lines 推估產品線（便宜模型一次）；?mode=xlsx 下載；其他＝目前狀態。POST 開始跑（背景跑，前端輪詢）。
export const maxDuration = 300;

// 畫面用不到 AI 回答全文，輪詢不帶
const lite = (p?: LinePlan | null) => (p ? { ...cleanPlan(p), analysis: null } : null);
const running = new Map<string, { step: string; error?: string; plan?: LinePlan }>();
const deny = (k: keyof typeof ACCESS_ERROR) => NextResponse.json({ error: ACCESS_ERROR[k][1] }, { status: ACCESS_ERROR[k][0] });

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId') ?? '';
  const r = await loadAdminReport(req, jobId);
  if (typeof r === 'string') return deny(r);
  const mode = req.nextUrl.searchParams.get('mode');
  if (mode === 'lines') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return NextResponse.json({ error: 'AI 服務沒有設定' }, { status: 503 });
    const lines = await suggestLines(new URL(r.data.url!).origin, key, (req.nextUrl.searchParams.get('focus') ?? '').trim().slice(0, 16));
    return lines?.length ? NextResponse.json({ lines }) : NextResponse.json({ error: '讀不到網站或整理不出產品線，請稍後再試。' }, { status: 502 });
  }
  if (mode === 'xlsx') {
    if (!r.data.linePlan) return NextResponse.json({ error: '還沒有作戰清單' }, { status: 404 });
    const buf = await buildPlanWorkbook(cleanPlan(r.data.linePlan), r.data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="line-plan.xlsx"; filename*=UTF-8''${encodeURIComponent(`${r.data.linePlan.brand}_待辦_${r.data.linePlan.checkedAt.slice(0, 10)}.xlsx`)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const run = running.get(`${r.user.email}|${jobId}`);
  return NextResponse.json({ running: !!run && !run.error && !run.plan, step: run?.step ?? '', error: run?.error ?? '', plan: lite(run?.plan ?? r.data.linePlan) });
}

export async function POST(req: NextRequest) {
  let body: { jobId?: unknown; picks?: unknown; rivals?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  const r = await loadAdminReport(req, jobId);
  if (typeof r === 'string') return deny(r);
  const key = `${r.user.email}|${jobId}`;
  const cur = running.get(key);
  if (cur && !cur.error && !cur.plan) return NextResponse.json({ error: '已經在跑了' }, { status: 409 });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !process.env.BRIGHTDATA_API_KEY) return NextResponse.json({ error: '搜尋服務沒有設定' }, { status: 503 });
  const origin = new URL(r.data.url!).origin;
  const host = hostnameOf(origin);
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const picks: LinePlanInput['picks'] = (Array.isArray(body.picks) ? body.picks : [])
    .map((p: { line?: unknown; pages?: unknown; keyword?: unknown; words?: unknown }) => ({
      line: str(p?.line, 16),
      keyword: str(p?.keyword, 24),
      pages: (Array.isArray(p?.pages) ? p.pages : []).filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u) && isSameSite(hostnameOf(u), host)).slice(0, 6),
      words: (Array.isArray(p?.words) ? p.words : []).map((w: unknown) => str(w, 12)).filter((w: string) => w.length >= 2).slice(0, 2),
    }))
    .filter((p) => p.line && p.keyword.length >= 2 && p.pages.length > 0);
  if (picks.length === 0) return NextResponse.json({ error: '至少勾一個關鍵字' }, { status: 400 });
  if (picks.length > MAX_LINE_KEYWORDS) return NextResponse.json({ error: `一次最多 ${MAX_LINE_KEYWORDS} 個關鍵字` }, { status: 400 });
  const rivals: LinePlanInput['rivals'] = [];
  for (const x of (Array.isArray(body.rivals) ? body.rivals : []).slice(0, MAX_NAMED_RIVALS) as { name?: unknown; url?: unknown }[]) {
    const name = str(x?.name, 30);
    const url = str(x?.url, 200);
    if (!name && !url) continue;
    if (!name || !url) return NextResponse.json({ error: '指定對手的名稱和網址要一起填' }, { status: 400 });
    try {
      rivals.push({ name, url: (await assertPublicUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`)).origin });
    } catch {
      return NextResponse.json({ error: `${name} 的網址不正確` }, { status: 400 });
    }
  }
  const brand = selfShortName(r.data.recommendCandidates?.input.brandName ?? r.data.recommendVisibility?.brandName ?? host);
  const base = {
    input: r.data.recommendCandidates?.input ?? { brandName: brand, title: r.data.engine?.visibility?.title ?? '', description: '', h1: [], leadParagraphs: [], preview: '' },
    brandChecks: r.data.engine?.brandVisibility ?? [],
    insights: r.data.brandInsights ?? null,
  };
  const state: { step: string; error?: string; plan?: LinePlan } = { step: '開始…' };
  running.set(key, state);
  void runLinePlan(origin, brand, { picks, rivals }, base, apiKey, (s) => (state.step = s))
    .then(async (plan) => {
      await r.save({ linePlan: plan });
      state.plan = plan;
    })
    .catch((e) => {
      console.error('line-plan', e);
      state.error = '跑到一半出錯了，請稍後再試。';
    })
    .finally(() => setTimeout(() => running.get(key) === state && running.delete(key), 10 * 60_000));
  return NextResponse.json({ ok: true });
}
