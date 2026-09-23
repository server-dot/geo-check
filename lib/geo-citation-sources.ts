// ── GEO：AI 引用來源分類 ──────────────────────────────
// 「AI 為什麼沒推薦你」三關判斷要用到兩種分法：
// - 第 2 關拿「AI 引了哪些同業頁面」當對照組——平台、清單文、論壇、海外站都不是同業，要濾掉。
// - 第 3 關講「AI 偏好第三方推薦」——平台、清單文、論壇、媒體被引了幾次。
//
// 分類只看網域跟標題，純規則，不問 AI：分錯一個網域的代價是一列標籤不對，
// 但多打一次 API 的代價是每份報告都變慢。
//
// 純函式、零 import，前端 client component 可以直接引用。

export type SourceKind = 'self' | 'listicle' | 'forum' | 'reference' | 'media' | 'gov' | 'other';

const FORUM_HOSTS = [
  'ptt.cc', 'dcard.tw', 'mobile01.com', 'facebook.com', 'fb.com', 'threads.net', 'threads.com',
  'instagram.com', 'youtube.com', 'youtu.be', 'linkedin.com', 'x.com', 'twitter.com', 'reddit.com',
  'tiktok.com', 'plurk.com', 'line.me', 'quora.com', 'bahamut.com.tw', 'gamer.com.tw',
];

// 接案／媒合平台：不是同業，但對「推薦誰」這種題目，AI 很常引（09-23 實測出任務一家就被引十幾次），
// 所以第 3 關算「第三方」。
const PLATFORM_HOSTS = [
  'tasker.com.tw', 'pro360.com.tw', 'nabi.104.com.tw', 'case.1111.com.tw', 'clutch.co', 'fiverr.com', 'upwork.com',
];

// 大陸、日本、韓國站是查詢沒限定地區時混進來的雜訊（查詢端已經加了台灣限定，這裡再擋一層）。
const FOREIGN_HOSTS = [
  '163.com', 'sohu.com', 'sina.com.cn', 'qq.com', 'baidu.com', 'csdn.net', 'zhihu.com', 'bilibili.com', 'toutiao.com',
];
const EXCLUDED_TLD = /\.(cn|jp|kr)$/;

function isForeign(host: string): boolean {
  return EXCLUDED_TLD.test(host) || hostMatches(host, FOREIGN_HOSTS);
}

const REFERENCE_HOSTS = [
  'wikipedia.org', 'wikiwand.com', 'wikidata.org',
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

// 同業：不是自己、不是平台／清單文／論壇／媒體／百科／政府、也不是海外站。
// 剩下的多半是做同一件事的公司或個人顧問（darrelltw 這種個人顧問站也算）。
export function isPeerSource(c: { url: string; title: string; isSelf: boolean }): boolean {
  const host = hostnameOf(c.url);
  if (!host || isForeign(host) || hostMatches(host, PLATFORM_HOSTS)) return false;
  return classifyCitation(c) === 'other';
}

// 第三方推薦：別人寫的「推薦誰」——平台、清單文、論壇、媒體。
export function isThirdPartySource(c: { url: string; title: string; isSelf: boolean }): boolean {
  if (c.isSelf) return false;
  const host = hostnameOf(c.url);
  if (!host || isForeign(host)) return false;
  if (hostMatches(host, PLATFORM_HOSTS)) return true;
  const kind = classifyCitation(c);
  return kind === 'listicle' || kind === 'forum' || kind === 'media';
}
