// ── GEO 知識文章清單（單一來源）────────────────────────
// 文章索引頁、sitemap、llms.txt、文章頁的 Article／BreadcrumbList JSON-LD 都吃這一份，
// 新文章寫完只要在這裡加一筆。href 允許 null 是留給規劃中的主題——還沒寫完的
// 文章先不包成連結（索引頁不會給死連結，sitemap／llms.txt 也不會列）。

export type Post = {
  cat: string;
  title: string;
  excerpt: string;
  href: string | null;
  date: string;       // 發布日期 YYYY-MM-DD
  readMinutes?: number;
};

export const POSTS: Post[] = [
  {
    cat: 'AI 可達性',
    title: 'robots.txt 要怎麼寫，AI 爬蟲才進得來？',
    excerpt: 'robots.txt 擋掉 GPTBot 之後，你在 AI 答案裡就不存在了——這是最常見的需處理項目，也是最快能修好的一項。哪幾行要改、改完怎麼複驗。',
    href: '/geo/robots-txt-blocking-ai',
    date: '2026-05-14',
    readMinutes: 2,
  },
  {
    cat: '內容品質',
    title: '網站用 JavaScript 渲染，AI 讀得到內容嗎？',
    excerpt: 'AI 爬蟲讀到的是空殼，你寫的產品介紹它一個字都看不到。主流 AI 爬蟲不執行 JavaScript，純前端渲染的網站在 AI 眼中可能只是空的 <div>。判定門檻、怎麼修。',
    href: '/geo/js-rendering-empty-shell',
    date: '2026-06-02',
    readMinutes: 3,
  },
  {
    cat: 'AI 可達性',
    title: '要讓 AI 引用你的內容，該怎麼表態？',
    excerpt: '沒說清楚能不能被 AI 引用，AI 乾脆不引用你的內容。search / ai-input / ai-train 三項的差別，以及「未表態」對引用機率的影響。',
    href: '/geo/content-signals-declare',
    date: '2026-06-19',
    readMinutes: 2,
  },
  {
    cat: 'AI 可達性',
    title: 'llms.txt 要怎麼寫，AI 才看得懂你的網站？',
    excerpt: '沒有給 AI 看的網站導覽，AI 只能自己亂猜你在做什麼。格式、放哪裡、要列哪些連結，以及健檢怎麼判定「內容單薄」。',
    href: '/geo/llms-txt-format',
    date: '2026-07-08',
    readMinutes: 3,
  },
  {
    cat: '結構化資料',
    title: '結構化資料要補哪些欄位，AI 才認得出你是誰？',
    excerpt: '結構化資料缺這幾個欄位，AI 認不出你是誰。Organization、LocalBusiness、Product、Article 四種型別各自要補的關鍵欄位，以及常見的標記錯誤。',
    href: '/geo/schema-priority',
    date: '2026-07-25',
    readMinutes: 2,
  },
  {
    cat: '品牌與權威',
    title: 'AI 為什麼引用競爭對手，不是你？',
    excerpt: 'AI 引用了競爭對手，不是你：引用來源怎麼搶回來？從實際去問 AI 的結果反推缺的是內容、權威還是一致性。',
    href: '/geo/ai-cites-competitor',
    date: '2026-08-11',
    readMinutes: 3,
  },
  {
    cat: '技術與索引',
    title: '健檢顯示「無法判定」，是防火牆擋住了嗎？',
    excerpt: '「無法判定」不是通過：防火牆可能把 AI 爬蟲一起擋掉了。為什麼健檢會標成 ⚪ 無法判定，以及你要怎麼自己確認。',
    href: '/geo/waf-false-unknown',
    date: '2026-08-29',
    readMinutes: 3,
  },
  {
    cat: '技術與索引',
    title: 'robots.txt 明明允許，AI 爬蟲卻連不進來？',
    excerpt: '「政策允許但實測被擋」是 WAF／CDN 擋的，不是 robots.txt 的問題。WAF／CDN 是什麼、為什麼會蓋過 robots.txt 的允許，以及怎麼放行。',
    href: '/geo/waf-blocks-despite-allow',
    date: '2026-09-04',
    readMinutes: 3,
  },
];

export const PUBLISHED_POSTS = POSTS.filter((p): p is Post & { href: string } => !!p.href);

export function findPost(href: string): Post & { href: string } {
  const post = PUBLISHED_POSTS.find((p) => p.href === href);
  if (!post) throw new Error(`lib/geo-posts.ts 沒有這篇文章：${href}`);
  return post;
}
