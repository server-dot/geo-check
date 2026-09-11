// ── 範例站自己的站點資訊 ────────────────────────────
// geo.stack.com.tw 同時是 geo-check 的對外範例站，會被自己的健檢工具測——
// 所以這裡集中放 canonical、sitemap、llms.txt、Organization JSON-LD 共用的固定資料，
// 改一處全站一致，不會出現 robots.txt 指的 sitemap 網址跟 canonical 網域對不起來這種事。

export const SITE_URL = 'https://geo.stack.com.tw';
export const SITE_NAME = 'GEOCHECK';
export const SITE_TAGLINE = 'AI 搜尋能見度健檢';
// 描述控制在 80 字內（健檢的 TKD 門檻）
export const SITE_DESCRIPTION =
  '免費檢測網站在 ChatGPT、Perplexity 等 AI 搜尋引擎眼中的能見度：以 AI 爬蟲身分實測、實際去問 AI 認不認得你，並跑多頁深度健檢。';

// 經營者：積木媒體行銷（聯絡資訊跟 /contact 頁、頁尾一致）
export const ORG = {
  name: '積木媒體行銷',
  url: 'https://stack.com.tw/',
  logo: `${SITE_URL}/geocheck-logo.webp`,
  telephone: '+886-2-2745-7601',
  description: '台北的 SEO 與 AI SEO 團隊，做關鍵字優化、網站架構、內容與外部連結，也處理 AIO / GEO / AEO 的能見度問題。',
  address: {
    streetAddress: '信義區東興路 49 號 11 樓',
    addressLocality: '台北市',
    postalCode: '110',
    addressCountry: 'TW',
  },
  openingHours: 'Mo-Fr 10:00-19:00',
  sameAs: ['https://stack.com.tw/', 'https://lin.ee/UhKq8H1'],
} as const;

// 五個固定行銷頁（文章另外在 lib/geo-posts.ts）
export const STATIC_PAGES = [
  { path: '/', title: SITE_TAGLINE, changeFrequency: 'weekly', priority: 1 },
  { path: '/geo', title: 'GEO 知識', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/scoring', title: '判斷標準', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/pricing', title: '費用', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/about', title: '關於我們', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', title: '聯絡我們', changeFrequency: 'monthly', priority: 0.5 },
] as const;

export function absUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
