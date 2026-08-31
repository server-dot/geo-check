import { LEVEL, CATEGORY, sortByOrder, type CheckResult } from './geo-audit-rules';
import { runAiChecks } from './geo-audit-ai';
import { buildLocalBizCheck, buildSchemaCompletenessCheck } from './geo-schema-check';
import { normalizeUrl, type CrawlResult } from './geo-audit-crawler';

// ── GEO 深度健檢：全站彙總層 ────────────────────────────
// 吃 crawlSite 的整包爬取資料，逐項彙總成「總體」結論。
// 跟 stacktools 的 site-audit-aggregate.ts 同一套判斷邏輯，差別是**完全不碰 GSC**——
// geo-check 檢測的是陌生網址，沒有對方的 Google Search Console 授權，
// 所以這裡全部用爬蟲能拿到的事實判斷，準確度會比有 GSC 加持的內部工具低一些，
// 這是先天限制，不是沒做好；報告裡該註明的地方會註明。

function toPath(origin: string, u: string): string {
  return normalizeUrl(u).replace(origin, '') || '/';
}

export async function aggregateAuditChecks(
  crawl: CrawlResult,
  onProgress?: (msg: string) => void,
): Promise<CheckResult[]> {
  const { origin, pages, sitemapUrls, sitemapExists, robotsExists, llmsExists, reachedCap } = crawl;

  // 空殼死頁（soft-404）：HTTP 回 200 但整頁沒 title、沒 h1、沒圖、0 內部連結、內文極短
  const isEmptyShell = (p: CrawlResult['pages'][number]) =>
    p.ok && !p.title && p.h1 === 0 && p.imgTotal === 0 && p.internalLinks.length === 0 && p.mainText.trim().length < 50;
  const shells = pages.filter(isEmptyShell);

  const htmlPages = pages.filter((p) => p.ok && (p.title || p.h1 || p.imgTotal || p.mainText) && !isEmptyShell(p));
  const Y = htmlPages.length || 1;
  const rangeNote = reachedCap ? `（已達爬取上限 ${pages.length} 頁，可能未涵蓋整站）` : `（爬取範圍：${pages.length} 頁）`;

  const out: CheckResult[] = [];

  // 1. GA / GSC 追蹤碼
  const analytics = [...new Set(pages.flatMap((p) => p.analytics))];
  out.push(analytics.length
    ? { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '網站有無串接 GA、GSC 等資料分析軟體', status: 'ok', advice: `全站偵測到：${analytics.join('、')}`, evidence: analytics.join('、') }
    : { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '網站有無串接 GA、GSC 等資料分析軟體', status: 'fail', advice: '全站原始碼找不到 GA4 / GTM / GSC 追蹤碼，建議安裝以追蹤成效', evidence: '（無）' });

  // 2. Sitemap
  out.push(sitemapExists && sitemapUrls.length
    ? { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '正確提交或建立 Sitemap', status: 'ok', advice: `sitemap.xml 存在，共 ${sitemapUrls.length} 個網址`, evidence: `${origin}/sitemap.xml` }
    : { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '正確提交或建立 Sitemap', status: 'fail', advice: 'sitemap.xml 不存在或讀不到，建議建立並提交至 GSC', evidence: `${origin}/sitemap.xml` });

  // 3. robots.txt
  out.push(robotsExists
    ? { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '建立 robots.txt', status: 'ok', advice: 'robots.txt 存在', evidence: `${origin}/robots.txt` }
    : { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '建立 robots.txt', status: 'fail', advice: 'robots.txt 不存在或讀不到，建議建立', evidence: `${origin}/robots.txt` });

  // 4. 有無建立索引：沒有 GSC，退回 noindex 標籤判斷（實際收錄狀況無法在這裡確認）
  {
    const noindex = htmlPages.filter((p) => p.noindex);
    out.push(noindex.length
      ? { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有無建立索引', status: 'warn', advice: `${noindex.length}/${Y} 頁設有 noindex（會被排除索引），例如：${noindex.slice(0, 5).map((p) => toPath(origin, p.url)).join('、')}，請確認是否刻意；實際收錄狀況需另外用 GSC 或 site: 查詢複核`, evidence: `${noindex.length}/${Y} 頁 noindex`, details: noindex.map((p) => ({ url: p.url, note: '設有 noindex，會被排除索引' })) }
      : { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有無建立索引', status: 'warn', advice: `爬取頁面未發現 noindex；實際收錄狀況需另外用 GSC 或 site: 查詢確認${rangeNote}`, evidence: `0/${Y} 頁 noindex` });
  }

  // 5. Local Business：純規則核對欄位完整度（地址／電話／營業時間），不再是「建議人工複核」的空話
  out.push(buildLocalBizCheck(pages.map((p) => ({ url: p.url, jsonLdNodes: p.jsonLdNodes }))));

  // 6. 麵包屑
  {
    const noBc = htmlPages.filter((p) => !p.hasBreadcrumb);
    const bc = Y - noBc.length;
    out.push(bc === 0
      ? { key: 'breadcrumb', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有無麵包屑', status: 'warn', advice: `爬取頁面皆未偵測到麵包屑（0/${Y}），建議加上 BreadcrumbList`, evidence: `0/${Y} 頁有麵包屑`, details: noBc.map((p) => ({ url: p.url, note: '未偵測到麵包屑' })) }
      : bc < Y
        ? { key: 'breadcrumb', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有無麵包屑', status: 'warn', advice: `僅 ${bc}/${Y} 頁有麵包屑，建議全站補齊`, evidence: `${bc}/${Y} 頁有麵包屑`, details: noBc.map((p) => ({ url: p.url, note: '未偵測到麵包屑' })) }
        : { key: 'breadcrumb', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有無麵包屑', status: 'ok', advice: `爬取頁面皆有麵包屑（${bc}/${Y}）`, evidence: `${bc}/${Y} 頁有麵包屑` });
  }

  // 7. 內部連結結構
  {
    const noLink = htmlPages.filter((p) => p.internalLinks.length === 0);
    const avg = Math.round(htmlPages.reduce((s, p) => s + p.internalLinks.length, 0) / Y);
    out.push(noLink.length
      ? { key: 'internalLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '內部連結結構', status: 'warn', advice: `有 ${noLink.length}/${Y} 頁沒有任何內部連結（平均每頁 ${avg} 條），建議補相關內容互連`, evidence: `平均 ${avg} 條/頁，${noLink.length} 頁無內部連結`, details: noLink.map((p) => ({ url: p.url, note: '沒有任何內部連結' })) }
      : { key: 'internalLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '內部連結結構', status: 'ok', advice: `內部連結結構合理（平均每頁約 ${avg} 條）`, evidence: `平均 ${avg} 條/頁` });
  }

  // 8. 無效連結
  {
    const broken = pages.filter((p) => p.status >= 400);
    out.push(broken.length
      ? { key: 'brokenLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '無效連結檢查', status: 'fail', advice: `爬取 ${pages.length} 頁中有 ${broken.length} 頁連到壞頁（4xx/5xx），例如：${broken.slice(0, 5).map((p) => `${toPath(origin, p.url)}（${p.status || '連不上'}）`).join('、')}，建議修正或移除連結`, evidence: `${broken.length}/${pages.length} 頁異常`, details: broken.map((p) => ({ url: p.url, note: `回應 ${p.status || '連不上'}` })) }
      : { key: 'brokenLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '無效連結檢查', status: 'ok', advice: `爬取 ${pages.length} 頁未發現壞連結`, evidence: `0/${pages.length} 頁異常` });
  }

  // 9. 重複內容：沒有 GSC，退回 canonical + 重複標題判斷
  {
    const noCanonPages = htmlPages.filter((p) => !p.canonical);
    const noCanon = noCanonPages.length;
    const titleGroups = new Map<string, typeof htmlPages>();
    for (const p of htmlPages) if (p.title) {
      const g = titleGroups.get(p.title) ?? [];
      g.push(p);
      titleGroups.set(p.title, g);
    }
    const dupGroups = [...titleGroups.entries()].filter(([, g]) => g.length > 1);
    const problems: string[] = [];
    if (noCanon) problems.push(`${noCanon}/${Y} 頁未設 canonical`);
    if (dupGroups.length) problems.push(`${dupGroups.length} 組頁面標題重複`);
    const dupDetails = [
      ...noCanonPages.map((p) => ({ url: p.url, note: '未設 canonical' })),
      ...dupGroups.flatMap(([title, g]) => g.map((p) => ({ url: p.url, note: `標題重複：${title}` }))),
    ];
    out.push(problems.length
      ? { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '檢查重複內容', status: 'warn', advice: `${problems.join('、')}，容易產生重複內容，建議補 canonical 並人工複核`, evidence: problems.join('、'), details: dupDetails }
      : { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '檢查重複內容', status: 'ok', advice: '頁面皆有 canonical、未發現重複標題', evidence: `0 問題（共 ${Y} 頁）` });
  }

  // 10. TKD 完整性
  {
    const charLen = (s: string) => [...s.trim()].length;
    let te = 0, tl = 0, de = 0, dl = 0;
    const tkdDetails: { url: string; note: string }[] = [];
    for (const p of htmlPages) {
      const probs: string[] = [];
      if (!p.title) { te++; probs.push('Title 留空'); }
      else if (charLen(p.title) > 30) { tl++; probs.push(`Title 過長（${charLen(p.title)} 字）`); }
      if (!p.description) { de++; probs.push('Description 留空'); }
      else if (charLen(p.description) > 80) { dl++; probs.push(`Description 過長（${charLen(p.description)} 字）`); }
      if (probs.length) tkdDetails.push({ url: p.url, note: probs.join('、') });
    }
    const issues = te + tl + de + dl;
    out.push(issues
      ? { key: 'tkd', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: 'TKD 完整性', status: 'fail', advice: `共 ${Y} 頁中：Title 留空 ${te}、過長(>30) ${tl}；Description 留空 ${de}、過長(>80) ${dl}，建議補齊並控制字數`, evidence: `T空${te}/長${tl}｜D空${de}/長${dl}（共 ${Y} 頁）`, details: tkdDetails }
      : { key: 'tkd', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: 'TKD 完整性', status: 'ok', advice: `爬取 ${Y} 頁 Title / Description 皆有填且長度適當`, evidence: `共 ${Y} 頁皆正常` });
  }

  // 11. h1、h2 使用
  {
    const noH1 = htmlPages.filter((p) => p.h1 === 0).length;
    const multiH1 = htmlPages.filter((p) => p.h1 > 1).length;
    const noH2 = htmlPages.filter((p) => p.h2 === 0).length;
    const problems: string[] = [];
    if (noH1) problems.push(`${noH1} 頁缺 h1`);
    if (multiH1) problems.push(`${multiH1} 頁有多個 h1`);
    if (noH2) problems.push(`${noH2} 頁缺 h2`);
    const headingDetails: { url: string; note: string }[] = [];
    for (const p of htmlPages) {
      const probs: string[] = [];
      if (p.h1 === 0) probs.push('缺 h1');
      else if (p.h1 > 1) probs.push(`有 ${p.h1} 個 h1`);
      if (p.h2 === 0) probs.push('缺 h2');
      if (probs.length) headingDetails.push({ url: p.url, note: probs.join('、') });
    }
    out.push(problems.length
      ? { key: 'headings', level: LEVEL.RANK, category: CATEGORY.TECH, item: 'h1、h2 使用', status: 'fail', advice: `共 ${Y} 頁中：${problems.join('、')}，建議補齊標題結構讓 AI／搜尋引擎理解`, evidence: problems.join('、'), details: headingDetails }
      : { key: 'headings', level: LEVEL.RANK, category: CATEGORY.TECH, item: 'h1、h2 使用', status: 'ok', advice: `爬取 ${Y} 頁標題結構完整`, evidence: `共 ${Y} 頁皆正常` });
  }

  // 12a. Schema：純規則核對全站 JSON-LD 欄位完整度，不用 AI 猜
  out.push(buildSchemaCompletenessCheck(pages.map((p) => ({ url: p.url, jsonLdNodes: p.jsonLdNodes }))));

  // 12b. E-E-A-T：規則判不了的語意題，交給 AI（GPT-4o via OpenRouter）判斷。
  // 取樣頁面改成優先挑「關於／團隊／個人簡介」這類最可能寫信任訊號的頁面，
  // 不再只抓爬蟲順序的前三頁——原本常常抓到首頁＋服務頁，漏掉真正放學歷／
  // 經歷的「關於我」頁，AI 看不到證據就用 prompt 裡的範例句子亂填。同時把
  // 結構化資料裡查得到的 author／Person 標記當既有事實一併丟給 AI，減少它
  // 純憑內文猜測（見 [[geo-check 待辦]] 的 bug 記錄）。
  {
    const home = htmlPages.find((p) => p.isHome) ?? htmlPages[0];
    const ABOUT_URL_PATTERN = /\/(about|team|profile|bio|founder|author|關於|个人)/i;
    const aboutPages = htmlPages.filter((p) => ABOUT_URL_PATTERN.test(p.url));
    const otherPages = htmlPages.filter((p) => !ABOUT_URL_PATTERN.test(p.url));
    // 關於頁排最前面，且每頁各自限額截斷（而不是全部接起來最後才砍）——
    // 不然首頁的內文本身就很長，會把接在後面的關於頁擠到 4000 字上限外面，
    // AI 實際上根本沒看到關於頁的內容。
    const sampledPages = [...aboutPages, home, ...otherPages].filter(
      (p, i, arr) => p && arr.findIndex((q) => q?.url === p.url) === i
    );
    const PER_PAGE_CHAR_CAP = 1500;
    const sampleText = sampledPages
      .slice(0, 4)
      .map((p) => p!.mainText.slice(0, PER_PAGE_CHAR_CAP))
      .join('\n\n');

    const hasAuthorSchema = pages.some((p) =>
      p.jsonLdNodes.some((n) => {
        const type = (n as { '@type'?: unknown })['@type'];
        const types = Array.isArray(type) ? type : [type];
        return types.includes('Person') || 'author' in n;
      })
    );

    onProgress?.('AI 語意判斷中（E-E-A-T）…');
    const ai = await runAiChecks({ url: home?.url ?? origin, mainText: sampleText, hasAuthorSchema });
    out.push(...ai);
  }

  // 13. llms.txt
  out.push(llmsExists
    ? { key: 'llmsSeo', level: LEVEL.RANK, category: CATEGORY.TECH, item: '網站根目錄有無部署 llms.txt', status: 'ok', advice: 'llms.txt 存在', evidence: `${origin}/llms.txt` }
    : { key: 'llmsSeo', level: LEVEL.RANK, category: CATEGORY.TECH, item: '網站根目錄有無部署 llms.txt', status: 'warn', advice: 'llms.txt 不存在，建議於根目錄部署', evidence: `${origin}/llms.txt` });

  // 14. 有無網址 404 / soft-404
  {
    const bad = pages.filter((p) => p.status >= 400);
    const details = [
      ...bad.map((p) => ({ url: p.url, note: `回應 ${p.status || '連不上'}` })),
      ...shells.map((p) => ({ url: p.url, note: 'soft-404（回 200 但內容為空／錯誤頁）' })),
    ];
    const parts: string[] = [];
    if (bad.length) parts.push(`${bad.length} 頁回應異常（含 404）`);
    if (shells.length) parts.push(`${shells.length} 頁 soft-404`);
    out.push(details.length
      ? { key: 'page', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有無網址 404', status: 'warn', advice: `爬取 ${pages.length} 頁中：${parts.join('、')}，建議修正或從 sitemap 移除`, evidence: `異常 ${bad.length}｜soft-404 ${shells.length}（共 ${pages.length} 頁）`, details }
      : { key: 'page', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有無網址 404', status: 'ok', advice: `爬取 ${pages.length} 頁皆正常回應，未發現 404`, evidence: `0/${pages.length} 頁異常` });
  }

  // 15. 手機端優化
  {
    const noVp = htmlPages.filter((p) => !p.hasViewport);
    const vp = Y - noVp.length;
    out.push(vp === Y
      ? { key: 'viewport', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '手機端優化', status: 'ok', advice: `爬取 ${Y} 頁皆有設定 viewport`, evidence: `${vp}/${Y} 頁` }
      : { key: 'viewport', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '手機端優化', status: 'warn', advice: `僅 ${vp}/${Y} 頁設定 viewport，其餘手機端排版可能異常`, evidence: `${vp}/${Y} 頁`, details: noVp.map((p) => ({ url: p.url, note: '缺少 viewport' })) });
  }

  // 16. 分類層級是否清楚
  {
    const depths = htmlPages.map((p) => {
      try {
        return new URL(p.url).pathname.split('/').filter(Boolean).length;
      } catch {
        return 0;
      }
    });
    const maxDepth = depths.length ? Math.max(...depths) : 0;
    const bc = htmlPages.filter((p) => p.hasBreadcrumb).length;
    out.push(bc > 0 || maxDepth >= 1
      ? { key: 'categoryDepth', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: '分類層級是否清楚', status: 'ok', advice: `網址層級最深 ${maxDepth} 層、${bc}/${Y} 頁有麵包屑，分類尚屬清楚`, evidence: `最深 ${maxDepth} 層｜麵包屑 ${bc}/${Y}` }
      : { key: 'categoryDepth', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: '分類層級是否清楚', status: 'warn', advice: '未偵測到明顯分類層級（網址扁平且無麵包屑），建議規劃清楚分類', evidence: `最深 ${maxDepth} 層` });
  }

  // 17. 首頁內容優化
  {
    const home = pages.find((p) => p.isHome);
    if (!home || !home.ok) {
      out.push({ key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容優化', status: 'warn', advice: '抓不到首頁內容，建議人工複核首頁', evidence: origin });
    } else {
      const problems: string[] = [];
      if (home.h1 === 0) problems.push('缺少 <h1>');
      else if (home.h1 > 1) problems.push(`<h1> 有 ${home.h1} 個`);
      if (home.h2 === 0) problems.push('缺少 <h2>');
      const evidence = `首頁 h1 × ${home.h1}，h2 × ${home.h2}`;
      out.push(problems.length
        ? { key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容優化', status: 'fail', advice: `首頁${problems.join('、')}，建議補齊標題結構`, evidence }
        : { key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容優化', status: 'ok', advice: '首頁標題結構完整；文案吸引力建議人工複核', evidence });
    }
  }

  // 18. 圖片 ALT
  {
    const totalImg = htmlPages.reduce((s, p) => s + p.imgTotal, 0);
    const emptyImg = htmlPages.reduce((s, p) => s + p.imgAltEmpty, 0);
    const emptyPages = htmlPages.filter((p) => p.imgAltEmpty > 0);
    out.push(emptyImg
      ? { key: 'imgAlt', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片 ALT 標記', status: 'fail', advice: `全站 ${emptyImg}/${totalImg} 張圖 alt 留空（分布於 ${emptyPages.length} 頁），建議補上描述性 alt`, evidence: `${emptyImg}/${totalImg} 張空白`, details: emptyPages.map((p) => ({ url: p.url, note: `${p.imgAltEmpty} 張圖 alt 留空` })) }
      : { key: 'imgAlt', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片 ALT 標記', status: 'ok', advice: `爬取頁面圖片皆有 alt（共 ${totalImg} 張）`, evidence: `0/${totalImg} 張空白` });
  }

  // 19. 縮圖及多媒體優化
  {
    const totalImg = htmlPages.reduce((s, p) => s + p.imgTotal, 0);
    const legacy = htmlPages.reduce((s, p) => s + p.imgLegacy, 0);
    const legacyPages = htmlPages.filter((p) => p.imgLegacy > 0);
    out.push(legacy
      ? { key: 'imgFormat', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '縮圖及多媒體優化', status: 'warn', advice: `全站 ${legacy}/${totalImg} 張圖為非 WebP/AVIF 格式，建議改用現代格式並壓縮`, evidence: `${legacy}/${totalImg} 張非現代格式`, details: legacyPages.map((p) => ({ url: p.url, note: `${p.imgLegacy} 張非現代格式` })) }
      : { key: 'imgFormat', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '縮圖及多媒體優化', status: 'ok', advice: `爬取頁面圖片皆為現代格式（共 ${totalImg} 張）`, evidence: `0/${totalImg} 張` });
  }

  // 20. 外部連結
  {
    const totalExt = htmlPages.reduce((s, p) => s + p.externalCount, 0);
    out.push(totalExt === 0
      ? { key: 'externalLinks', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '外部連結檢查', status: 'warn', advice: '全站幾乎沒有外部連結，適度引用權威來源有助信任度', evidence: '0 條外部連結' }
      : { key: 'externalLinks', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '外部連結檢查', status: 'ok', advice: `全站約 ${totalExt} 條外部連結，連結有效性與品質建議人工複核`, evidence: `約 ${totalExt} 條外部連結` });
  }

  return sortByOrder(out);
}
