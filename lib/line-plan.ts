import { parse } from 'node-html-parser';
import { fetchSitemapUrls, fetchWithTimeout, readTextCapped } from './geo-audit-crawler';
import { guardedFetch } from './geo-url-guard';
import { hostnameOf, isSameSite } from './geo-brand-visibility';
import { askPickedQuestions } from './geo-recommend-ask';
import { askJson, parseJson, type RecommendInput, type RecommendVisibility } from './geo-recommend-visibility';
import { checkKeyword, type KeywordRank } from './seo-keyword-rank';
import { forumPosts, pickQuestions, serper } from './geo-real-questions';
import { brandKeys, handleIsBrand } from './geo-owned-sources';
import { classifySource } from './geo-source-type';
import type { KeywordStatus, LineCandidate, LinePlan, LinePlanInput, MediaRow, PageRead, PageWord, PlanTodo, RivalRow, RivalSite, Tri } from './line-plan-types';
import { pageName } from './line-plan-types';

// ── 產品線作戰清單（公司內部用）────────────────────────────
// 11-23 小積木：Relove 臉部保養成效差，工具要說清楚「要做什麼」才打得上——頁面文字、文章、站內連結、
// 媒體曝光，還要跟指定對手（綠藤）比。健檢那份照舊只講問題，這份只給公司帳號。
// 事實全用規則算；模型只做兩件事：從選單分產品線、checkKeyword 裡的前 3 名比對。每條待辦都有網址或原文當依據。

// 媒體名單只收媒體、社群論壇；電商通路和其他網站不算曝光機會
function classifyForPlan(host: string): string | null {
  const t = classifySource(host, false, []);
  return t === 'media' ? '媒體文章' : t === 'social' ? '社群論壇' : null;
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const pathKey = (u: string) => {
  try {
    const x = new URL(u);
    return (x.origin + decodeURIComponent(x.pathname)).replace(/\/+$/, '').toLowerCase();
  } catch {
    return u;
  }
};
const REC_BLOCK = /您可能喜歡|你可能(也)?喜歡|猜你喜歡|相關商品|推薦商品|看過此商品的人/; // 「送貨及付款方式」是頁籤名、排在商品描述前面，拿它切會把整段描述和問答切掉（11-24 Relove）

export function readHtml(html: string, url: string, menu: Set<string> = new Set()): PageRead {
  const root = parse(html);
  const title = norm(root.querySelector('title')?.text ?? '');
  const description = norm(root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '');
  const jsonLd = [...new Set([...html.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)].map((m) => m[1]))];
  root.querySelectorAll('script,style,noscript,template,nav,header,footer,svg').forEach((n) => n.remove());
  // 選單不一定包在 nav／header 裡（Shopline 就不是）：首頁上「同網址＋同文字」的連結當選單拿掉
  // （文章正文連到商品時文字通常不同，會留下），
  // 不然每一頁都會「有寫」防曬、抗痘（11-23 Relove 實際發生）
  for (const a of root.querySelectorAll('a[href]')) {
    let abs = '';
    try {
      abs = pathKey(new URL(a.getAttribute('href') ?? '', url).href);
    } catch {
      continue;
    }
    if (menu.has(`${abs}|${norm(a.text)}`)) a.remove();
  }
  const body = root.querySelector('body') ?? root;
  // 推薦商品區之後的不算這頁的內容
  const raw = norm(body.text.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/<!-[^>]*->/g, ' '));
  const cut = raw.search(REC_BLOCK);
  const text = cut > 200 ? raw.slice(0, cut) : raw;
  const heads = body.querySelectorAll('h2,h3').map((h) => norm(h.text)).filter((h) => h && !REC_BLOCK.test(h) && !/^(分類|付款方式|送貨方式|送貨及付款方式)$/.test(h));
  const links = new Set<string>();
  for (const a of body.querySelectorAll('a[href]')) {
    try {
      const x = new URL(a.getAttribute('href') ?? '', url);
      if (x.origin === new URL(url).origin) links.add(x.origin + x.pathname);
    } catch {}
  }
  const imgs = body.querySelectorAll('img');
  return {
    url,
    readable: true,
    title,
    description,
    h1: norm(body.querySelector('h1')?.text ?? ''),
    headings: heads.slice(0, 30),
    text: text.slice(0, 20000),
    links: [...links].slice(0, 120),
    hasFaq: /常見問題|常見問答|FAQ|Q\s*[&＆]\s*A|Q[：:]/i.test(text),
    jsonLd,
    imgTotal: imgs.length,
    imgNoAlt: imgs.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length,
  };
}

const blank = (url: string): PageRead => ({ url, readable: false, title: '', description: '', h1: '', headings: [], text: '', links: [], hasFaq: false, jsonLd: [], imgTotal: 0, imgNoAlt: 0 });

// 自己的站用健檢同一支抓；對手用我們自己的身分讀，被擋就標讀不到，不繞過
async function getHtml(url: string, own: boolean): Promise<string | null> {
  try {
    const res = own
      ? await fetchWithTimeout(url)
      : await guardedFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GeoCheck/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    return await readTextCapped(res);
  } catch {
    return null;
  }
}

function linksOf(html: string, origin: string): { url: string; text: string }[] {
  const out = new Map<string, { url: string; text: string }>();
  for (const a of parse(html).querySelectorAll('a[href]')) {
    try {
      const x = new URL(a.getAttribute('href') ?? '', origin);
      const t = norm(a.text);
      if (x.origin !== origin || !t || t.length > 40 || /\.(jpg|png|pdf|webp)$/i.test(x.pathname)) continue;
      const u = x.origin + x.pathname;
      out.set(`${u}|${t}`, { url: u, text: t });
    } catch {}
  }
  return [...out.values()];
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export async function suggestLines(origin: string, apiKey: string, focus = ''): Promise<LineCandidate[] | null> {
  const html = await getHtml(origin, true);
  if (!html) return null;
  const links = linksOf(html, origin).slice(0, 160);
  const prompt = `下面是一個台灣網站首頁上的連結。請整理成${focus ? `「${focus}」這一塊底下的 4～6 條細分線（其他類別一律不要列）` : '最多 6 條「產品線／服務線」'}，並替每條想客人會打進 Google 的字。

網站標題：${norm(parse(html).querySelector('title')?.text ?? '')}
連結：
${links.map((l, i) => `[${i}] ${l.text} ${decodeURIComponent(new URL(l.url).pathname)}`).join('\n')}

規則：
- 用客人聽得懂的類別當 name（例如「清潔」「抗老」），不要用商品暱稱。活動、會員、政策、公司介紹、組合優惠不算。${focus ? '照客人的需求分（要解決什麼問題、哪種品項），彼此不重疊。' : ''}
- pages 只能填上面的編號，挑這條線的分類頁、商品頁，最多 6 個；一頁只放在最符合的那條線，優惠活動頁不要放。
- 每條線 5 個 keywords。keyword 是客人會搜的字（2～12 字，不要品牌名，不要商品暱稱），要把商品暱稱換成大家的說法（潔顏露→洗面乳）。越多人會搜、越會拿來挑商品的排越前面；這些頁沒有在賣的東西不要寫。
- words 是 keyword 拆出來、客人講的 1～2 個通用詞，不能是商品暱稱或品牌用語（例如 keyword「去黑頭洗面乳」→ words ["洗面乳","黑頭"]）。

只回傳 JSON：{"lines":[{"name":"…","pages":[0],"keywords":[{"keyword":"…","words":["…"]}]}]}`;
  try {
    const p = parseJson<{ lines?: { name?: unknown; pages?: unknown; keywords?: unknown }[] }>(await askJson(prompt, apiKey, 2500, 'openai/gpt-4.1'));
    return (p?.lines ?? [])
      .filter((l) => typeof l.name === 'string' && Array.isArray(l.keywords))
      .map((l) => ({
        name: String(l.name).trim().slice(0, 16),
        pages: [...new Set((Array.isArray(l.pages) ? l.pages : []).map((i) => links[Number(i)]?.url).filter((u): u is string => !!u))].slice(0, 6),
        keywords: (l.keywords as { keyword?: unknown; words?: unknown }[])
          .filter((k) => typeof k?.keyword === 'string' && k.keyword.trim())
          .map((k) => ({
            keyword: String(k.keyword).trim().slice(0, 24),
            words: (Array.isArray(k.words) ? k.words : []).filter((w): w is string => typeof w === 'string' && w.trim().length >= 2).map((w) => w.trim().slice(0, 12)).slice(0, 2),
          }))
          .slice(0, 5),
      }))
      .filter((l) => l.pages.length > 0 && l.keywords.length > 0)
      .slice(0, 6);
  } catch {
    return null;
  }
}

export const has = (p: PageRead, field: 'title' | 'h1' | 'text', w: string): Tri => (!p.readable ? 'unknown' : p[field].toLowerCase().includes(w.toLowerCase()) ? 'yes' : 'no');

// 送法規人員看的用語（不判定違法）。通用清單，不分品牌
const CLAIM = /醫美級|換膚|類肉毒|肉毒|零痘|消痘|治療|根治|療效|醫療級|消炎|抗菌|殺菌|\d+\s*(天|週|周|日)[^，。｜|]{0,8}(修護|見效|改善|有感)|永久|100%有效|保證/g;

const shortUrl = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname);
  } catch {
    return u;
  }
};

// 由規則產生的待辦（拆出來：不用花錢就能測）
export function ruleTodos(args: {
  home: PageRead;
  pages: PageRead[];
  picks: LinePlanInput['picks'];
}): PlanTodo[] {
  const { home, pages, picks } = args;
  const out: PlanTodo[] = [];
  const byUrl = new Map(pages.map((p) => [pathKey(p.url), p]));
  const lines = [...new Set(picks.map((p) => p.line))];
  if (home.readable) {
    const miss = lines.filter((l) => !picks.filter((p) => p.line === l).some((p) => [...p.words, l].some((w) => (home.title + home.description).includes(w))));
    if (miss.length > 0)
      out.push({ priority: '高', line: '全部', keyword: miss.join('、'), category: '頁面文字', url: home.url, now: `首頁標題和簡介沒有提到：${miss.join('、')}`, todo: `首頁簡介補上${miss.join('、')}`, suggest: '', basis: `首頁簡介：「${home.description.slice(0, 90) || '（沒有）'}」`, effort: '低', role: '文案', accept: '首頁簡介看得到這些類別' });
    const old = home.description.match(/20\d\d/)?.[0];
    if (old && Number(old) < new Date().getFullYear())
      out.push({ priority: '中', line: '全部', keyword: '—', category: '頁面文字', url: home.url, now: `首頁簡介還寫 ${old}`, todo: '拿掉過期年份', suggest: '', basis: `首頁簡介：「${home.description.slice(0, 90)}」`, effort: '低', role: '文案', accept: '簡介沒有過期年份' });
  }
  for (const pick of picks) {
    const cand = pick.pages.map((u) => byUrl.get(pathKey(u))).filter((p): p is PageRead => !!p?.readable);
    if (cand.length === 0) continue;
    const page = bestPage(cand, pick.words);
    // 字尾是商品種類（乳霜、精華），標題沒寫就可能賣的是別種，不能硬改
    const isKind = (ws: string[], k: string) => ws.filter((w) => k.endsWith(w)).map((w) => `先確認這頁賣的算不算「${w}」，不算就換別頁負責；算的話，`)[0] ?? '';
    const none = pick.words.filter((w) => has(page, 'title', w) === 'no' && has(page, 'h1', w) === 'no' && has(page, 'text', w) === 'no');
    const noTitle = pick.words.filter((w) => !none.includes(w) && has(page, 'title', w) === 'no');
    if (none.length > 0)
      out.push({ priority: '高', line: pick.line, keyword: pick.keyword, category: '頁面文字', url: page.url, now: `整頁文字找不到「${none.join('」「')}」`, todo: `${isKind(none, pick.keyword)}標題、第一段和問答加入「${none.join('」「')}」，商品名保留`, suggest: '', basis: `現在的標題：「${page.title}」（圖片裡的字不算）`, effort: '低', role: '文案', accept: `標題和內文有「${none[0]}」` });
    else if (noTitle.length > 0)
      out.push({ priority: '中', line: pick.line, keyword: pick.keyword, category: '頁面文字', url: page.url, now: `內文有、標題沒有「${noTitle.join('」「')}」`, todo: `${isKind(noTitle, pick.keyword)}標題前面放「${noTitle[0]}」`, suggest: '', basis: `現在的標題：「${page.title}」`, effort: '低', role: '文案', accept: `標題有「${noTitle[0]}」` });
  }
  const thin = pages.filter((p) => p.readable && p.headings.length === 0);
  if (thin.length > 0)
    out.push({ priority: '中', line: '全部', keyword: '—', category: '頁面文字', url: thin[0].url, now: `${thin.length} 頁沒有段落小標`, todo: '每頁加三段：適合誰、怎麼選、常見問題', suggest: '', basis: thin.slice(0, 6).map((p) => shortUrl(p.url)).join('、'), effort: '中', role: '文案', accept: '每頁至少 3 個小標' });
  const noFaq = pages.filter((p) => p.readable && !p.hasFaq);
  if (noFaq.length > 0)
    out.push({ priority: '中', line: '全部', keyword: '—', category: '內容缺口', url: noFaq[0].url, now: `${noFaq.length} 頁沒讀到問答`, todo: '補 3～5 題客人真的會問的問答', suggest: '', basis: noFaq.slice(0, 6).map((p) => shortUrl(p.url)).join('、'), effort: '中', role: '文案', accept: '頁面看得到問答' });
  // 簡介開頭一模一樣
  const heads = new Map<string, PageRead[]>();
  for (const p of pages) if (p.readable && p.description.length >= 24) heads.set(p.description.slice(0, 20), [...(heads.get(p.description.slice(0, 20)) ?? []), p]);
  for (const [h, ps] of heads)
    if (ps.length >= 3) out.push({ priority: '中', line: '全部', keyword: '—', category: '頁面文字', url: ps[0].url, now: `${ps.length} 頁簡介開頭都是同一句`, todo: '每頁簡介改成自己的：適合誰、解決什麼', suggest: '', basis: `共同開頭：「${h}…」`, effort: '中', role: '文案', accept: '各頁簡介不重複' });
  // 不針對現有文章挑毛病（標題開頭相同、沒連商品頁）：他們之後會補新文章，清單只講網站本身（11-27）
  const alt = pages.filter((p) => p.readable && p.imgTotal >= 5 && p.imgNoAlt * 2 >= p.imgTotal);
  if (alt.length > 0)
    out.push({ priority: '低', line: '全部', keyword: '—', category: '站內連結', url: alt[0].url, now: `${alt.length} 頁有一半以上圖片沒有文字說明`, todo: '先補商品說明圖的文字說明', suggest: '', basis: alt.slice(0, 5).map((p) => `${shortUrl(p.url)}（${p.imgNoAlt}/${p.imgTotal}）`).join('、'), effort: '中', role: '工程', accept: '說明圖都有文字' });
  const claims = new Map<string, string>();
  for (const p of pages) if (p.readable) for (const m of `${p.title} ${p.description}`.matchAll(CLAIM)) if (!claims.has(m[0])) claims.set(m[0], p.url);
  if (claims.size > 0)
    out.push({ priority: '高', line: '全部', keyword: '—', category: '宣稱與口碑', url: [...claims.values()][0], now: `標題或簡介看到：${[...claims.keys()].slice(0, 8).map((c) => `「${c}」`).join('')}`, todo: '改標題前先請法規人員逐條確認', suggest: '', basis: '這裡只列出來，不判定是否違法', effort: '低', role: '法規', accept: '每條有「可用／改寫／刪」結論' });
  return out;
}

// 一半以上的頁都有的同一段字＝整站促銷條，不算這頁自己寫的（Relove 滿額贈「胜肽澎彈乳霜旅行包」讓每頁都「有寫乳霜」，11-24）
export function dropShared(pages: PageRead[]): PageRead[] {
  const ok = pages.filter((p) => p.readable);
  if (ok.length < 4) return pages;
  const n = new Map<string, number>();
  for (const p of ok) for (const t of new Set(p.text.split(' '))) n.set(t, (n.get(t) ?? 0) + 1);
  return pages.map((p) => ({ ...p, text: p.text.split(' ').filter((t) => (n.get(t) ?? 0) * 2 < ok.length).join(' ') }));
}

// 建議補的一串名詞（胜肽、玻尿酸、A醇）頁面已經寫了哪些
export function alreadyOn(what: string, text: string): { all: boolean; found: string[] } {
  const terms = (what.match(/[\u4e00-\u9fffA-Za-z0-9]{2,6}(、[\u4e00-\u9fffA-Za-z0-9]{2,6})+/g) ?? []).flatMap((x) => x.split('、')).map((t) => t.replace(/^(說明|介紹|像|含|例如|如)|[的等]$/g, '')).filter((t) => t.length >= 2);
  const found = terms.filter((t) => text.includes(t));
  return { all: terms.length >= 2 && found.length === terms.length, found };
}

export function bestPage(pages: PageRead[], words: string[]): PageRead {
  const score = (p: PageRead) => words.reduce((n, w) => n + (has(p, 'title', w) === 'yes' ? 3 : 0) + (has(p, 'h1', w) === 'yes' ? 2 : 0) + (has(p, 'text', w) === 'yes' ? 1 : 0), 0) + (/\/products?\//.test(p.url) ? 0.5 : 0) - (/組合|套組|多入|任選|優惠|\d\s*(入|件)/.test(p.title) || /(^|[-_])(\d*set|special|duo|combo|bundle|discount|sale)([-_/]|$)/i.test(p.url.split('/').pop() ?? '') ? 6 : 0); // 組合、優惠頁不當主頁
  return [...pages].sort((a, b) => score(b) - score(a))[0];
}

export interface RivalRead {
  pages: PageRead[];
  menu: string[];
}
const RIVAL_CHECKS: [string, (p: PageRead) => boolean][] = [
  ['段落小標', (p) => p.headings.length >= 3],
  ['常見問題', (p) => p.hasFaq],
  ['怎麼選／比較', (p) => /怎麼選|如何挑|怎麼挑|適合我|哪一種|比較表/.test(p.text)],
  ['成分／規格說明', (p) => /成分|配方|規格/.test(p.text)],
  ['實測或第三方檢驗', (p) => /實測|實證|檢驗|SGS|認證/.test(p.text)],
  ['評價資料', (p) => p.jsonLd.includes('AggregateRating')],
  ['問答標記', (p) => p.jsonLd.includes('FAQPage')],
];
const MENU_CHECKS: [string, RegExp][] = [
  ['依客人狀況逛的選單', /敏感|乾性|油性|混合|膚質|困擾|毛孔|細紋|暗沉|斑|依.{1,4}(選|找)/],
  ['教學／指南入口', /指南|教學|怎麼|攻略|知識|專欄|blog|部落格/i],
];

// 你跟每一家用同一套規則量。讀得到的同業有一半以上比你多＝要追；你比每一家都多＝可主打
export function rivalRows(self: RivalRead, rivals: RivalRead[]): RivalRow[] {
  type Side = { score: number | null; text: string; url: string };
  const row = (item: string, measure: (r: RivalRead) => Side): RivalRow => {
    const me = measure(self);
    const cells = rivals.map(measure);
    const ok = cells.map((c) => c.score).filter((x): x is number => x !== null);
    const mine = me.score;
    const action: RivalRow['action'] =
      mine === null || ok.length === 0 ? '無法判定' : ok.filter((x) => x > mine).length * 2 >= ok.length ? '要追' : ok.every((x) => x < mine) ? '可主打' : '不一定';
    return { item, self: me.text, selfUrl: me.url, cells: cells.map((c) => ({ text: c.text, url: c.url })), action };
  };
  return [
    ...MENU_CHECKS.map(([item, re]) =>
      row(item, (r) => {
        const menu = [...new Set(r.menu)];
        const hit = menu.filter((t) => t.length <= 10 && re.test(t));
        const url = r.pages[0]?.url ?? '';
        return menu.length === 0 ? { score: null, text: '讀不到', url } : { score: hit.length > 0 ? 1 : 0, text: hit.slice(0, 4).join('、') || '選單沒看到', url };
      }),
    ),
    ...RIVAL_CHECKS.map(([item, f]) =>
      row(item, (r) => {
        const ok = r.pages.filter((p) => p.readable);
        const hit = ok.filter(f);
        return ok.length === 0 ? { score: null, text: '讀不到', url: r.pages[0]?.url ?? '' } : { score: hit.length / ok.length, text: `${hit.length}/${ok.length} 頁有`, url: (hit[0] ?? ok[0]).url };
      }),
    ),
  ];
}

// 要比官網的對手：指定的一定比；其他從定位圖挑出的同業（AI 推過、同類型，不看被推幾次）補，沒有就用 Google 第一頁的同業
const MAX_RIVAL_SITES = 8;
async function findRivalSites(input: LinePlanInput, analysis: RecommendVisibility | null, ranks: (KeywordRank | null)[], domain: string, notes: string[]): Promise<RivalSite[]> {
  const out: RivalSite[] = input.rivals.map((r) => ({ ...r, from: '指定', readable: false }));
  const add = (r: RivalSite) => {
    const h = hostnameOf(r.url);
    if (out.length < MAX_RIVAL_SITES && h && !isSameSite(h, domain) && !out.some((o) => isSameSite(hostnameOf(o.url), h))) out.push(r);
  };
  const isNamed = (n: string) => input.rivals.some((r) => n.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(n.toLowerCase()));
  const peers = [...(analysis?.rivalMap?.points ?? []).map((p) => p.name), ...(analysis?.rivalMap?.missing ?? [])].filter((n) => !isNamed(n));
  const key = process.env.SERPER_API_KEY;
  const missing: string[] = [];
  if (key)
    for (const n of peers) {
      if (out.length >= MAX_RIVAL_SITES) break;
      const d = await serper(`${n} 官網`, key).catch(() => null);
      const words = n.toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z0-9]{3,}/g) ?? [];
      const hit = (d?.organic ?? []).find((o) => {
        const h = hostnameOf(o.link);
        return h && classifySource(h, false, []) === 'other' && new URL(o.link).pathname.split('/').filter(Boolean).length <= 1 && words.some((w) => o.title.toLowerCase().includes(w) || h.includes(w));
      });
      // 官網常排在深層頁、標題又沒中文名（11-27 霓淨思：neogence.com.tw 兩筆都是 /en/… /fr/…）：前 6 筆裡同一個網站出現兩次以上也算
      const hosts = (d?.organic ?? []).slice(0, 6).map((o) => hostnameOf(o.link)).filter((h): h is string => !!h && classifySource(h, false, []) === 'other');
      const twice = hosts.find((h, i) => hosts.indexOf(h) !== i);
      if (hit) add({ name: n, url: new URL(hit.link).origin, from: 'AI 推薦的同業', readable: false });
      else if (twice) add({ name: n, url: `https://${twice}`, from: 'AI 推薦的同業', readable: false });
      else missing.push(n);
    }
  if (missing.length > 0) notes.push(`這些同業沒找到官網，只列在「AI推薦名單」：${missing.join('、')}`);
  if (peers.length === 0)
    for (const r of ranks)
      for (const t of (r?.top ?? []).filter((x) => !x.isSelf && !x.isPlatform && x.resolved !== false && classifySource(x.domain, false, []) === 'other').slice(0, 2)) add({ name: t.domain, url: new URL(t.url).origin, from: 'Google 第一頁', readable: false });
  return out;
}

export interface LinePlanBase {
  input: RecommendInput;
  brandChecks: Parameters<typeof askPickedQuestions>[0]['brandChecks'];
  insights: Parameters<typeof askPickedQuestions>[0]['insights'];
}
// 品牌官網不替別家列推薦清單
const OWN_SITE_RULE = '這是品牌自己的官網：不要叫它介紹、整理或比較別家品牌的商品。可以寫怎麼選、成分、適合誰、使用順序、自家各款差別、實測與問答。';
const FAQ_TODO = /常見問題|常見問答|FAQ|Q\s*[&＆]\s*A/i; // 那頁已經有問答就不再叫它補一段
// 商品、品牌、心得頁不能投稿，不算媒體曝光（11-25 @cosme 的商品清單被列成媒體）
const SHOP_PAGE = /^https?:\/\/(buy\.line\.me|([^/]+\.)?shopping\.)|\/(brands|products?|series)\//i;
const OTHERS = /市面上?|熱門(品牌|款|商品|產品)|主流|各家|其他(熱門|品牌)|別家|\d+\s*(款|家|個品牌)/;
// 只有這頁連到的商品頁
const productLinks = (p: PageRead, common: Set<string>) => [...new Set(p.links)].filter((u) => /\/products?\/[^/]+/i.test(u) && !common.has(pathKey(u)) && pathKey(u) !== pathKey(p.url));

// 11-27 早一點跑的清單：Google 排到文章時把「那篇文章要改哪裡」誤包成「建議之後補一篇文章：在開頭加一段…」，讀出來時拿掉（新跑的不會再產生）
export const cleanPlan = (p: LinePlan): LinePlan => ({ ...p, todos: p.todos.filter((t) => !(t.category === '內容缺口' && /^Google 第/.test(t.now) && t.todo.startsWith('建議之後補一篇文章：'))) });

export async function runLinePlan(origin: string, brand: string, input: LinePlanInput, base: LinePlanBase, apiKey: string, onStep: (s: string) => void): Promise<LinePlan> {
  const notes: string[] = [];
  const domain = hostnameOf(origin);
  onStep('讀你的網頁…');
  const homeHtml = await getHtml(origin, true);
  const menuLinks = homeHtml ? linksOf(homeHtml, origin) : [];
  // 要檢查的頁如果也在選單上，連結照樣算選單（文字會拿掉），頁面本身照讀
  const menu = new Set(menuLinks.map((l) => `${pathKey(l.url)}|${l.text}`));
  const home = homeHtml ? readHtml(homeHtml, origin) : blank(origin);
  const urls = [...new Set(input.picks.flatMap((p) => p.pages))].filter((u) => isSameSite(hostnameOf(u), domain)).slice(0, 36);
  const read = async (u: string, own: boolean, m: Set<string>) => {
    const h = await getHtml(u, own);
    const p = h ? readHtml(h, u, m) : blank(u);
    // 內容要靠瀏覽器執行才出來的頁，讀到的幾乎是空的：當讀不到，不當成沒寫
    return p.text.length < 150 ? blank(u) : p;
  };
  const listed = await pool(urls, 3, (u) => read(u, true, menu));
  // 分類頁通常只有商品清單，文字都在商品頁：每頁往下讀只有它連到的商品（首頁、選單就有的不算）
  const common = new Set(menuLinks.map((l) => pathKey(l.url)));
  const owner = new Map<string, string[]>();
  // 一頁連到一大堆商品的是總覽頁，那些商品不算它這條線的
  for (const p of listed) for (const u of productLinks(p, common).length > 6 ? [] : productLinks(p, common).slice(0, 2)) owner.set(u, [...(owner.get(u) ?? []), p.url]);
  const extra = (await pool([...owner.keys()].filter((u) => !urls.some((x) => pathKey(x) === pathKey(u))).slice(0, 20), 3, (u) => read(u, true, menu))).filter((p) => p.readable);
  const pages = [...listed, ...extra];
  input = { ...input, picks: input.picks.map((p) => ({ ...p, pages: [...p.pages, ...extra.filter((e) => owner.get(e.url)?.some((o) => p.pages.some((x) => pathKey(x) === pathKey(o)))).map((e) => e.url)] })) };
  // 多語系站的網站地圖每種語言一份、各列全站（Relove 英文 650 筆排第一份），上限 500 會只讀到英文那份就停，誤報「全是外語版」（11-27）
  const sitemap = await fetchSitemapUrls(origin, 5000).catch(() => [] as string[]);
  const words = [...new Set(input.picks.flatMap((p) => p.words))];
  const isPost = (u: string) => /\/(blog|posts?|articles?|news|column)\//i.test(u) && !/\/(blog)\/(posts|categories|tags)\/?$/i.test(u);
  // 網站地圖可能只列英文版網址（Relove 75 篇全是 /en/，內容卻是中文）：拿掉語言段，讀中文版
  const LANG = /^(https?:\/\/[^/]+)\/(en|ja|jp|ko|vi|th|id|zh-cn|zh-hans)\//i;
  const ZH = /^(https?:\/\/[^/]+)\/(zh-hant|zh-tw)\//i; // 中文版的另一種寫法，跟沒語言段的是同一篇
  const postUrls = sitemap.filter(isPost);
  const onlyLang = postUrls.length > 0 && postUrls.every((u) => LANG.test(u));
  const blogUrls = [...new Set(postUrls.map((u) => u.replace(LANG, '$1/').replace(ZH, '$1/')))].map((u) => ({ u, d: (() => { try { return decodeURIComponent(u); } catch { return u; } })() }));
  const named = blogUrls.filter((x) => words.some((w) => x.d.includes(w)));
  // 文章網址常是英文代稱或只有前半句（〈如何讓臉澎潤？〉內文標題才寫抗老乳霜），網址比不出來：文章全讀、看標題（11-27 Relove 漏掉 75 篇的臉部文章）
  const posts = (await pool([...new Set([...named, ...blogUrls].map((x) => x.u))].slice(0, 120), 3, (u) => read(u, true, menu))).filter((p) => !p.readable || input.picks.some((k) => k.words.every((w) => `${p.title} ${p.headings.join()}`.includes(w))));
  const failed = pages.filter((p) => !p.readable).length;
  if (failed > 0) notes.push(`你的網頁有 ${failed} 頁讀不到`);
  if (blogUrls.length === 0) notes.push('網站地圖裡沒找到文章，文章相關的檢查沒做');

  const lean = dropShared(pages); // 判斷「有沒有寫這個字」用
  onStep('查 Google 排名…');
  const ranks = await pool(input.picks, 2, (p) => {
    // 由哪頁負責：這條線的頁裡最貼近的那頁（讓程式自己猜會猜到首頁）
    // 現有文章不當負責頁，不然待辦會變成「這篇文章要補什麼」＝說舊文章有問題（11-27 他說文章之後另外補）
    const own = lean.filter((x) => p.pages.some((u) => pathKey(u) === pathKey(x.url))).filter((x) => x.readable);
    const page = own.length ? bestPage(own, p.words).url : undefined;
    return checkKeyword(p.keyword, origin, brand, apiKey, { page, rule: OWN_SITE_RULE }).catch(() => null);
  });
  onStep('問三家 AI、分析回答（約 2～3 分鐘）…');
  const lineNames = [...new Set(input.picks.map((p) => p.line))];
  const okPages = [...pages, ...posts].filter((p) => p.readable);
  // 跟報告同一套分析，題目換成這次的關鍵字；輪廓資料也換成這幾條線，不然定位會被整站的其他品項帶走
  const analysis = await askPickedQuestions({
    input: { ...base.input, brandName: base.input.brandName || brand, description: `這次看的產品線：${lineNames.join('、')}`, services: pages.filter((p) => p.readable).map((p) => `${p.title}：${p.description}`).join('\n').slice(0, 2000) },
    origin,
    picked: input.picks.map((p) => ({ question: p.keyword, origin: 'keyword' as const })),
    pages: okPages.map((p) => ({ url: p.url, title: p.title, text: p.text })),
    // 官網連出去的帳號：判斷哪些引用來源是品牌自己的
    siteExternalLinks: homeHtml ? [...homeHtml.matchAll(/href=["'](https?:\/\/[^"']+)/g)].map((m) => m[1]).filter((u) => !isSameSite(hostnameOf(u), domain)) : [],
    brandChecks: base.brandChecks,
    insights: base.insights,
    apiKey,
  }).catch(() => null);
  if (!analysis) notes.push('AI 回答整批查詢失敗，AI 相關的分頁沒有資料');
  else {
    if (analysis.names.length === 0) notes.push('抽 AI 推薦名單失敗');
    if (!analysis.rivalMap) notes.push('市場定位沒算出來');
    if (!analysis.contentMatch) notes.push('「AI 為什麼沒推你」沒算出來');
  }
  const keywords: KeywordStatus[] = input.picks.map((p, i) => {
    const r = ranks[i];
    const q = analysis?.questions.find((x) => x.question === p.keyword);
    const cand = p.pages.map((u) => lean.find((x) => pathKey(x.url) === pathKey(u))).filter((x): x is PageRead => !!x?.readable);
    return {
      line: p.line,
      keyword: p.keyword,
      words: p.words,
      // 跟 Google 排名比對用的是同一頁（可能是文章），畫面才不會顯示商品頁、評語卻在講文章
      page: r?.selfPage?.url ?? (cand.length ? bestPage(cand, p.words).url : undefined) ?? p.pages[0] ?? origin,
      rank: r ? r.selfRank : 'failed',
      top: (r?.top ?? []).map(({ rank, domain, url, title, isSelf, isPlatform }) => ({ rank, domain, url, title, isSelf, isPlatform })),
      ai: ['Perplexity', 'ChatGPT', 'Google'].map((e) => {
        const a = q?.results.find((x) => x.engine.startsWith(e));
        const engine = e === 'Google' ? 'Google AI 摘要' : e;
        return { engine, state: a ? (a.namedSelf ? 'named' : 'not') : e === 'Google' && q?.google === 'absent' ? 'absent' : 'failed' };
      }),
      // Google 排到的是現有文章：只說排到哪篇，不評那篇文章哪裡不好
      verdict: r?.selfPage && isPost(r.selfPage.url) ? `Google 排到的是你的文章〈${r.selfPage.title || shortUrl(r.selfPage.url)}〉` : r?.verdict ?? '',
    };
  });

  onStep('讀對手的網頁…');
  const rivalSites = await findRivalSites(input, analysis, ranks, domain, notes);
  const rivalReads = await pool(rivalSites, 3, async (site): Promise<RivalRead> => {
    const rh = await getHtml(site.url, false);
    const rl = rh ? linksOf(rh, new URL(site.url).origin) : [];
    // 外文官網用中文字比不出來，當讀不到，不當成沒有
    if (rl.filter((l) => /[\u4e00-\u9fff]/.test(l.text)).length < 5) return { pages: [blank(site.url)], menu: [] };
    const want = rl.filter((l) => words.some((w) => l.text.includes(w)) || /臉|商品|產品|服務|指南/.test(l.text)).slice(0, 6);
    const m = new Set(rl.map((x) => `${pathKey(x.url)}|${x.text}`));
    const first = await pool([...new Set((want.length ? want : rl.slice(0, 5)).map((l) => l.url))], 1, (u) => read(u, false, m));
    // 跟你用同一套：分類頁往下讀商品頁
    const seenLinks = new Set(rl.map((l) => pathKey(l.url)));
    const more = [...new Set(first.flatMap((p) => productLinks(p, seenLinks).slice(0, 2)))].slice(0, 4);
    return { pages: [...first, ...(await pool(more, 1, (u) => read(u, false, m)))], menu: rl.map((l) => l.text) };
  });
  rivalSites.forEach((r, i) => (r.readable = rivalReads[i].pages.some((p) => p.readable)));
  const unread = rivalSites.filter((r) => !r.readable).map((r) => r.name);
  if (unread.length > 0) notes.push(`對手官網讀不到或不是中文，標「讀不到」，不代表對手沒有：${unread.join('、')}`);
  const rivals = rivalSites.length > 0 ? rivalRows({ pages, menu: menuLinks.map((l) => l.text) }, rivalReads) : [];

  onStep('找媒體曝光…');
  const cited = (analysis?.questions ?? []).flatMap((q) => q.results.flatMap((r) => r.citations.map((c) => c.url)));
  const media = await findMedia(brand, lineNames, rivalSites, domain, cited, notes);

  onStep('找網友在問什麼…');
  const serperKey = process.env.SERPER_API_KEY;
  let forum: LinePlan['forum'] = [];
  if (serperKey) {
    const found = await pool(lineNames, 1, (l) => forumPosts([...new Set(input.picks.filter((p) => p.line === l).flatMap((p) => p.words))][0] ?? l, serperKey));
    const total = found.reduce((n, f) => n + f.total, 0);
    const bad = found.reduce((n, f) => n + f.failed, 0);
    if (bad > 0) notes.push(bad === total ? '網友問題搜尋失敗' : '網友問題有部分論壇查詢失敗');
    const links = new Set<string>();
    // 每條線各取一些，不然只挑得到第一條線
    const posts = found.flatMap((f) => f.posts.filter((p) => (links.has(p.link) ? false : (links.add(p.link), true))).slice(0, 15));
    if (posts.length > 0)
      forum = await pickQuestions({ ...base.input, brandName: brand, description: `這次看的產品線：${lineNames.join('、')}` }, posts, 20, apiKey)
        .then((qs) => qs.map((q) => ({ question: q.question, ...q.source })))
        .catch(() => (notes.push('網友問題整理失敗'), []));
  }

  onStep('整理待辦…');
  const todos = ruleTodos({ home, pages: lean, picks: input.picks });
  if (onlyLang)
    todos.push({ priority: '中', line: '全部', keyword: '—', category: '站內連結', url: `${origin}/sitemap.xml`, now: `網站地圖裡 ${postUrls.length} 篇文章全是外語版網址`, todo: '網站地圖改列中文版文章網址，外語版沒翻譯就先拿掉', suggest: '', basis: `例：${shortUrl(postUrls[0])}`, effort: '中', role: '工程', accept: '網站地圖看得到中文版文章網址' });
  // 前 3 名比對出來的缺口：依據是哪幾名有寫
  ranks.forEach((r, i) => {
    if (!r) return;
    const p = input.picks[i];
    // Google 排到的是現有文章：比對出的缺口都是「那篇文章要改哪裡」，不出（不挑舊文章；要寫新文章的建議由「AI 沒推你」那段給）
    if (r.selfPage && isPost(r.selfPage.url)) return;
    const url = r.selfPage?.url ?? keywords[i].page;
    const own = todos.find((t) => t.keyword === p.keyword && t.category === '頁面文字' && pathKey(t.url) === pathKey(url));
    if (own && r.titleSuggestion) own.suggest = r.titleSuggestion;
    const selfRead = okPages.find((x) => pathKey(x.url) === pathKey(url));
    const now = selfRead?.text ?? '';
    r.todos.map((t) => ({ ...t, on: alreadyOn(t.what, now) })).filter((t) => t.basis && !OTHERS.test(t.what) && !t.on.all && !(selfRead?.hasFaq && FAQ_TODO.test(t.what))).slice(0, 2).forEach((t) =>
      todos.push({ priority: r.selfRank && r.selfRank <= 10 ? '高' : '中', line: p.line, keyword: p.keyword, category: '內容缺口', url, now: r.selfRank ? `Google 第 ${r.selfRank} 名` : 'Google 第一頁沒有你', todo: t.on.found.length > 0 ? `${t.what}（這頁已出現：${t.on.found.join('、')}，補沒寫到的）` : t.what, suggest: own ? '' : r.titleSuggestion, basis: `${t.basis}（比對：${r.rivals.map((x) => hostnameOf(x.url)).join('、')}）`, effort: '中', role: '文案', accept: '段落上線' }),
    );
  });
  for (const m of analysis?.contentMatch ?? []) {
    const k = keywords.find((x) => x.keyword === m.question);
    if (!k || m.verdict === 'yes' || !m.advice || k.ai.some((a) => a.state === 'named')) continue;
    // 最接近的是現有文章、或根本沒有頁：不說那篇文章哪裡不好，改成建議之後補一篇
    const toPost = m.verdict === 'no' || (!!m.pageUrl && isPost(m.pageUrl));
    todos.push({ priority: '中', line: k.line, keyword: k.keyword, category: '內容缺口', url: toPost ? k.page : m.pageUrl || k.page, now: toPost ? 'AI 沒推你，網站上還沒有專門回答這題的頁' : `AI 沒推你，最接近的頁：${m.pageTitle}${m.pageAbout ? `（${m.pageAbout}）` : ''}`, todo: toPost ? `建議之後補一篇文章：${m.advice.replace(/^(可以|建議)?(新增|寫|補)一(頁|篇)(文章)?/, '')}` : m.advice, suggest: '', basis: m.peerPages.length ? `AI 這題引用的同業頁：${m.peerPages.map((p) => p.title).join('／')}` : '比對這次讀到的頁面內容', effort: '中', role: '文案', accept: toPost ? '文章上線' : '內容上線' });
  }
  // 小標、問答前面已經逐頁列過；其他的指到「還沒有」的那一頁
  for (const row of rivals.filter((r) => r.action === '要追' && !/^(段落小標|常見問題)$/.test(r.item))) {
    const check = RIVAL_CHECKS.find(([item]) => item === row.item)?.[1];
    const lack = check ? pages.find((p) => p.readable && /\/products?\//.test(p.url) && !check(p)) ?? pages.find((p) => p.readable && !check(p)) : undefined;
    const who = row.cells.flatMap((c, i) => (/^(0\/|讀不到|選單沒看到)/.test(c.text) ? [] : [`${rivalSites[i].name}：${c.text}`]));
    todos.push({ priority: '中', line: '全部', keyword: '—', category: '頁面文字', url: lack?.url ?? origin, now: `${row.item}：你 ${row.self}`, todo: `補上「${row.item}」（多數讀得到的同業比你完整）`, suggest: '', basis: who.slice(0, 4).join('；'), effort: '中', role: /標記|評價資料/.test(row.item) ? '工程' : '文案', accept: '選定的商品頁都有' });
  }
  for (const t of (analysis?.sentiment?.themes ?? []).filter((x) => x.polarity === 'negative').slice(0, 5))
    todos.push({ priority: '低', line: '品牌整體', keyword: '—', category: '宣稱與口碑', url: origin, now: `AI 講到的負面（不一定是這幾條線）：${t.theme}`, todo: `確認「${t.theme}」是不是事實，是就在商品頁正面說明`, suggest: '', basis: `${t.quoteEngine}：「${t.quote}」`, effort: '中', role: '文案', accept: '有結論並更新頁面' });
  const gap = media.filter((m) => !m.mentions.split('、').includes(brand) && m.type === '媒體文章').slice(0, 8);
  if (gap.length > 0)
    todos.push({ priority: '中', line: '全部', keyword: '—', category: '媒體曝光', url: gap[0].url, now: `搜得到 ${gap.length} 個媒體頁的標題提到對手、沒提到你`, todo: '逐一評估投稿或受訪，名單在「媒體名單」', suggest: '', basis: gap.map((m) => `${m.site}（${m.mentions}）`).join('、'), effort: '高', role: '公關', accept: '每家有聯絡結果' });
  const order = { 高: 0, 中: 1, 低: 2 };
  // 先法規，不然標題改了可能要重改；再照優先
  todos.sort((a, b) => order[a.priority] - order[b.priority] || Number(b.role === '法規') - Number(a.role === '法規'));
  const pageWords: PageWord[] = input.picks.flatMap((p) => {
    const cand = p.pages.map((u) => lean.find((x) => pathKey(x.url) === pathKey(u))).filter((x): x is PageRead => !!x);
    const ok = cand.filter((x) => x.readable);
    const pg = ok.length ? bestPage(ok, p.words) : cand[0];
    return pg ? p.words.map((w) => ({ page: pageName(pg), url: pg.url, word: w, title: has(pg, 'title', w), h1: has(pg, 'h1', w), body: has(pg, 'text', w), currentTitle: pg.title })) : [];
  });
  const seen = new Set<string>();
  if (keywords.some((k) => k.rank === 'failed')) notes.push('有關鍵字的 Google 排名查詢失敗，標「查詢失敗」');
  return {
    brand,
    rivalSites,
    checkedAt: new Date().toISOString(),
    pagesRead: pages.length - failed,
    pagesFailed: failed,
    keywords,
    todos,
    pageWords: pageWords.filter((w) => (seen.has(w.url + w.word) ? false : (seen.add(w.url + w.word), true))),
    rivals,
    media,
    forum,
    analysis,
    notes,
  };
}

async function findMedia(brand: string, lines: string[], sites: RivalSite[], domain: string, cited: string[], notes: string[]): Promise<MediaRow[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    notes.push('媒體搜尋沒有設定');
    return [];
  }
  const rows = new Map<string, MediaRow>();
  // 退而用網域當名字的對手不查（沒人會在標題寫網域）
  const names = [{ n: brand }, ...sites.filter((r) => !/\.[a-z]{2,}$/i.test(r.name)).map((r) => ({ n: r.name }))];
  const ownKeys = [brandKeys([brand], domain), ...sites.map((r) => brandKeys([r.name], hostnameOf(r.url)))];
  const bad: string[] = [];
  const rivalHosts = sites.map((r) => hostnameOf(r.url));
  for (const { n } of names)
    for (const l of lines) {
      try {
        const d = await serper(`"${n}" ${l} 推薦`, key);
        for (const o of d.organic ?? []) {
          const host = hostnameOf(o.link);
          if (!host || isSameSite(host, domain) || rivalHosts.some((h) => isSameSite(host, h))) continue;
          if (SHOP_PAGE.test(o.link)) continue;
          const type = classifyForPlan(host);
          // 品牌自己的粉專、帳號不算曝光
          const handle = decodeURIComponent(new URL(o.link).pathname.split('/')[1] ?? '').toLowerCase().replace(/^@/, '');
          if (type === '社群論壇' && ownKeys.some((ks) => handleIsBrand(new URL(o.link), ks) || ks.some((k) => k.length >= 4 && handle.startsWith(k)))) continue;
          if (!type || !o.title.toLowerCase().includes(n.toLowerCase())) continue;
          const k = o.link.split('?')[0];
          const prev = rows.get(k);
          if (prev) {
            if (!prev.mentions.split('、').includes(n)) {
              prev.mentions += `、${n}`;
              if (n === brand) prev.advice = '已有曝光，可更新或延伸';
            }
          } else rows.set(k, { site: host, url: o.link, type, mentions: n, advice: n === brand ? '已有曝光，可更新或延伸' : type === '社群論壇' ? '觀察網友在意什麼，不要假裝網友發文' : '評估投稿或合作', aiCited: cited.some((c) => c.split('?')[0] === k) });
        }
      } catch {
        bad.push(`${n} ${l}`);
      }
    }
  if (bad.length > 0) notes.push(`媒體搜尋有 ${bad.length} 次失敗：${bad.slice(0, 3).join('、')}${bad.length > 3 ? '…' : ''}`);
  return [...rows.values()].sort((a, b) => Number(b.aiCited) - Number(a.aiCited)).slice(0, 40);
}
