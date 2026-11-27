import { paidFetch } from './paid-fetch';

// ── 競爭對手分析的證據：購物搜尋的售價和通路（Serper），不問 AI ─────────
// 11-25 小積木：Relove 被歸到低價。原本讓 AI 上網查完直接打 -2～2 分：24 個分數有 11 個跟自己寫的理由相反、
// 價格只看瓶價不看容量、每次不一樣。改成售價通路由程式抓、換算每 100ml。

export interface PriceFact {
  per: number; // 每 100ml／100g，或每片
  unit: string; // '100ml'、'片'
  title: string;
  price: number;
  size: number;
  source: string; // 通路
  n: number; // 取幾筆的中位數
}

const key = () => process.env.SERPER_API_KEY ?? '';
let next = 0;
async function serper<T>(path: string, q: string): Promise<T | null> {
  const wait = Math.max(0, next - Date.now());
  next = Date.now() + wait + 250; // 每秒最多 5 次
  await new Promise((r) => setTimeout(r, wait));
  try {
    const res = await paidFetch(`https://google.serper.dev/${path}`, {
      method: 'POST',
      headers: { 'X-API-KEY': key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'tw', hl: 'zh-tw' }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const flat = (s: string) => s.toLowerCase().replace(/[\s'’.&·・-]/g, '');
// 「VIGILL 婦潔」→ vigill、婦潔，標題有任何一個就算這家；太短太通用的不算
export function brandTokens(name: string): string[] {
  const zh = name.match(/[一-鿿]{2,}/g) ?? [];
  const en = name.match(/[A-Za-z0-9][A-Za-z0-9.&'’-]*(?:\s+[A-Za-z][A-Za-z0-9.&'’-]*)*/g) ?? [];
  return [...zh, ...en].map(flat).filter((t) => t.length >= 2 && !/^(the|official|taiwan|官方|品牌|公司|工作室|私密|保養|清潔|護理)$/.test(t));
}
const has = (title: string, tokens: string[]) => {
  const t = flat(title);
  return tokens.some((k) => (/^[a-z0-9]{2,3}$/.test(k) ? new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i').test(title) : t.includes(k)));
};

// 標題裡的容量；有兩個容量、組合、贈品、小包裝的不拿來算
const BUNDLE = /組合|組$|入組|禮盒|套組|任選\s*\d|任\s*\d|買\s*\d|[+＋]|[xX×＊*]\s*\d|\d\s*(入|瓶|罐|支|件|盒)(?!裝?1)|[二兩三四五六]\s*(入|瓶|罐|件)|買.{0,4}送|加送|贈|送\s*\d|補充包|旅行|體驗|試用|小樣|隨身/;
// 通路自己加在最前面的促銷字，不是商品名：「11/30前最高送900【VIGILL 婦潔】…」
const promo = (t: string) => t.replace(/^\s*\d+\/\d+前[^【\[]*/, '').replace(/【加入LINE[^】]*】/g, '').trim();
function sizeOf(title: string): { size: number; kind: 'ml' | 'g' } | null {
  const m = [...title.matchAll(/(\d+(?:\.\d+)?)\s*(ml|毫升|cc|g|公克|克)(?![a-z])/gi)];
  if (m.length === 0 || new Set(m.map((x) => x[1])).size > 1) return null;
  return { size: Number(m[0][1]), kind: /ml|毫升|cc/i.test(m[0][2]) ? 'ml' : 'g' };
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export interface ShopItem { title: string; price: number; source: string }
// 同類單品換算每 100ml（或 100g）。words＝這類商品標題會有的字；skip＝不同類的字
// must：這類商品的主題字（私密）。施巴的私密護潔露不能拿 1000ml 身體潔膚露來比
// words 給空陣列＝全系列（11-27 起定位圖看品牌整體價位，不挑單品）：各種商品都算，離中位數 3 倍內都留
export function pickPrice(items: ShopItem[], name: string, words: string[], skip: string[], must = ''): PriceFact | null {
  const wide = words.length === 0;
  const tokens = brandTokens(name);
  const ok = items.flatMap((it) => {
    const t = promo(it.title);
    if (!has(t, tokens) || BUNDLE.test(t) || (!wide && !words.some((w) => t.includes(w))) || skip.some((w) => t.includes(w))) return [];
    const z = sizeOf(t);
    if (!z || z.size < 50 || z.size > 1500 || !(it.price > 20)) return [];
    return [{ ...it, size: z.size, per: (it.price / z.size) * 100 }];
  });
  if (ok.length === 0) return null;
  // 標了主題字的和沒標的單價差太多＝混到別種商品（身體潔膚露、擦的凝露），只用標了的
  const topical = must ? ok.filter((x) => x.title.includes(must)) : [];
  let pool = ok;
  const rest = ok.filter((x) => !topical.includes(x));
  if (topical.length > 0 && rest.length > 0) {
    const ratio = median(topical.map((x) => x.per)) / median(rest.map((x) => x.per));
    if (ratio > 1.8 || ratio < 1 / 1.8) pool = topical;
  }
  // 同通路同容量重複的只留一筆；離中位數太遠的（代購、標錯）拿掉再取中位數
  const uniq = [...new Map(pool.map((x) => [`${x.source}|${x.size}|${x.price}`, x])).values()];
  const m0 = median(uniq.map((x) => x.per));
  const band = wide ? 3 : 2;
  const keep = uniq.filter((x) => x.per >= m0 / band && x.per <= m0 * band);
  if (new Set(keep.map((x) => x.source)).size < 2) return null; // 只有一個通路可能是代購價，不算
  const m = median(keep.map((x) => x.per));
  const rep = [...keep].sort((a, b) => Math.abs(a.per - m) - Math.abs(b.per - m))[0];
  if (process.env.RIVAL_DEBUG) console.log('PRICE', name, Math.round(m), keep.map((x) => `\n     ${Math.round(x.per)}｜${x.price}/${x.size}｜${x.source}｜${x.title.slice(0, 46)}`).join(''));
  return { per: Math.round(m), unit: '100ml', title: rep.title, price: rep.price, size: rep.size, source: rep.source, n: keep.length };
}

export async function shopItems(name: string, product: string): Promise<ShopItem[]> {
  const d = await serper<{ shopping?: { title?: string; price?: string; source?: string }[] }>('shopping', `${name} ${product}`);
  return (d?.shopping ?? []).flatMap((x) => {
    const price = Number((x.price ?? '').replace(/[^\d.]/g, ''));
    return x.title && price > 0 && /^\s*(NT)?\$/.test(x.price ?? '') ? [{ title: x.title, price, source: x.source ?? '' }] : [];
  });
}

// 這家的商品在哪些通路買得到（購物搜尋看得到的）
export interface ChannelFact { n: number; names: string[] }
export function channelsOf(items: ShopItem[], name: string): ChannelFact | null {
  const tokens = brandTokens(name);
  const names = new Map<string, number>();
  for (const it of items) {
    if (!it.source || !has(it.title, tokens)) continue;
    const c = channelName(it.source, tokens);
    names.set(c, (names.get(c) ?? 0) + 1);
  }
  return names.size > 0 ? { n: names.size, names: [...names].sort((a, b) => b[1] - a[1]).map(([x]) => x) } : null;
}
const CHANNELS: [RegExp, string][] = [[/康是美|cosmed/i, '康是美'], [/屈臣氏|watsons/i, '屈臣氏'], [/寶雅|poya/i, '寶雅'], [/momo/i, 'momo'], [/pchome/i, 'PChome'], [/蝦皮|shopee/i, '蝦皮'], [/yahoo/i, 'Yahoo'], [/酷澎|coupang/i, '酷澎'], [/全聯|px/i, '全聯'], [/家樂福|carrefour/i, '家樂福'], [/博客來|books/i, '博客來'], [/東森|etmall/i, '東森購物'], [/樂天|rakuten/i, '樂天'], [/friday/i, 'friDay'], [/costco|好市多/i, '好市多'], [/cosme/i, '@cosme'], [/樂購|biggo/i, 'BigGo']];
function channelName(source: string, tokens: string[]): string {
  const hit = CHANNELS.find(([re]) => re.test(source));
  if (hit) return hit[1];
  return has(source, tokens) ? '自家官網' : source.replace(/\.(com|tw|net)(\.tw)?$/i, '').slice(0, 14);
}

// 同一家的不同寫法（「HH 草本新淨界」「HH Herb & Health」）：第一個英文字或任一段中文一樣
export function sameBrand(a: string, b: string): boolean {
  const first = (n: string) => (n.match(/[A-Za-z0-9]+/)?.[0] ?? '').toLowerCase();
  const zh = (n: string) => (n.match(/[一-鿿]{2,}/g) ?? []).filter((t) => t.length >= 2 && !/^(私密保養|私密清潔|生技|生醫|工作室|科技|設計|公司|品牌)$/.test(t));
  return (first(a).length >= 2 && first(a) === first(b)) || zh(a).some((x) => zh(b).includes(x));
}
