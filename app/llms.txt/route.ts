import { PUBLISHED_POSTS } from '@/lib/geo-posts';
import { STATIC_PAGES, SITE_NAME, SITE_TAGLINE, absUrl } from '@/lib/site';

// 範例站自己的 llms.txt，照 llmstxt.org 的格式：# 標題、> 一句話摘要、
// 逐條「- [標題](網址): 說明」。每個連結都附說明——lib/geo-llms-txt.ts 判定
// 「寫得完整」的門檻就是連結全部有說明，範例站不能自己過不了自己的檢查。
const PAGE_NOTES: Record<string, string> = {
  '/': '輸入網址免費健檢，用 8 家 AI 爬蟲的身分實測存取權限、實際去問 AI 認不認得品牌、跑多頁深度健檢',
  '/geo': 'GEO 是什麼、跟 SEO 差在哪，以及依健檢項目分類的知識文章',
  '/scoring': '六個檢測層各看什麼、正常／可優化／需處理／無法判定的判定規則、總分怎麼算',
  '/pricing': '健檢與諮詢都免費，後續代為執行優化才依專案報價',
  '/about': '經營者積木媒體行銷是誰、做哪些服務、健檢工具的三個原則',
  '/contact': '電話、地址、Line 與聯絡表單',
};

export function GET() {
  const lines = [
    `# ${SITE_NAME} ${SITE_TAGLINE}`,
    '',
    `> 免費的 AI 搜尋能見度健檢工具，由台北的 SEO／AI SEO 團隊積木媒體行銷經營。實際以 GPTBot、ClaudeBot、PerplexityBot 等 AI 爬蟲的身分讀你的網站、實際去問 Perplexity 與 ChatGPT 認不認得你的品牌，再跑多頁 SEO + GEO 深度健檢，每一項都給實測值。`,
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
