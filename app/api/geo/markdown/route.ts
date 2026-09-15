import { NextRequest, NextResponse } from 'next/server';
import { getAuditJob } from '@/lib/geo-audit-jobs';
import { buildReportMarkdown } from '@/lib/geo-report-markdown';

// 報告的 AI 可讀版：GET /api/geo/markdown?id=geo_xxx → text/markdown
//
// 只吃 job id，不吃網域：id 是隨機的、一小時過期，等於只有拿到報告的人看得到
// 自己那一份。這一頁存在的理由不是 SEO，是自我一致——整份報告在講「AI 讀不讀
// 得到你的內容」，而報告本身是前端渲染的頁面，AI 抓下去只有骨架。
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 job id' }, { status: 400 });

  const job = getAuditJob(id);
  if (!job) return NextResponse.json({ error: '找不到這份健檢（可能已過期，請重新檢測）' }, { status: 404 });

  return new NextResponse(buildReportMarkdown(job), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // 這是一次性的健檢結果，不要讓中間層留快取
      'Cache-Control': 'no-store',
      // 搜尋引擎不用收錄別人的健檢結果
      'X-Robots-Tag': 'noindex',
    },
  });
}
