// ── GEO：AI 引用來源分類（行銷部門看的那一區） ──────────────────
// tallyCitedDomains() 告訴使用者「AI 引了誰、引幾次」，但那份名單對行銷部門沒有動作可接：
// robots.txt、schema 是工程師的事，行銷主管拿到名單只能乾瞪眼。
// 這裡把同一批引用來源依「行銷能不能自己動手」分類——清單文可以去爭取被列進去、
// 論壇可以經營口碑、百科／資料庫可以更新資料、媒體可以投稿——然後直接列出那些網址。
//
// 分類只看網域跟標題，純規則，不問 AI：分錯一個網域的代價是一列標籤不對，
// 但多打一次 API 的代價是每份報告都變慢，而且分類本來就只是「大概是哪一類」。
//
// 這裡刻意不講「他被引用是因為他有 X」那種因果（見 memory：geo-check-visibility-no-tech-causation），
// 只講「AI 引了哪一類、你在不在裡面」。
//
// 純函式、零 import，前端 client component 可以直接引用。

export type SourceKind = 'self' | 'listicle' | 'forum' | 'reference' | 'media' | 'gov' | 'other';

export interface SourceKindMeta {
  label: string;
  // 行銷部門對這一類來源能做的事，一句話。用陳述句，不用「建議」「應該」（報告文案規範）。
  action: string;
}

export const SOURCE_KIND_META: Record<SourceKind, SourceKindMeta> = {
  self: { label: '你的網站', action: 'AI 已經直接引用你的頁面' },
  listicle: { label: '清單／評比文', action: '這類文章是行銷不用動程式碼就能爭取被列進去的位置' },
  forum: { label: '論壇／社群', action: '這些平台上關於你的討論，行銷可以直接參與或經營' },
  reference: { label: '百科／資料庫', action: '這些頁面的資料是行銷可以自己去更新的' },
  media: { label: '媒體／部落格', action: '投稿、受訪、發新聞稿都能進到這一類' },
  gov: { label: '政府／學術', action: '公家資料，通常改不了，看看就好' },
  other: { label: '同業／一般公司網站', action: 'AI 直接拿這些公司自己的頁面當答案；這一類靠的是你站上有沒有同樣的頁面，不是去別人那裡佈局' },
};

// 畫面上的顯示順序：對行銷最有動作可接的排前面
export const SOURCE_KIND_ORDER: SourceKind[] = ['listicle', 'forum', 'media', 'reference', 'other', 'gov', 'self'];

export interface SourceCitation {
  keyword: string;
  url: string;
  title: string;
  isSelf: boolean;
}

export interface SourceTarget {
  url: string;
  title: string;
  domain: string;
  count: number;      // 這個網址被引用幾次
  keywords: string[]; // 在哪些題目底下被引
}

export interface SourceKindSummary {
  kind: SourceKind;
  count: number;          // 這一類總共被引用幾次（同網址重複引用會累加）
  share: number;          // 佔全部引用的比例 0–1
  domains: number;        // 幾個不同網域
  targets: SourceTarget[]; // 依次數排序的網址清單（同網址合併）
}

export interface SourceBreakdown {
  total: number;
  kinds: SourceKindSummary[];  // 依 SOURCE_KIND_ORDER，count 為 0 的不列
  selfCount: number;
}

const FORUM_HOSTS = [
  'ptt.cc', 'dcard.tw', 'mobile01.com', 'facebook.com', 'fb.com', 'threads.net', 'threads.com',
  'instagram.com', 'youtube.com', 'youtu.be', 'linkedin.com', 'x.com', 'twitter.com', 'reddit.com',
  'tiktok.com', 'plurk.com', 'line.me', 'quora.com', 'zhihu.com', 'bahamut.com.tw', 'gamer.com.tw',
];

const REFERENCE_HOSTS = [
  'wikipedia.org', 'wikiwand.com', 'baike.baidu.com', 'wikidata.org',
  '104.com.tw', '1111.com.tw', '518.com.tw', 'yes123.com.tw', 'cakeresume.com', 'cake.me',
  'findbiz.nat.gov.tw', 'gcis.nat.gov.tw', 'twincn.com', 'opengovtw.com', 'findcompany.com.tw',
  'google.com', 'goo.gl', 'crunchbase.com', 'glassdoor.com', 'trustpilot.com', 'g2.com', 'capterra.com',
  'shopee.tw', 'momoshop.com.tw', 'pchome.com.tw', 'books.com.tw', 'ruten.com.tw', 'yahoo.com',
];

const MEDIA_HOSTS = [
  'udn.com', 'ltn.com.tw', 'chinatimes.com', 'ettoday.net', 'cna.com.tw', 'bnext.com.tw', 'inside.com.tw',
  'ithome.com.tw', 'technews.tw', 'businessweekly.com.tw', 'cw.com.tw', 'gvm.com.tw', 'managertoday.com.tw',
  'tvbs.com.tw', 'setn.com', 'nownews.com', 'storm.mg', 'thenewslens.com', 'cmoney.tw', 'ctee.com.tw',
  'businesstoday.com.tw', 'wealth.com.tw', 'digitimes.com.tw', 'meet.bnext.com.tw', 'techbang.com',
  'vocus.cc', 'medium.com', 'matters.town', 'pixnet.net', 'blogspot.com', 'wordpress.com', 'substack.com',
  'hackmd.io', 'ithelp.ithome.com.tw', 'nytimes.com', 'theverge.com', 'techcrunch.com', 'forbes.com',
  'wired.com', 'bbc.com', 'reuters.com', 'bloomberg.com',
];

// 標題長這樣的，八九不離十是清單／評比文：「2026 台北 10 家推薦」「XX 怎麼選」「5 款比較」
const LISTICLE_TITLE = /推薦|排名|排行|比較|評比|懶人包|精選|盤點|總整理|怎麼選|如何選|哪.{0,6}(好|推)|top\s?\d|best\b|\d+\s?(家|款|個|間|大|種|選)/i;

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

export function classifyCitation(c: { url: string; title: string; isSelf: boolean }): SourceKind {
  if (c.isSelf) return 'self';
  const host = hostnameOf(c.url);
  if (!host) return 'other';
  if (hostMatches(host, FORUM_HOSTS)) return 'forum';
  if (hostMatches(host, REFERENCE_HOSTS)) return 'reference';
  if (/\.(gov|edu)(\.tw)?$/.test(host)) return 'gov';
  // 清單文看標題，而且排在媒體前面：媒體寫的「10 間推薦」對行銷來說重點是「能不能被列進去」，
  // 不是「它是媒體」。
  if (LISTICLE_TITLE.test(c.title)) return 'listicle';
  if (hostMatches(host, MEDIA_HOSTS)) return 'media';
  return 'other';
}

export function summarizeSources(citations: SourceCitation[]): SourceBreakdown {
  // 先依網址合併再分類：同一個網址在不同回答裡標題可能一個有、一個空（Perplexity 常這樣），
  // 逐筆分類會把同一頁一半算清單文、一半算其他。
  const targets = new Map<string, SourceTarget & { isSelf: boolean }>();
  for (const c of citations) {
    const key = c.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    const existing = targets.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.keywords.includes(c.keyword)) existing.keywords.push(c.keyword);
      if (!existing.title && c.title) existing.title = c.title;
    } else {
      targets.set(key, { url: c.url, title: c.title, domain: hostnameOf(c.url), count: 1, keywords: [c.keyword], isSelf: c.isSelf });
    }
  }

  const byKind = new Map<SourceKind, SourceTarget[]>();
  let total = 0;
  let selfCount = 0;
  for (const t of targets.values()) {
    const kind = classifyCitation(t);
    total += t.count;
    if (kind === 'self') selfCount += t.count;
    const { isSelf: _drop, ...target } = t;
    void _drop;
    const list = byKind.get(kind) ?? [];
    list.push(target);
    byKind.set(kind, list);
  }

  const kinds: SourceKindSummary[] = [];
  for (const kind of SOURCE_KIND_ORDER) {
    const list = byKind.get(kind);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => b.count - a.count || b.keywords.length - a.keywords.length || a.domain.localeCompare(b.domain));
    const count = list.reduce((n, t) => n + t.count, 0);
    kinds.push({
      kind,
      count,
      share: total > 0 ? count / total : 0,
      domains: new Set(list.map((t) => t.domain)).size,
      targets: list,
    });
  }

  return { total, kinds, selfCount };
}

// 一句話總結給行銷主管看：AI 這些回答的引用裡，最大宗是哪一類、你在不在裡面。
export function sourceHeadline(b: SourceBreakdown): string {
  if (b.total === 0) return '';
  const top = b.kinds.filter((k) => k.kind !== 'self').sort((a, b) => b.count - a.count)[0];
  if (!top) return `AI 這 ${b.total} 次引用全部來自你自己的網站。`;
  const pct = Math.round(top.share * 100);
  const selfPart = b.selfCount > 0 ? `你的網站佔 ${b.selfCount} 次` : '你的網站一次都沒被引到';
  return `AI 這 ${b.total} 次引用裡，${pct}% 來自${SOURCE_KIND_META[top.kind].label}（${top.count} 次、${top.domains} 個網域）；${selfPart}。`;
}
