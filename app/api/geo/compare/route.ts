import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, isAdmin } from '@/lib/auth';
import { getAuditHistory, saveAuditHistory } from '@/lib/audit-history';
import { getAuditJob, updateAuditJob } from '@/lib/geo-audit-jobs';
import { extractCompare, fetchCompareAnswers, plainBrand } from '@/lib/geo-compare';
import { selfShortName } from '@/lib/geo-sentiment';
import { LIMITS, clientIp, hoursLeft, takeDaily } from '@/lib/rate-limit';
import type { RecommendVisibility } from '@/lib/geo-recommend-visibility';

// 2026-11-10 健檢時只直接比較排名第一的對手，報告上切到別家就沒有比較（小積木：「只用 AI 比一個對手超怪」）。
// 切到哪家才問那家（每家約 US$0.05＋1 次 SerpApi），問完存回檢測紀錄，下次打開直接用。
// 只能比這份報告裡 AI 真的推薦過的品牌，不能拿來問任意字串。
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: '請先用 Google 帳號登入', needLogin: true }, { status: 401 });
  let body: { id?: unknown; rival?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const rivalIn = typeof body.rival === 'string' ? body.rival.trim() : '';
  const rec = id ? await getAuditHistory(id, user.email).catch(() => null) : null;
  if (!rec) return NextResponse.json({ error: '找不到這份檢測紀錄' }, { status: 404 });

  const data = rec.data as { url?: string; recommendVisibility?: RecommendVisibility | null };
  const rv = data.recommendVisibility;
  const name = rv?.names.find((n) => !n.isSelf && (n.name === rivalIn || plainBrand(n.name) === plainBrand(rivalIn)));
  if (!rv || !name || !data.url) return NextResponse.json({ error: '這個品牌不在這份報告的推薦名單裡' }, { status: 400 });
  const key = plainBrand(name.name);
  const cached = rv.compares?.[key] ?? (rv.compare && plainBrand(rv.compare.rival) === key ? rv.compare : null);
  if (cached) return NextResponse.json({ ok: true, compare: cached });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI 服務沒有設定' }, { status: 503 });
  const limited = isAdmin(user.email) ? null : takeDaily('compare', clientIp(req), LIMITS.keywordRequestsPerDay * 3);
  if (limited) {
    return NextResponse.json({ error: `今天比較對手的次數用完了，${hoursLeft(limited.retryAfterMs)}後可以再比。` }, { status: 429 });
  }

  const selfName = selfShortName(rv.brandName);
  const origin = new URL(data.url).origin;
  const cmp = await fetchCompareAnswers(selfName, name.name, origin).catch(() => null);
  const compare = cmp ? await extractCompare(selfName, cmp.rival, cmp.query, cmp.answers, apiKey).catch(() => null) : null;
  if (!compare || compare.verdicts.length === 0) return NextResponse.json({ error: '問 AI 的時候出錯了，請稍後再試。' }, { status: 502 });

  // 先讀最新的一份再寫回，避免蓋掉同時比較的另一家
  const latest = (await getAuditHistory(id, user.email).catch(() => null)) ?? rec;
  const ld = latest.data as { recommendVisibility?: RecommendVisibility | null };
  const nextRv = { ...(ld.recommendVisibility ?? rv), compares: { ...(ld.recommendVisibility?.compares ?? {}), [key]: compare } };
  const job = getAuditJob(id);
  if (job?.status === 'completed') {
    updateAuditJob(id, { recommendVisibility: nextRv }); // 會順便存回檢測紀錄
  } else {
    await saveAuditHistory({ id, email: user.email, kind: latest.item.kind, url: latest.item.url, createdAt: Date.parse(latest.item.createdAt), data: { ...ld, recommendVisibility: nextRv } });
  }
  return NextResponse.json({ ok: true, compare });
}
