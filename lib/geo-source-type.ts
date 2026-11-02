// ── 引用來源分類 ───────────────────────────────────────────
// AI 回答引用的網址，照「客戶看得懂」的類別分：你的網站／對手官網／電商通路／
// 媒體評論／社群論壇／其他。純網域規則，不花 API；名單以台灣常見站為主，
// 漏掉的會落到「其他」，不會被錯分到對手。

export type SourceType = 'self' | 'competitor' | 'shop' | 'media' | 'social' | 'other';

export const SOURCE_LABEL: Record<SourceType, string> = {
  self: '你的網站',
  competitor: '對手官網',
  shop: '電商通路',
  media: '媒體評論',
  social: '社群論壇',
  other: '其他網站',
};

// 網域結尾比對（含子網域）
const SHOP = [
  'pchome.com.tw', 'momoshop.com.tw', 'shopee.tw', 'shopee.com', 'poyabuy.com.tw', 'cosmed.com.tw',
  'watsons.com.tw', 'tw.buy.yahoo.com', 'tw.mall.yahoo.com', 'books.com.tw', 'rakuten.com.tw',
  'etmall.com.tw', 'friday.tw', 'pcone.com.tw', 'carrefour.com.tw', 'costco.com.tw', 'pxmart.com.tw',
  'sogo.com.tw', 'shopline.tw', 'shopline.com', 'amazon.com', 'coupang.com', 'tw.coupang.com',
  'greatpharmacy.com.tw', 'urcosme.com',
];
const MEDIA = [
  'cosme.net.tw', 'my-best.com', 'womenshealthmag.com', 'harpersbazaar.com', 'vogue.com.tw', 'elle.com',
  'bella.tw', 'udn.com', 'ettoday.net', 'ltn.com.tw', 'chinatimes.com', 'setn.com', 'tvbs.com.tw',
  'cw.com.tw', 'businessweekly.com.tw', 'commonhealth.com.tw', 'heho.com.tw', 'hello-life.com.tw',
  'mamaclub.com', 'marieclaire.com.tw', 'cosmopolitan.com', 'gq.com.tw', 'beauty321.com', 'styleme.com.tw',
  'popdaily.com.tw', 'womany.net', 'vocus.cc', 'medium.com', 'pixnet.net', 'kingstone.com.tw',
  'storm.mg', 'nownews.com', 'mirrormedia.mg', 'yahoo.com', 'wikipedia.org', 'femh.org.tw',
];
const SOCIAL = [
  'facebook.com', 'instagram.com', 'threads.net', 'threads.com', 'dcard.tw', 'ptt.cc', 'pttweb.cc',
  'youtube.com', 'youtu.be', 'tiktok.com', 'babyhome.com.tw', 'mobile01.com', 'line.me', 'reddit.com',
  'x.com', 'twitter.com', 'lemon8-app.com', 'xiaohongshu.com',
];

const endsWithAny = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

// 對手官網：網域裡有對手品牌名的英文字（saugella.com.tw、vigill.com.tw）。
// 中文品牌名比不了網域，比不到就落到「其他」——寧可漏，不要把媒體錯標成對手。
export function brandSlugs(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of n.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
      if (!['the', 'care', 'tw', 'taiwan', 'official', 'shop', 'store', 'beauty'].includes(w)) out.add(w);
    }
  }
  return [...out];
}

export function classifySource(host: string, isSelf: boolean, competitorSlugs: string[]): SourceType {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (isSelf) return 'self';
  if (endsWithAny(h, SHOP)) return 'shop';
  if (endsWithAny(h, SOCIAL)) return 'social';
  if (endsWithAny(h, MEDIA)) return 'media';
  const label = h.split('.')[0];
  if (competitorSlugs.some((s) => label.includes(s) || h.includes(`${s}.`))) return 'competitor';
  return 'other';
}
