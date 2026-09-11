import { AI_BOTS } from '@/lib/geo-ai-crawlers';
import { SITE_URL } from '@/lib/site';

// 範例站自己的 robots.txt。用 route handler 而不是 Next 的 robots.ts，因為後者
// 只會輸出 Allow／Disallow／Sitemap，塞不進 Content-Signal 這行。
//
// 沒有這個檔時各家爬蟲「依規範預設允許」，但那是沒設限、不是刻意開放——健檢會這樣
// 備註。所以對 8 家 AI 爬蟲逐一明確寫 Allow，讓「歡迎 AI 讀」是表態出來的。
// Content-Signal 照 /geo/content-signals-declare 那篇文章示範的組合：可以索引、可以當
// AI 回答的參考來源、不拿去訓練模型。/api/ 是健檢用的端點，不需要被索引。
export function GET() {
  const lines = [
    ...AI_BOTS.map((b) => `User-agent: ${b.ua}`),
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
