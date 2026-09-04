import { parse, HTMLElement as NHTMLElement } from 'node-html-parser';

// ── GEO 深度健檢：全站爬蟲層 ────────────────────────────
// 從首頁 BFS 爬第一～二層＋補爬 sitemap，逐頁擷取分析要用的原始事實。
// 跟 stacktools 的 site-audit-crawler.ts 同一套邏輯，這裡只負責「爬 + 擷取原始值」，
// 判斷門檻交給 geo-audit-aggregate.ts。
//
// 頁數上限刻意壓低（40 頁，stacktools 內部工具用 1000）：這裡是公開、免登入、
// 任何人都能丟網址進來的前導磁鐵，不是內部客戶工具——上限太高會被拿來當免費的
// 全站爬蟲濫用，也拖長免費健檢的等待時間。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface PageFacts {
  url: string;
  depth: number;
  ok: boolean;
  status: number;
  title: string;
  description: string;
  h1: number;
  h2: number;
  imgTotal: number;
  imgAltEmpty: number;
  imgAltEmptyNames: string[];
  imgLegacy: number;
  jsonLdTypes: string[];
  jsonLdNodes: Record<string, unknown>[];
  hasBreadcrumb: boolean;
  canonical: string;
  noindex: boolean;
  hasViewport: boolean;
  analytics: string[];
  internalLinks: string[];
  externalCount: number;
  isHome: boolean;
  mainText: string;
  viaSitemap: boolean;
  nonHtml: boolean;
}

export interface CrawlProgress {
  crawled: number;
  discovered: number;
  cap: number;
}

export interface CrawlResult {
  origin: string;
  pages: PageFacts[];
  sitemapUrls: string[];
  sitemapExists: boolean;
  robotsExists: boolean;
  llmsExists: boolean;
  reachedCap: boolean;
}

export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    let p = x.pathname.replace(/\/+$/, '');
    if (p === '') p = '/';
    return x.origin + p;
  } catch {
    return u;
  }
}

export function normalizeFull(u: string): string {
  try {
    const x = new URL(u);
    let p = x.pathname.replace(/\/+$/, '');
    if (p === '') p = '/';
    return x.origin + p + x.search;
  } catch {
    return u;
  }
}

function isCrawlableHref(raw: string): boolean {
  if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(raw)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|ico|pdf|zip|rar|mp4|mp3|css|js|xml|json|doc|docx|xls|xlsx)(\?|$)/i.test(raw)) return false;
  if (/\/cdn-cgi\//i.test(raw)) return false;
  return true;
}

// 回傳全站抓到的 JSON-LD 節點（完整物件，供 geo-schema-check.ts 核對欄位完整度）
// 以及攤平出的型別清單（供既有「有沒有這個型別」的判斷沿用）
function extractJsonLd(root: NHTMLElement): { types: string[]; nodes: Record<string, unknown>[] } {
  const types = new Set<string>();
  const nodes: Record<string, unknown>[] = [];
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const text = script.rawText?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text);
      const items: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { '@graph'?: unknown[] })['@graph'])
          ? (data as { '@graph': unknown[] })['@graph']
          : [data];
      for (const node of items) {
        if (!node || typeof node !== 'object') continue;
        nodes.push(node as Record<string, unknown>);
        const t = (node as { '@type'?: unknown })?.['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
      }
    } catch {
      /* 解析失敗略過 */
    }
  }
  return { types: [...types], nodes };
}

function extractPageFacts(html: string, url: string, depth: number, status: number, ok: boolean, origin: string, viaSitemap = false): PageFacts {
  const root = parse(html);
  const title = (root.querySelector('title')?.textContent ?? '').trim();
  const description = (root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '').trim();

  const imgs = root.querySelectorAll('img').filter((img) => {
    const role = (img.getAttribute('role') ?? '').toLowerCase();
    return role !== 'presentation' && img.getAttribute('aria-hidden') !== 'true';
  });
  const emptyImgs = imgs.filter((img) => !(img.getAttribute('alt') ?? '').trim());
  const imgAltEmptyNames = [
    ...new Set(
      emptyImgs
        .map((img) => (img.getAttribute('src') || img.getAttribute('data-src') || '').split('?')[0].split('/').pop() || '')
        .filter(Boolean),
    ),
  ].slice(0, 5);
  const legacy = imgs.filter((img) => {
    const src = (img.getAttribute('src') ?? '').split('?')[0].toLowerCase();
    return src && !/\.(webp|avif)$/.test(src);
  }).length;

  const { types: jsonLdTypes, nodes: jsonLdNodes } = extractJsonLd(root);
  const hasBreadcrumb =
    jsonLdTypes.includes('BreadcrumbList') ||
    !!root.querySelector('nav[aria-label*="breadcrumb" i], nav[class*="breadcrumb" i], [class*="breadcrumb" i]');

  const robots = (root.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '').toLowerCase();
  const googlebot = (root.querySelector('meta[name="googlebot"]')?.getAttribute('content') ?? '').toLowerCase();

  const analytics: string[] = [];
  if (/G-[A-Z0-9]{6,}/.test(html)) analytics.push('GA4');
  if (/UA-\d{4,}-\d+/.test(html)) analytics.push('Universal Analytics');
  if (/GTM-[A-Z0-9]+/.test(html)) analytics.push('GTM');
  if (root.querySelector('meta[name="google-site-verification"]')) analytics.push('GSC 驗證碼');

  const internal = new Set<string>();
  let externalCount = 0;
  for (const a of root.querySelectorAll('a[href]')) {
    const raw = (a.getAttribute('href') ?? '').trim();
    if (!isCrawlableHref(raw)) continue;
    let abs: URL;
    try {
      abs = new URL(raw, url);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (abs.origin === origin) internal.add(normalizeUrl(abs.href));
    else externalCount++;
  }

  const bodyClone = parse((root.querySelector('body') ?? root).outerHTML);
  bodyClone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  const mainText = bodyClone.textContent.replace(/\s+/g, ' ').trim().slice(0, 2000);

  let pathname = '/';
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    /* 用預設 */
  }

  return {
    url,
    depth,
    ok,
    status,
    title,
    description,
    h1: root.querySelectorAll('h1').length,
    h2: root.querySelectorAll('h2').length,
    imgTotal: imgs.length,
    imgAltEmpty: emptyImgs.length,
    imgAltEmptyNames,
    imgLegacy: legacy,
    jsonLdTypes,
    jsonLdNodes,
    hasBreadcrumb,
    canonical: (root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '').trim(),
    noindex: /noindex/.test(robots) || /noindex/.test(googlebot),
    hasViewport: !!(root.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '').trim(),
    analytics,
    internalLinks: [...internal],
    externalCount,
    isHome: pathname === '/',
    mainText,
    viaSitemap,
    nonHtml: false,
  };
}

async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [`${origin}/sitemap.xml`];
  const out = new Set<string>();
  let fetched = 0;
  while (queue.length && out.size < 500 && fetched < 10) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    fetched++;
    try {
      const res = await fetchWithTimeout(sm, 10000);
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      const isIndex = /<sitemapindex/i.test(xml);
      for (const loc of locs) {
        if (isIndex) queue.push(loc.trim());
        else out.add(loc.trim());
      }
    } catch {
      /* 單份 sitemap 抓失敗就跳過 */
    }
  }
  return [...out];
}

async function fileExists(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, 8000);
    return res.ok;
  } catch {
    return false;
  }
}

// 全站爬取主入口：BFS 第一～二層，上限 maxPages 頁（預設 40，公開工具刻意壓低）
export async function crawlSite(
  startUrl: string,
  opts: { maxPages?: number; maxDepth?: number; concurrency?: number; onProgress?: (p: CrawlProgress) => void } = {},
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 40;
  const maxDepth = opts.maxDepth ?? 2;
  const concurrency = opts.concurrency ?? 5;

  const origin = new URL(startUrl).origin;
  const home = `${origin}/`;

  const sidePromise = Promise.all([
    fetchSitemapUrls(origin),
    fileExists(`${origin}/sitemap.xml`),
    fileExists(`${origin}/robots.txt`),
    fileExists(`${origin}/llms.txt`),
  ]);

  const seen = new Set<string>([normalizeUrl(home)]);
  let frontier: { url: string; depth: number }[] = [{ url: home, depth: 0 }];
  const pages: PageFacts[] = [];
  let reachedCap = false;

  while (frontier.length && pages.length < maxPages) {
    const nextFrontier: { url: string; depth: number }[] = [];
    for (let i = 0; i < frontier.length && pages.length < maxPages; i += concurrency) {
      const remaining = maxPages - pages.length;
      const batch = frontier.slice(i, i + concurrency).slice(0, remaining);
      const facts = await Promise.all(
        batch.map(async ({ url, depth }) => {
          try {
            const res = await fetchWithTimeout(url);
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('html')) return emptyFacts(url, depth, res.status, res.ok, origin, false, true);
            return extractPageFacts(await res.text(), url, depth, res.status, res.ok, origin);
          } catch {
            return emptyFacts(url, depth, 0, false, origin);
          }
        }),
      );
      for (const f of facts) {
        pages.push(f);
        opts.onProgress?.({ crawled: pages.length, discovered: seen.size, cap: maxPages });
        if (f.depth < maxDepth) {
          for (const link of f.internalLinks) {
            const n = normalizeUrl(link);
            if (seen.has(n)) continue;
            if (seen.size >= maxPages) {
              reachedCap = true;
              continue;
            }
            seen.add(n);
            nextFrontier.push({ url: n, depth: f.depth + 1 });
          }
        }
      }
    }
    frontier = nextFrontier;
  }
  if (seen.size >= maxPages) reachedCap = true;

  const [sitemapUrls, sitemapExists, robotsExists, llmsExists] = await sidePromise;

  // sitemap 補爬：首頁選單常靠 JS 動態產生，靜態 BFS 看不到，把 sitemap 有、
  // 首頁 2 層內沒連到的頁補進來，讓逐頁檢查涵蓋更完整（在頁數上限內）
  if (pages.length < maxPages) {
    const crawledKeys = new Set(pages.map((p) => normalizeFull(p.url)));
    const extra: string[] = [];
    const extraKeys = new Set<string>();
    for (const u of sitemapUrls) {
      const k = normalizeFull(u);
      if (crawledKeys.has(k) || extraKeys.has(k)) continue;
      extraKeys.add(k);
      extra.push(u);
    }
    for (let i = 0; i < extra.length && pages.length < maxPages; i += concurrency) {
      const remaining = maxPages - pages.length;
      const batch = extra.slice(i, i + concurrency).slice(0, remaining);
      const facts = await Promise.all(
        batch.map(async (url) => {
          try {
            const res = await fetchWithTimeout(url);
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('html')) return emptyFacts(url, 1, res.status, res.ok, origin, true, true);
            return extractPageFacts(await res.text(), url, 1, res.status, res.ok, origin, true);
          } catch {
            return emptyFacts(url, 1, 0, false, origin, true);
          }
        }),
      );
      for (const f of facts) {
        pages.push(f);
        opts.onProgress?.({ crawled: pages.length, discovered: seen.size, cap: maxPages });
      }
    }
    if (pages.length >= maxPages) reachedCap = true;
  }

  return { origin, pages, sitemapUrls, sitemapExists, robotsExists, llmsExists, reachedCap };
}

function emptyFacts(url: string, depth: number, status: number, ok: boolean, origin: string, viaSitemap = false, nonHtml = false): PageFacts {
  let isHome = false;
  try {
    isHome = (new URL(url).pathname.replace(/\/+$/, '') || '/') === '/';
  } catch {
    /* 忽略 */
  }
  return {
    url, depth, ok, status,
    title: '', description: '', h1: 0, h2: 0,
    imgTotal: 0, imgAltEmpty: 0, imgAltEmptyNames: [], imgLegacy: 0,
    jsonLdTypes: [], jsonLdNodes: [], hasBreadcrumb: false, canonical: '', noindex: false, hasViewport: false,
    analytics: [], internalLinks: [], externalCount: 0, isHome, mainText: '', viaSitemap, nonHtml,
  };
}
