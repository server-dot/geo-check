import { parse } from 'node-html-parser';
import { guardedFetch } from './geo-url-guard';
import { hostnameOf, isSameSite } from './geo-brand-visibility';

// ── 認出「品牌自己的來源」──────────────────────────────────
// 2026-11-04 aiqkangber：ChatGPT 引用 Q kangber 自己寫的方格子文章（實測 GEO 工具、
// 自己網站能見度低、Contenta 建議不準），講成「Q kangber 能見度不高、技術建議不準確」的負評。
// 只在 prompt 寫「轉述品牌自己的內容不算」擋不住——模型不知道那篇是品牌寫的。
// 所以這裡用規則認出來源是不是品牌本人的，評價抽取再據此排除。
//
// 判定（任一成立就算品牌自己的）：
// 1. 同網站（官網）
// 2. 官網連出去的社群／部落格帳號底下的網址（首頁 footer 的 IG、Threads…）
// 3. 網址裡的帳號名就是品牌名（vocus.cc/user/@qkangber、qkangber.medium.com）
// 4. 頁面標題「後段」就是品牌名（「台灣 5 個 GEO 檢測工具實測｜Q kangber｜AI x 自動化實驗室」）
// 5. 內容平台上的文章，作者欄（meta author、JSON-LD author）是品牌名或連到 2／3 的帳號
// 6. 姊妹網域：網域主體是「品牌名＋shop／store／tw…」（2026-11-09 Relove：官網 foreverrelove.com.tw，
//    AI 引的是它自己的購物站 reloveshop.com.tw，報告卻寫「沒有你的網站」）
// 只看完全相同的名字，不做「包含」：第三方評測標題常常就是「Q kangber 評價」。

const PLATFORM_HOSTS = [
  'vocus.cc', 'medium.com', 'substack.com', 'threads.com', 'threads.net', 'instagram.com', 'facebook.com',
  'youtube.com', 'linkedin.com', 'x.com', 'twitter.com', 'github.com', 'matters.town', 'pixnet.net',
  'blogspot.com', 'notion.site', 'tiktok.com', 'dcard.tw', 'hahow.in', 'potato.io', 'linktr.ee', 'portaly.cc', 'tasker.com.tw', 'pro360.com.tw', '518.com.tw',
];

function onPlatform(host: string): string | null {
  return PLATFORM_HOSTS.find((p) => host === p || host.endsWith(`.${p}`)) ?? null;
}

// 「Q kangber」「q_kangber」「@qkangber」都變成 qkangber
const key = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[\s@_\-.·・'’]/g, '');

export function brandKeys(brandNames: string[], domain: string): string[] {
  const stem = hostnameOf(domain.startsWith('http') ? domain : `https://${domain}`).replace(/^www\./, '').split('.')[0] ?? '';
  return [...new Set([...brandNames, stem].map(key).filter((k) => k.length >= 3))];
}

function profilePrefix(u: URL): string {
  // 帳號頁的前一兩段：/@q_kangber、/user/@qkangber、/salon/xxx、/channel/xxx
  const segs = u.pathname.split('/').filter(Boolean);
  const n = segs[0] && /^(user|users|salon|channel|c|in|company|pages|workroom)$/i.test(segs[0]) ? 2 : 1;
  return `${u.hostname.replace(/^www\./, '')}/${segs.slice(0, n).join('/')}`.toLowerCase();
}

export function handleIsBrand(u: URL, keys: string[]): boolean {
  const host = u.hostname.replace(/^www\./, '');
  const plat = onPlatform(host);
  if (!plat) return false;
  const sub = host.slice(0, Math.max(0, host.length - plat.length - 1));
  if (sub && keys.includes(key(sub))) return true;
  return u.pathname
    .split('/')
    .slice(1, 3)
    .some((seg) => {
      try {
        return keys.includes(key(decodeURIComponent(seg)));
      } catch {
        return false;
      }
    });
}

const SIBLING_SUFFIX = /^(|shop|store|official|mall|online|buy|tw|taiwan|global|web|site|brand|life)$/;

function siblingDomain(host: string, keys: string[]): boolean {
  const h = host.replace(/^www\./, '');
  if (onPlatform(h)) return false;
  const label = h.split('.')[0] ?? '';
  return keys.some((k) => /^[a-z0-9]{4,}$/.test(k) && label.startsWith(k) && SIBLING_SUFFIX.test(label.slice(k.length).replace(/^-/, '')));
}

function titleTailIsBrand(title: string, keys: string[]): boolean {
  const segs = title.split(/\s*[｜|–—]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  return segs.slice(1).some((s) => keys.includes(key(s)));
}

export interface OwnedSourceInput {
  brandNames: string[]; // 官方名＋短名
  domain: string; // 官網網址或網域
  siteExternalLinks: string[]; // 官網（首頁優先）連出去的網址
  citations: { url: string; title?: string; isSelf?: boolean }[];
}

async function pageAuthorIsBrand(url: string, keys: string[], profiles: Set<string>): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await guardedFetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GeoCheck/1.0)' } });
    if (!res.ok) return false;
    const html = (await res.text()).slice(0, 600_000);
    const root = parse(html);
    const names: string[] = [];
    const links: string[] = [];
    for (const sel of ['meta[name="author"]', 'meta[property="article:author"]', 'meta[name="twitter:creator"]']) {
      const v = root.querySelector(sel)?.getAttribute('content');
      if (v) (/^https?:/.test(v) ? links : names).push(v);
    }
    for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const walk = (n: unknown): void => {
          if (!n || typeof n !== 'object') return;
          if (Array.isArray(n)) return n.forEach(walk);
          const o = n as Record<string, unknown>;
          if (o.author) {
            for (const a of Array.isArray(o.author) ? o.author : [o.author]) {
              if (typeof a === 'string') names.push(a);
              else if (a && typeof a === 'object') {
                const r = a as Record<string, unknown>;
                if (typeof r.name === 'string') names.push(r.name);
                if (typeof r.url === 'string') links.push(r.url);
              }
            }
          }
          if (o['@graph']) walk(o['@graph']);
        };
        walk(JSON.parse(s.textContent));
      } catch {
        /* 壞掉的 JSON-LD 跳過 */
      }
    }
    for (const a of root.querySelectorAll('a[rel~="author"], [class*="author" i] a[href], [itemprop="author"] a[href]')) {
      const h = a.getAttribute('href');
      if (h) links.push(new URL(h, url).href);
    }
    if (names.some((n) => keys.includes(key(n)))) return true;
    return links.some((l) => {
      try {
        const u = new URL(l);
        return profiles.has(profilePrefix(u)) || handleIsBrand(u, keys);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 回傳品牌自己的來源網址集合（含官網）。抓頁面最多 8 個、每個 6 秒，失敗當作不是。
export async function detectOwnedSources(input: OwnedSourceInput): Promise<Set<string>> {
  const keys = brandKeys(input.brandNames, input.domain);
  const owned = new Set<string>();
  const profiles = new Set<string>();
  for (const l of input.siteExternalLinks) {
    try {
      const u = new URL(l);
      if (onPlatform(u.hostname.replace(/^www\./, '')) && u.pathname.split('/').filter(Boolean).length > 0) profiles.add(profilePrefix(u));
    } catch {
      /* 略過 */
    }
  }
  const pending: string[] = [];
  const seen = new Set<string>();
  for (const c of input.citations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    let u: URL;
    try {
      u = new URL(c.url);
    } catch {
      continue;
    }
    if (
      c.isSelf ||
      isSameSite(u.hostname, hostnameOf(input.domain.startsWith('http') ? input.domain : `https://${input.domain}`)) ||
      profiles.has(profilePrefix(u)) ||
      handleIsBrand(u, keys) ||
      siblingDomain(u.hostname, keys) ||
      (c.title && titleTailIsBrand(c.title, keys))
    ) {
      owned.add(c.url);
      // 認出來的帳號頁也當帳號（vocus.cc/user/@qkangber 被引用 → 同作者的其他文章作者欄會連到它）
      if (handleIsBrand(u, keys)) profiles.add(profilePrefix(u));
    } else if (onPlatform(u.hostname.replace(/^www\./, ''))) pending.push(c.url);
  }
  const checks = await Promise.all(pending.slice(0, 8).map((url) => pageAuthorIsBrand(url, keys, profiles).then((ok) => [url, ok] as const)));
  for (const [url, ok] of checks) if (ok) owned.add(url);
  return owned;
}

// 一段回答裡，某句話後面跟著的來源：同一行的 [n] 標記（對 citations[n-1]）＋ markdown 連結＋裸網址
export function sourcesOfLine(line: string, citations: { url: string }[]): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/\[(\d{1,2})\]/g)) {
    const c = citations[Number(m[1]) - 1];
    if (c) out.push(c.url);
  }
  for (const m of line.matchAll(/\]\((https?:\/\/[^)\s]+)\)|(?<![(\w])(https?:\/\/[^\s)）」\]]+)/g)) out.push(m[1] ?? m[2]);
  return out;
}

export function sameUrl(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
  return n(a) === n(b);
}

// 把「品牌自己的來源」標成 isSelf，citedSelf 跟著重算。推薦題、品牌辨識、改題重問共用。
export function markOwned<T extends { citedSelf: boolean; citations: { url: string; title: string; isSelf: boolean }[] }>(r: T, owned: Set<string>): T {
  const citations = r.citations.map((c) => (c.isSelf || owned.has(c.url) ? { ...c, isSelf: true } : c));
  return { ...r, citations, citedSelf: citations.some((c) => c.isSelf) };
}

export function markOwnedQuestions<Q extends { results: { citedSelf: boolean; citations: { url: string; title: string; isSelf: boolean }[] }[] }>(
  questions: Q[],
  owned: Set<string>,
): { questions: Q[]; citedSelfCount: number } {
  const out = questions.map((q) => ({ ...q, results: q.results.map((r) => markOwned(r, owned)) }));
  return { questions: out, citedSelfCount: out.reduce((n, q) => n + q.results.filter((r) => r.citedSelf).length, 0) };
}
