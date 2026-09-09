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

// Google 在 SERP 是用「像素寬度」截斷標題，不是字元數——純字數門檻（例如「>30 字」）
// 對中英夾雜的標題不準：全形字（中文、全形標點）跟半形字（英文字母、數字、符號）佔的
// 寬度差一倍，同樣是 30 字，「內部知識庫 AI 助理」跟純中文標題的實際寬度差很多。
// 這裡用簡化估算：全形 ≈20px/字、半形 ≈10px/字，桌面版安全上限抓 600px——
// 這組係數跟門檻是用實際 SERP 截斷案例回推校準的，跟google官方的可變寬度渲染
// 比一定有誤差，但比純字數門檻準得多，抓超標的方向不會錯。
const FULLWIDTH_PX = 20;
const HALFWIDTH_PX = 10;
const TITLE_SAFE_PX = 600;

function isFullWidthChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) || // 諺文字母
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK 部首～彝文
    (code >= 0xac00 && code <= 0xd7a3) || // 諺文音節
    (code >= 0xf900 && code <= 0xfaff) || // CJK 相容表意文字
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 相容格式
    (code >= 0xff00 && code <= 0xff60) || // 全形字符
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd) // CJK 擴展區
  );
}

function estimateTitlePixelWidth(s: string): number {
  let width = 0;
  for (const ch of s) width += isFullWidthChar(ch) ? FULLWIDTH_PX : HALFWIDTH_PX;
  return width;
}

export async function aggregateAuditChecks(
  crawl: CrawlResult,
  onProgress?: (msg: string) => void,
): Promise<CheckResult[]> {
  const { origin, pages, sitemapUrls, sitemapExists, robotsExists, llmsExists, reachedCap } = crawl;

  // 空殼死頁（soft-404）：HTTP 回 200 但整頁沒 title、沒 h1、沒圖、0 內部連結、內文極短。
  // 排除 nonHtml（例如 llms.txt 風格的 /page.md 純文字鏡像頁）——那是我們爬蟲主動跳過
  // 解析，不代表頁面真的是空殼，不該當成 soft-404 倒扣。
  const isEmptyShell = (p: CrawlResult['pages'][number]) =>
    !p.nonHtml && p.ok && !p.title && p.h1 === 0 && p.imgTotal === 0 && p.internalLinks.length === 0 && p.mainText.trim().length < 50;
  const shells = pages.filter(isEmptyShell);

  const htmlPages = pages.filter((p) => p.ok && (p.title || p.h1 || p.imgTotal || p.mainText) && !isEmptyShell(p));
  const Y = htmlPages.length || 1;
  const rangeNote = reachedCap ? `（已達爬取上限 ${pages.length} 頁，可能未涵蓋整站）` : `（爬取範圍：${pages.length} 頁）`;

  const out: CheckResult[] = [];

  // 1. GA / GSC 追蹤碼
  const analytics = [...new Set(pages.flatMap((p) => p.analytics))];
  out.push(analytics.length
    ? { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '有沒有裝流量分析工具', status: 'ok', advice: `已裝：${analytics.join('、')}`, evidence: analytics.join('、') }
    : { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '有沒有裝流量分析工具', status: 'fail', advice: '網站上找不到任何流量分析工具。', impact: '沒有數據就看不到有多少人來、從哪裡來、看了哪幾頁。之後不管做什麼優化，都沒辦法判斷到底有沒有效。', technical: '全站原始碼找不到 GA4 / GTM / GSC 的追蹤碼。安裝 GA4 或串接 Google Search Console。', evidence: '（無）' });

  // 2. Sitemap
  out.push(sitemapExists && sitemapUrls.length
    ? { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '有沒有給搜尋引擎的網站地圖', status: 'ok', advice: `有網站地圖，列了 ${sitemapUrls.length} 個網址`, evidence: `${origin}/sitemap.xml` }
    : { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '有沒有給搜尋引擎的網站地圖', status: 'fail', advice: '網站上沒有網站地圖，或是讀不到。', impact: '網站地圖是一份「我有哪些頁面」的清單。沒有的話，搜尋引擎跟 AI 只能一頁一頁點連結慢慢找，新頁面或藏得比較深的頁面很容易整個被漏掉。', technical: '讀不到 sitemap.xml。建立 sitemap.xml 並提交到 Google Search Console。', evidence: `${origin}/sitemap.xml` });

  // 3. robots.txt
  out.push(robotsExists
    ? { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有沒有 robots.txt', status: 'ok', advice: '有 robots.txt', evidence: `${origin}/robots.txt` }
    : { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有沒有 robots.txt', status: 'fail', advice: '網站上沒有 robots.txt，或是讀不到。', impact: 'robots.txt 是你對各家爬蟲表態的地方——誰能看、誰不能看。沒有這個檔案時規範上預設「全部都可以」，但那是預設值，不是你的意思：等於你從來沒表過態，也隨時可能被別人的設定誤傷。', technical: '讀不到 robots.txt。在網站根目錄建立，並明確寫出允許哪些爬蟲存取。', evidence: `${origin}/robots.txt` });

  // 4. 有無建立索引：沒有 GSC，退回 noindex 標籤判斷（實際收錄狀況無法在這裡確認）
  {
    const noindex = htmlPages.filter((p) => p.noindex);
    // 0 個 noindex 是乾淨的結果（沒有東西擋索引），不該跟「真的有 noindex」
    // 掛同一個 warn 等級——後面那句「需另外用 GSC 複核」只是誠實揭露這裡
    // 的檢測極限（沒有對方的 GSC 授權，讀不到實際收錄狀況），是註記，不是
    // 扣分理由。
    out.push(noindex.length
      ? { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有沒有頁面被設成不給收錄', status: 'warn', advice: `${Y} 頁裡有 ${noindex.length} 頁被設定成「不要收錄」，例如：${noindex.slice(0, 5).map((p) => toPath(origin, p.url)).join('、')}。`, impact: '這幾頁不會出現在搜尋結果裡，AI 也拿不到。如果是你刻意設的（例如後台頁、測試頁）那沒問題；如果不是，這幾頁等於白做了。', technical: '這些頁面帶有 noindex 標籤。實際收錄狀況要另外用 GSC 或 site: 查詢複核。', evidence: `${noindex.length}/${Y} 頁 noindex`, details: noindex.map((p) => ({ url: p.url, note: '設成不給收錄（noindex）' })) }
      : { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有沒有頁面被設成不給收錄', status: 'ok', advice: `爬到的頁面沒有一頁被擋住收錄${rangeNote}`, technical: '未發現 noindex 標籤。實際收錄狀況建議另外用 GSC 或 site: 查詢複核。', evidence: `0/${Y} 頁 noindex` });
  }

  // 5. Local Business：純規則核對欄位完整度（地址／電話／營業時間），不再是「建議人工複核」的空話
  out.push(buildLocalBizCheck(pages.map((p) => ({ url: p.url, jsonLdNodes: p.jsonLdNodes }))));

  // 6. 麵包屑——首頁不用排除在外會被誤判：首頁本來就沒有「上一層」可以
  // 顯示麵包屑，不裝麵包屑是正常的，不是缺陷。只看首頁以外的頁面夠不夠。
  {
    const base = { key: 'breadcrumb', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '頁面有沒有標示所在位置' };
    const nonHomePages = htmlPages.filter((p) => !p.isHome);
    if (nonHomePages.length === 0) {
      out.push({ ...base, status: 'ok', advice: '只爬到首頁，首頁本來就不需要標示所在位置', evidence: '（僅首頁）' });
    } else {
      const NY = nonHomePages.length;
      const noBc = nonHomePages.filter((p) => !p.hasBreadcrumb);
      const bc = NY - noBc.length;
      out.push(bc === 0
        ? { ...base, status: 'warn', advice: `首頁以外的 ${NY} 頁，沒有一頁標示自己在網站的哪個位置。`, impact: '像「首頁 › 服務 › 網站健檢」這種一層層的路徑，是在告訴 AI 這頁屬於哪個分類、跟其他頁面什麼關係。沒有的話，每一頁在 AI 眼中都是孤立的，看不出你的服務有幾類、哪個是主打。', technical: '未偵測到 BreadcrumbList 結構化資料或可見的麵包屑導覽。', evidence: `0/${NY} 頁有標示（不計首頁）`, details: noBc.map((p) => ({ url: p.url, note: '沒有標示所在位置' })) }
        : bc < NY
          ? { ...base, status: 'warn', advice: `首頁以外的 ${NY} 頁裡，只有 ${bc} 頁標示了自己在網站的哪個位置。`, impact: '有標的頁面 AI 看得懂層級關係，沒標的那幾頁就看不出來，全站導覽不一致。', technical: '缺少的頁面沒有 BreadcrumbList 結構化資料或可見的麵包屑導覽。', evidence: `${bc}/${NY} 頁有標示（不計首頁）`, details: noBc.map((p) => ({ url: p.url, note: '沒有標示所在位置' })) }
          : { ...base, status: 'ok', advice: `首頁以外的頁面都有標示所在位置（${bc}/${NY}）`, evidence: `${bc}/${NY} 頁有標示（不計首頁）` });
    }
  }

  // 7. 內部連結結構
  {
    const noLink = htmlPages.filter((p) => p.internalLinks.length === 0);
    const avg = Math.round(htmlPages.reduce((s, p) => s + p.internalLinks.length, 0) / Y);
    out.push(noLink.length
      ? { key: 'internalLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '頁面之間有沒有互相連結', status: 'warn', advice: `${Y} 頁裡有 ${noLink.length} 頁完全沒有連到站內其他頁面（平均每頁 ${avg} 條）。`, impact: '爬蟲是順著連結一頁一頁走的。沒有連結進出的頁面等於一座孤島，爬蟲不容易走到，走到了也看不出它跟你其他內容的關係。', technical: `平均每頁 ${avg} 條內部連結。可加上相關內容推薦或麵包屑導覽。`, evidence: `平均 ${avg} 條/頁，${noLink.length} 頁沒有`, details: noLink.map((p) => ({ url: p.url, note: '沒有連到站內其他頁面' })) }
      : { key: 'internalLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '頁面之間有沒有互相連結', status: 'ok', advice: `頁面之間互相連得夠密（平均每頁約 ${avg} 條）`, evidence: `平均 ${avg} 條/頁` });
  }

  // 8. 無效連結
  {
    const broken = pages.filter((p) => p.status >= 400);
    out.push(broken.length
      ? { key: 'brokenLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有沒有點不開的連結', status: 'fail', advice: `爬到的 ${pages.length} 頁裡，有 ${broken.length} 頁點開是壞的，例如：${broken.slice(0, 5).map((p) => `${toPath(origin, p.url)}（${p.status || '連不上'}）`).join('、')}。`, impact: '客戶點到會直接離開，爬蟲走到死路也會浪費原本可以拿去讀你其他內容的次數。壞連結多的網站在 AI 眼中也顯得沒在維護。', technical: `這些網址回應 4xx／5xx。修正連結指向的網址，或直接移除已經沒用的連結。`, evidence: `${broken.length}/${pages.length} 頁點不開`, details: broken.map((p) => ({ url: p.url, note: `回應 ${p.status || '連不上'}` })) }
      : { key: 'brokenLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有沒有點不開的連結', status: 'ok', advice: `爬到的 ${pages.length} 頁都點得開`, evidence: `0/${pages.length} 頁點不開` });
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
      ? { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '有沒有內容重複的頁面', status: 'warn', advice: `${problems.join('、')}。`, impact: '同樣的內容出現在多個網址時，搜尋引擎跟 AI 得自己猜哪一個才是正版。猜錯就是把你的能見度分散到不同網址上，兩邊都拿不到好位置。', technical: '缺 canonical 標籤的頁面要補上，指向正版網址；標題重複的頁面要人工判斷該合併還是改標題。', evidence: problems.join('、'), details: dupDetails }
      : { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '有沒有內容重複的頁面', status: 'ok', advice: '每頁都指定了正版網址，也沒有標題重複的頁面', evidence: `0 問題（共 ${Y} 頁）` });
  }

  // 10. 每頁的標題與描述完不完整（TKD）
  {
    const charLen = (s: string) => [...s.trim()].length;
    let te = 0, tl = 0, de = 0, dl = 0;
    const tkdDetails: { url: string; note: string }[] = [];
    for (const p of htmlPages) {
      const probs: string[] = [];
      if (!p.title) { te++; probs.push('標題留空'); }
      else {
        const px = estimateTitlePixelWidth(p.title.trim());
        if (px > TITLE_SAFE_PX) { tl++; probs.push(`標題太長（估算 ${px}px，安全上限 ${TITLE_SAFE_PX}px，搜尋結果會被切掉）`); }
      }
      if (!p.description) { de++; probs.push('描述留空'); }
      else if (charLen(p.description) > 80) { dl++; probs.push(`描述太長（${charLen(p.description)} 字）`); }
      if (probs.length) tkdDetails.push({ url: p.url, note: probs.join('、') });
    }
    const issues = te + tl + de + dl;
    out.push(issues
      ? { key: 'tkd', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '每頁的標題與描述完不完整', status: 'fail', advice: `${Y} 頁裡，標題留空 ${te} 頁、太長 ${tl} 頁；描述留空 ${de} 頁、太長 ${dl} 頁。`, impact: '標題跟描述是 Google 和 AI 判斷「這頁在講什麼」的第一手依據，也是客戶在搜尋結果上唯一看得到的兩行字。留空等於沒自我介紹，太長會被切掉，客戶看到的是半句話。', technical: `標題長度改用像素寬度估算（全形≈${FULLWIDTH_PX}px／半形≈${HALFWIDTH_PX}px，安全上限 ${TITLE_SAFE_PX}px），比純字數門檻更貼近 Google 搜尋結果的實際截斷點；描述以 80 字為門檻。`, evidence: `標題 空${te}/長${tl}｜描述 空${de}/長${dl}（共 ${Y} 頁）`, details: tkdDetails }
      : { key: 'tkd', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '每頁的標題與描述完不完整', status: 'ok', advice: `爬到的 ${Y} 頁，標題跟描述都有填，長度也都在安全範圍內`, evidence: `共 ${Y} 頁皆正常` });
  }

  // 11. h1、h2 使用
  {
    const noH1 = htmlPages.filter((p) => p.h1 === 0).length;
    const multiH1 = htmlPages.filter((p) => p.h1 > 1).length;
    const noH2 = htmlPages.filter((p) => p.h2 === 0).length;
    const problems: string[] = [];
    if (noH1) problems.push(`${noH1} 頁沒有主標題`);
    if (multiH1) problems.push(`${multiH1} 頁有兩個以上的主標題`);
    if (noH2) problems.push(`${noH2} 頁沒有小標題`);
    const headingDetails: { url: string; note: string }[] = [];
    for (const p of htmlPages) {
      const probs: string[] = [];
      if (p.h1 === 0) probs.push('沒有主標題');
      else if (p.h1 > 1) probs.push(`有 ${p.h1} 個主標題`);
      if (p.h2 === 0) probs.push('沒有小標題');
      if (probs.length) headingDetails.push({ url: p.url, note: probs.join('、') });
    }
    out.push(problems.length
      ? { key: 'headings', level: LEVEL.RANK, category: CATEGORY.TECH, item: '每頁有沒有清楚的大小標題', status: 'fail', advice: `${Y} 頁裡：${problems.join('、')}。`, impact: '大小標題是內容的骨架，AI 靠它判斷這頁的重點是什麼、哪些是主題哪些是細節。沒有主標題等於整頁是一團沒有分段的文字；有兩個主標題等於同時宣稱兩件事是重點，AI 只能挑一個猜。', technical: '對應 HTML 的 <h1>／<h2> 標籤。每頁只留一個 <h1>，並用 <h2> 分出段落層次。', evidence: problems.join('、'), details: headingDetails }
      : { key: 'headings', level: LEVEL.RANK, category: CATEGORY.TECH, item: '每頁有沒有清楚的大小標題', status: 'ok', advice: `爬到的 ${Y} 頁標題層次都完整`, evidence: `共 ${Y} 頁皆正常` });
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
    // 關於頁最可能寫學經歷；活動/作品頁最可能有講座、案例這類可佐證的實績——
    // 兩種都優先排進取樣，AI 才給得出「把 XX 放到更明顯位置」這種具體建議，
    // 不是只能給「補一段簡介」這種看不到內容就只能講的空泛話。
    // 英文關鍵字用 \b 詞界，避免「purchase」誤中「case」這種字串裡剛好包到的情況；
    // 中文關鍵字不能套用同一招——JS 的 \b 是以 \w（ASCII 字母/數字/底線）為基準，
    // 中文字全部算非 \w，一整串中文字裡不會有任何 \w/\W 轉換點，\b 在裡面永遠不會
    // 命中（例如 /\b案例\b/ 對「成功案例」完全比對不到）。中文關鍵字改成直接比對
    // 子字串，接受極少數過度比對的風險（頂多多取樣一頁，不像漏掉真正該取樣的
    // 關於／案例頁那麼傷）。
    const ABOUT_URL_PATTERN = /\b(about|team|profile|bio|founder|author)\b|關於|个人/i;
    const PROOF_URL_PATTERN = /\b(activities|portfolio|case|works|speaking|press)\b|作品|活動|案例|見證|见证|評價|评价|推薦|推荐/i;
    // new URL(...).href／.pathname 對非 ASCII 字元一律轉成 %XX 百分號編碼，中文網址
    // 例如 /關於我們/ 實際存進 p.url 的是 /%E9%97%9C%E6%96%BC.../，上面兩個規則裡的
    // 中文關鍵字直接對 p.url 做 regex.test 永遠不會命中——中文站慣用中文網址 slug
    // （「關於我們」「成功案例」），這個 bug 會讓「優先取樣關於／案例頁」整個失效，
    // 悄悄退化成「隨便抓爬到的前幾頁」，AI 因為看不到真正的佐證內容才會誤判成
    // 「缺乏客戶評論／媒體報導」。比對前先解碼回真正的中文字再測。
    const decodedUrl = (u: string) => {
      try {
        return decodeURIComponent(u);
      } catch {
        return u;
      }
    };
    const aboutPages = htmlPages.filter((p) => ABOUT_URL_PATTERN.test(decodedUrl(p.url)));
    const proofPages = htmlPages.filter((p) => PROOF_URL_PATTERN.test(decodedUrl(p.url)));
    const otherPages = htmlPages.filter(
      (p) => !ABOUT_URL_PATTERN.test(decodedUrl(p.url)) && !PROOF_URL_PATTERN.test(decodedUrl(p.url))
    );
    // 每頁各自限額截斷（而不是全部接起來最後才砍）——不然首頁的內文本身就很
    // 長，會把接在後面的頁面擠到字數上限外面，AI 實際上根本沒看到那些內容。
    const sampledPages = [...aboutPages, ...proofPages, home, ...otherPages].filter(
      (p, i, arr) => p && arr.findIndex((q) => q?.url === p.url) === i
    );
    const PER_PAGE_CHAR_CAP = 1200;
    const sampleText = sampledPages
      .slice(0, 5)
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
    ? { key: 'llmsSeo', level: LEVEL.RANK, category: CATEGORY.TECH, item: '有沒有 llms.txt', status: 'ok', advice: '有 llms.txt', evidence: `${origin}/llms.txt` }
    : { key: 'llmsSeo', level: LEVEL.RANK, category: CATEGORY.TECH, item: '有沒有 llms.txt', status: 'warn', advice: '網站上沒有 llms.txt。', impact: 'llms.txt 是專門寫給 AI 看的網站導覽——用一頁講清楚你是誰、有哪些重點內容。沒有的話，AI 得自己從整個網站東拼西湊，拼出來的版本不一定是你想被講的版本。這還不是強制規範，但主動放的網站目前還很少，是搶先表態的機會。', technical: '在網站根目錄放 llms.txt，格式參考 llmstxt.org。', evidence: `${origin}/llms.txt` });

  // 14. 有無網址 404 / soft-404
  {
    const bad = pages.filter((p) => p.status >= 400);
    const details = [
      ...bad.map((p) => ({ url: p.url, note: `回應 ${p.status || '連不上'}` })),
      ...shells.map((p) => ({ url: p.url, note: '打得開但內容是空的' })),
    ];
    const parts: string[] = [];
    if (bad.length) parts.push(`${bad.length} 頁打不開`);
    if (shells.length) parts.push(`${shells.length} 頁打得開但內容是空的`);
    out.push(details.length
      ? { key: 'page', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有沒有失效的頁面', status: 'warn', advice: `爬到的 ${pages.length} 頁裡：${parts.join('、')}。`, impact: '空頁面對 AI 來說跟壞頁面一樣沒有價值，還會佔掉爬蟲原本可以拿去讀你正常內容的次數。已經不需要的頁面留著，也會讓網站看起來沒在維護。', technical: `打不開的是 4xx／5xx；「打得開但內容是空的」是 soft-404（回 200 但沒有實質內容）。修正內容或移除連結，並從 sitemap 拿掉。`, evidence: `打不開 ${bad.length}｜空頁 ${shells.length}（共 ${pages.length} 頁）`, details }
      : { key: 'page', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有沒有失效的頁面', status: 'ok', advice: `爬到的 ${pages.length} 頁都正常打得開`, evidence: `0/${pages.length} 頁異常` });
  }

  // 15. 手機上排版正不正常（viewport）
  {
    const noVp = htmlPages.filter((p) => !p.hasViewport);
    const vp = Y - noVp.length;
    out.push(vp === Y
      ? { key: 'viewport', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '手機上排版正不正常', status: 'ok', advice: `爬到的 ${Y} 頁都有為手機做設定`, evidence: `${vp}/${Y} 頁` }
      : { key: 'viewport', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '手機上排版正不正常', status: 'warn', advice: `${Y} 頁裡有 ${Y - vp} 頁沒有為手機做設定。`, impact: '這幾頁在手機上會照桌機寬度縮小顯示：字小到看不清楚，要一直放大跟左右拉。現在多數人是用手機看你的網站，這幾頁等於進來就走。', technical: '缺少 <meta name="viewport" content="width=device-width, initial-scale=1">。', evidence: `${vp}/${Y} 頁`, details: noVp.map((p) => ({ url: p.url, note: '沒有為手機做設定' })) });
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
    // 跟第 6 項「頁面有沒有標示所在位置」用同一個排除首頁的算法，不然這裡顯示的
    // 「X/Y 頁有麵包屑」跟上面那項的分母對不起來，看起來像兩個數字打架。
    const nonHomeForDepth = htmlPages.filter((p) => !p.isHome);
    const depthDenominator = nonHomeForDepth.length || Y;
    const bc = (nonHomeForDepth.length ? nonHomeForDepth : htmlPages).filter((p) => p.hasBreadcrumb).length;
    out.push(bc > 0 || maxDepth >= 1
      ? { key: 'categoryDepth', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '網站分類層級清不清楚', status: 'ok', advice: `網址最深 ${maxDepth} 層、${bc}/${depthDenominator} 頁有標示所在位置（不計首頁），分類看得出來`, evidence: `最深 ${maxDepth} 層｜有標示 ${bc}/${depthDenominator}` }
      : { key: 'categoryDepth', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '網站分類層級清不清楚', status: 'warn', advice: '看不出網站有分類——所有網址都擠在同一層，頁面上也沒有標示所在位置。', impact: 'AI 判斷你「主要在做什麼」，一部分是看你把內容怎麼分類、哪一類的頁面最多。全部擠在同一層，它就看不出你的主力業務是哪一塊。', technical: `網址路徑最深 ${maxDepth} 層。可在網址加上分類路徑，並補上麵包屑導覽。`, evidence: `最深 ${maxDepth} 層` });
  }

  // 16b/16c. 品牌與權威：這個分類原本只有 eeat 一項（AI 判斷），一項檢測卻在總分裡
  // 佔 20% 權重，分數只會是 0/50/100 三種值。補兩項純規則的實測項——都是從已經爬到的
  // 頁面判斷，不叫 AI、不猜。
  //
  // 門檻不能只看「有沒有那一頁」：幾乎每個網站都有 about 跟 contact，那樣加進來只會
  // 把分數整體墊高，不會讓分數變準（第一版就是這樣，實測分數反而從 75 升到 83）。
  // 所以 about 要求那頁真的有內容，contact 要求真的找得到電話或 Email，不是有連結就算。
  //
  // 只補這兩項是有意識的取捨：sameAs 社群連結、Organization 聯絡欄位、Article 作者
  // 署名這些「看起來也像品牌權威」的訊號，都已經在「結構化資料」的欄位完整度裡算過
  // 一次，再拉來這裡等於同一件事扣兩次分。
  //
  // 中文網址要先 decodeURIComponent 再比對——沒解碼的話 /關於我們 會是一串 %E9%97...，
  // 中文規則永遠比不中，等於死碼。
  {
    const decodedPath = (u: string): string => {
      try {
        return decodeURIComponent(new URL(u).pathname);
      } catch {
        return u;
      }
    };
    const ABOUT_RE = /(^|[/\-_])about([/\-_]|$)|about-?us|our-?story|who-?we-?are|company-?profile|[/\-_]team([/\-_]|$)|關於|关于|團隊|团队|公司簡介|公司简介|品牌故事|品牌介紹|品牌介绍/i;
    const hit = (re: RegExp) => htmlPages.filter((p) => re.test(decodedPath(p.url)) || re.test(p.title));

    // 「爬到的 N 頁裡沒有」不等於「網站上沒有」——爬蟲有上限，措辭要把取樣範圍講出來，
    // 不要講成斷言（跟 WAF 三態同一個紀律）。所以找不到是 warn 不是 fail。
    // 一頁都讀不到的時候（整站是 JS 空殼）措辭要換掉——「爬到的 0 頁裡找不到」讀起來
    // 像我們找過了，實際上是根本沒東西可找，那是無法判定不是不合格。
    const noReadablePage = htmlPages.length === 0;
    const scope = noReadablePage
      ? '整站沒有一頁讀得到內容（關掉 JavaScript 後是空的），這一項無法判定'
      : reachedCap
        ? `爬到的 ${htmlPages.length} 頁裡（已達上限，可能沒涵蓋整站）`
        : `爬到的 ${htmlPages.length} 頁裡`;

    // 一頁只有標題跟一句標語的「關於我們」不構成品牌介紹。300 字是參考
    // geo-content-visibility.ts 的 EMPTY_TEXT(200)／THIN_TEXT(500) 抓的中間值。
    const ABOUT_MIN_CHARS = 300;
    const aboutAll = hit(ABOUT_RE);
    const aboutSolid = aboutAll.filter((p) => p.mainTextLength >= ABOUT_MIN_CHARS);
    const aboutItem = { key: 'aboutPage', level: LEVEL.QUALITY, category: CATEGORY.EXTERNAL, item: '有沒有交代自己是誰' } as const;
    if (aboutSolid.length > 0) {
      out.push({ ...aboutItem, status: 'ok', advice: `${toPath(origin, aboutSolid[0].url)} 有 ${aboutSolid[0].mainTextLength} 個字在介紹你是誰`, evidence: aboutSolid.slice(0, 3).map((p) => `${toPath(origin, p.url)}（${p.mainTextLength} 字）`).join('、') });
    } else if (aboutAll.length > 0) {
      out.push({ ...aboutItem, status: 'warn', advice: `有「關於我們」這類頁面，但內容只有 ${Math.max(...aboutAll.map((p) => p.mainTextLength))} 個字。`, impact: 'AI 要推薦一個品牌，得講得出這個品牌是誰、做多久、誰在做。一頁只有標題跟一句標語，它讀完還是不知道你是誰。', technical: `頁面存在但可讀字數低於 ${ABOUT_MIN_CHARS} 字。補上成立時間、團隊背景、專業資歷與服務範圍。`, evidence: aboutAll.slice(0, 3).map((p) => `${toPath(origin, p.url)}（${p.mainTextLength} 字）`).join('、') });
    } else {
      out.push({ ...aboutItem, status: 'warn', advice: noReadablePage ? `${scope}。` : `${scope}找不到「關於我們／團隊／品牌故事」這類介紹你自己的頁面。`, impact: 'AI 要在回答裡推薦一個品牌，得先講得出這個品牌是誰、做多久、誰在做。整站都在講服務跟商品、沒有一頁在講自己，它就只能從別人寫你的內容去拼湊——那些內容你控制不了。', technical: '新增一頁「關於我們」，寫清楚成立時間、團隊、專業背景與服務範圍，並從主選單連過去。', evidence: scope });
    }

    // 聯絡管道看的是「找不找得到真的聯絡方式」，不是「有沒有一頁叫聯絡我們」——
    // 一頁只有表單、沒有電話也沒有 Email，對想查證這家公司存不存在的人沒有用。
    const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
    const TEL_RE = /(\+886[-\s]?\d[\d-\s]{7,}|0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4})/;
    const withEmail = htmlPages.filter((p) => EMAIL_RE.test(p.mainText));
    const withTel = htmlPages.filter((p) => TEL_RE.test(p.mainText));
    const contactItem = { key: 'contactPage', level: LEVEL.QUALITY, category: CATEGORY.EXTERNAL, item: '找不找得到可查證的聯絡方式' } as const;
    if (withEmail.length > 0 || withTel.length > 0) {
      const kinds = [withTel.length > 0 ? '電話' : '', withEmail.length > 0 ? 'Email' : ''].filter(Boolean).join('與');
      out.push({ ...contactItem, status: 'ok', advice: `頁面上找得到${kinds}（${withTel.length + withEmail.length > 0 ? toPath(origin, (withTel[0] ?? withEmail[0]).url) : ''} 等）`, evidence: `含電話 ${withTel.length} 頁｜含 Email ${withEmail.length} 頁` });
    } else {
      out.push({ ...contactItem, status: 'warn', advice: noReadablePage ? `${scope}。` : `${scope}的內文裡找不到電話或 Email。`, impact: '找得到人負責，是判斷一個網站可不可信最基本的一條。只有一個表單、查不到電話或 Email，AI 跟使用者都無從確認這個品牌背後有沒有真的公司。', technical: '把電話與 Email 以純文字寫在聯絡頁與頁尾（不要只放在圖片或表單裡，爬蟲讀不到）。', evidence: scope });
    }
  }

  // 17. 首頁內容優化
  {
    const home = pages.find((p) => p.isHome);
    if (!home || !home.ok) {
      out.push({ key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容夠不夠', status: 'warn', advice: '抓不到你的首頁內容。', impact: '我們抓不到，AI 爬蟲很可能也抓不到。這通常是被 WAF 擋住，或是內容要靠 JavaScript 才長得出來。', technical: '首頁請求失敗或回傳空殼。人工打開首頁確認是不是被防火牆擋下、或需要 JavaScript 才能渲染，排除後重新檢測。', evidence: origin });
    } else {
      const problems: string[] = [];
      if (home.h1 === 0) problems.push('沒有主標題');
      else if (home.h1 > 1) problems.push(`有 ${home.h1} 個主標題`);
      if (home.h2 === 0) problems.push('沒有小標題');
      const evidence = `首頁 主標題 ${home.h1} 個、小標題 ${home.h2} 個`;
      out.push(problems.length
        ? { key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容夠不夠', status: 'fail', advice: `首頁${problems.join('、')}。`, impact: '首頁是 AI 認識你的第一頁，也是它拿來回答「這家是做什麼的」的主要依據。首頁沒有一句明確的主標題，AI 就只能從選單跟零散文案自己拼湊。', technical: '對應首頁的 <h1>／<h2>。確保只有一個 <h1> 講清楚你是做什麼的，並用 <h2> 帶出服務或賣點。', evidence }
        : { key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容夠不夠', status: 'ok', advice: '首頁標題層次完整；文案本身好不好還是要人看過', evidence });
    }
  }

  // 18. 圖片 ALT
  {
    const totalImg = htmlPages.reduce((s, p) => s + p.imgTotal, 0);
    const emptyImg = htmlPages.reduce((s, p) => s + p.imgAltEmpty, 0);
    const emptyPages = htmlPages.filter((p) => p.imgAltEmpty > 0);
    out.push(emptyImg
      ? { key: 'imgAlt', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片有沒有文字說明', status: 'fail', advice: `全站 ${totalImg} 張圖裡有 ${emptyImg} 張沒有文字說明，分布在 ${emptyPages.length} 頁。`, impact: 'AI 讀的是文字，不是圖。你放的產品照、菜單、實績照片，只要沒有文字說明，對 AI 來說就是不存在的——照片裡的資訊完全傳達不出去。', technical: `這些 <img> 的 alt 屬性留空。補上描述圖片內容的文字。`, evidence: `${emptyImg}/${totalImg} 張沒有說明`, details: emptyPages.map((p) => ({ url: p.url, note: `${p.imgAltEmpty} 張圖沒有文字說明` })) }
      : { key: 'imgAlt', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片有沒有文字說明', status: 'ok', advice: `爬到的圖片都有文字說明（共 ${totalImg} 張）`, evidence: `0/${totalImg} 張沒有說明` });
  }

  // 19. 縮圖及多媒體優化
  {
    const totalImg = htmlPages.reduce((s, p) => s + p.imgTotal, 0);
    const legacy = htmlPages.reduce((s, p) => s + p.imgLegacy, 0);
    const legacyPages = htmlPages.filter((p) => p.imgLegacy > 0);
    out.push(legacy
      ? { key: 'imgFormat', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片格式會不會拖慢速度', status: 'warn', advice: `全站 ${totalImg} 張圖裡有 ${legacy} 張還在用比較舊的格式。`, impact: '舊格式的圖檔案大，頁面載入慢。人會等不及先關掉，爬蟲也可能還沒讀完就先跳走。', technical: `這些圖不是 WebP／AVIF。轉檔並適度壓縮可以明顯縮小檔案。`, evidence: `${legacy}/${totalImg} 張是舊格式`, details: legacyPages.map((p) => ({ url: p.url, note: `${p.imgLegacy} 張是舊格式` })) }
      : { key: 'imgFormat', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片格式會不會拖慢速度', status: 'ok', advice: `爬到的圖片都用了新一代格式（共 ${totalImg} 張）`, evidence: `0/${totalImg} 張` });
  }

  // 20. 外部連結
  {
    const totalExt = htmlPages.reduce((s, p) => s + p.externalCount, 0);
    out.push(totalExt === 0
      ? { key: 'externalLinks', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '有沒有引用外部來源', status: 'warn', advice: '全站幾乎沒有連到任何外部網站。', impact: '有憑有據的內容，通常會引用官方文件、研究報告或新聞報導。完全不引用任何外部來源，AI 比較難判斷你講的東西可不可信——這一項本身不會扣你分，但會讓你在「誰比較專業」的比較裡吃虧。', technical: '在內容中適度引用權威來源並附上連結。', evidence: '0 條外部連結' }
      : { key: 'externalLinks', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '有沒有引用外部來源', status: 'ok', advice: `全站約 ${totalExt} 條外部連結；連的對象好不好還是要人看過`, evidence: `約 ${totalExt} 條外部連結` });
  }

  return sortByOrder(out);
}
