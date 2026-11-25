import { PUBLISHED_POSTS } from '@/lib/geo-posts';
import { STATIC_PAGES, SITE_NAME, SITE_TAGLINE, absUrl } from '@/lib/site';

// 範例站自己的 llms.txt，照 llmstxt.org 的格式：# 標題、> 一句話摘要、
// 逐條「- [標題](網址): 說明」。每個連結都附說明——lib/geo-llms-txt.ts 判定
// 「寫得完整」的門檻就是連結全部有說明，範例站不能自己過不了自己的檢查。
const PAGE_NOTES: Record<string, string> = {
  '/': '輸入網址免費健檢：問三家 AI 推薦了誰、怎麼說你，另有 AI 存取、無障礙與 SEO 健檢',
  '/geo': 'GEO 是什麼、跟 SEO 差在哪，以及依健檢項目分類的知識文章',
  '/scoring': 'GEO、SEO 健檢各檢查什麼、判定規則、SEO 總分怎麼算',
  '/pricing': '健檢與諮詢都免費，後續代為執行優化才依專案報價',
  '/about': '經營者積木媒體行銷是誰、做哪些服務、健檢工具的三個原則',
  '/contact': '電話、地址、Line 與聯絡表單',
};

export function GET() {
  const lines = [
    `# ${SITE_NAME}｜${SITE_TAGLINE}`,
    '',
    `> 免費的 AI 搜尋能見度健檢工具，由台北的 SEO／AI SEO 團隊積木媒體行銷經營。GEO 健檢實際去問 Perplexity、ChatGPT、Google AI 摘要推薦了誰、怎麼說你的品牌，並檢查 AI 爬蟲有沒有被擋、llms.txt 與無障礙；SEO 健檢查 Google 關鍵字排名與多頁網站健檢。`,
    '',
    '## 主要頁面',
    '',
    ...STATIC_PAGES.map((p) => `- [${p.title}](${absUrl(p.path)}): ${PAGE_NOTES[p.path]}`),
    '',
    '## GEO 知識文章',
    '',
    ...PUBLISHED_POSTS.map((p) => `- [${p.title}](${absUrl(p.href)}): ${p.excerpt}`),
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
