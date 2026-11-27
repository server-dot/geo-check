import { channelsOf, pickPrice, sameBrand, shopItems, type ChannelFact, type PriceFact } from './geo-rival-facts';
import { askJson, parseJson, type RecommendInput, type RecommendVisibility } from './geo-recommend-visibility';

// ── 競爭對手分析：市場定位圖 ───────────────────────────────
// 11-18 起用兩軸定位圖，不用被推幾次。11-25 小積木：Relove 被歸到低價、怕其他點也錯——逐點核對後整個換做法：
//   1. gpt-4.1 只挑同類同業、定出要比價的同類商品
//   2. 圖只畫程式算得出來的：同類單品每 100ml 單價、購物搜尋看得到的通路數
//   3. 其他面向（成分、適合誰、優缺點）用文字比較，見 geo-compare.ts
// 試過讓 AI 從原文選邊（台灣製／醫療路線…），逐點核對仍錯一成以上（「應先諮詢醫師」被當成醫療路線），整個拿掉。
// 服務業沒有容量可比，不畫圖。

export interface MapAxis {
  low: string; // 軸的 -2 端
  high: string; // 軸的 +2 端
  kind?: 'price' | 'channel';
}
// 每個軸的位置＋依據（右邊「你 vs 它」對照表用；沒查到是 null）
export interface DimScore {
  v: number;
  why: string;
  label?: string; // 放在哪一邊、或每 100ml 多少
  url?: string; // 原文出處
}
export interface MapPoint {
  name: string;
  dims?: (DimScore | null)[];
  x: number; // -2～2
  y: number;
  type: string;
  quote: string;
  url?: string;
}
export interface RivalMap {
  v?: number; // 3＝11-25 新做法；沒有這欄的舊圖不可信，不畫
  x: MapAxis;
  y: MapAxis;
  self: { x: number; y: number; why: string; url?: string; type?: string; dims?: (DimScore | null)[]; off?: boolean }; // off＝你自己的資料不足，不畫點
  points: MapPoint[];
  axes?: MapAxis[];
  missing?: string[]; // 查過但證據不夠、沒畫的業者
  product?: string; // 比價的商品
  topic?: string; // 類別字（私密清潔、n8n 自動化），問 AI 比較時用
  peers?: string[]; // 挑出來的同業，像你的排前面
}
export const RIVAL_MAP_VERSION = 3;

const MAX_POINTS = 10;
const AXIS_MODEL = 'openai/gpt-4.1';

const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ');

function keysOf(name: string): string[] {
  return [...(name.match(/[一-鿿]{2,}/g) ?? []), ...(name.match(/[A-Za-z][A-Za-z0-9.&'-]{2,}/g) ?? [])].map((k) => k.toLowerCase());
}

// AI 在推薦題回答裡講這家的那幾行，給模型認清是哪一家（同名的很多）
function describe(name: string, answers: string[]): string {
  const keys = keysOf(name);
  if (keys.length === 0) return '';
  const out: string[] = [];
  for (const a of answers) {
    const lines = a.split('\n');
    lines.forEach((line, i) => {
      if (!keys.some((k) => line.toLowerCase().includes(k))) return;
      out.push(line);
      if (line.replace(/[#*\-\d.\s|]/g, '').length <= 30) out.push(lines[i + 1] ?? '', lines[i + 2] ?? '');
    });
  }
  return clean([...new Set(out.filter(Boolean))].join(' ')).trim().slice(0, 200);
}

interface Plan { peers: number[]; topic: string; product: string; words: string[]; skip: string[] }

// 11-18 小積木：「怎麼都是大公司，這很諷刺，因為我就是競品分析」——請模型從 AI 推過的全部業者裡，挑規模和服務最像你的。
async function makePlan(brandName: string, self: string, all: { name: string; text: string }[], apiKey: string): Promise<Plan | null> {
  const prompt = `我們要替「${brandName}」畫市場定位圖，只放查得到證據的位置。請做兩件事：
1. 從「AI 推薦過的業者」挑最多 ${MAX_POINTS} 家規模和內容最像${brandName}、客人會拿來比的同類業者。大公司、平台、只有人名的不要挑。
2. 這些業者如果都賣有容量的消費品（保養、清潔、食品），指定一種大家都有賣的主力商品來比價；服務業、家具、軟體等沒有容量可比的，product 給空字串。

「${brandName}」官網介紹：
${self}

AI 推薦過的業者：
${all.map((r, i) => `[${i}] ${r.name}${r.text ? `：${r.text.slice(0, 80)}` : ''}`).join('\n')}

topic：搜尋這些業者時加的類別字，6 字內（例如「私密清潔」「n8n 自動化」）。
product：比價的商品類別，8 字內（例如「私密清潔凝露」）。words：這種商品標題會出現的字 3～8 個（例如 凝露、潔淨露、潔膚露、慕斯、沐浴露）。skip：標題有就代表不是同一種或不同用途的字（例如清潔類要排除擦的保養：緊實、美白凝露、精華；也排除 噴霧、濕紙巾、美白凝膠、男、洗衣、手洗精、除毛）。

只回傳 JSON：{"peers":[編號],"topic":"","product":"","words":[""],"skip":[""]}`;
  try {
    const p = parseJson<{ peers?: unknown[]; topic?: unknown; product?: unknown; words?: unknown[]; skip?: unknown[] }>(await askJson(prompt, apiKey, 900, AXIS_MODEL));
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const peers = [...new Set((p?.peers ?? []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < all.length))].slice(0, MAX_POINTS);
    const list = (v?: unknown[]) => (v ?? []).map(str).filter((x) => x.length >= 1).slice(0, 12);
    return peers.length >= 2 ? { peers, topic: str(p?.topic).slice(0, 12), product: str(p?.product).slice(0, 14), words: list(p?.words), skip: list(p?.skip) } : null;
  } catch {
    return null;
  }
}

export async function buildRivalMap(
  rv: Pick<RecommendVisibility, 'brandName' | 'questions' | 'names'>,
  input: Pick<RecommendInput, 'title' | 'description' | 'services'>,
  origin: string,
  apiKey: string,
): Promise<RivalMap | null> {
  const answers = rv.questions.flatMap((q) => q.results.map((r) => r.answer ?? ''));
  const all = rv.names
    .filter((n) => !n.isSelf && n.kind !== 'channel')
    .slice(0, 60)
    .map((n) => ({ name: n.name, text: describe(n.name, answers) }));
  if (all.length < 3 || !process.env.SERPER_API_KEY) return null;

  const self = [input.title, input.description, input.services?.slice(0, 600)].filter(Boolean).join('\n').slice(0, 900);
  const plan = await makePlan(rv.brandName, self, all, apiKey);
  if (!plan) return null;
  const me = rv.brandName.split(/[｜|]/)[0].trim().slice(0, 24);
  const names = [me, ...plan.peers.map((i) => all[i].name).filter((n, i, l) => !sameBrand(n, me) && l.findIndex((x) => sameBrand(x, n)) === i)];

  const shops = plan.product && plan.words.length > 0 ? await Promise.all(names.map((n) => shopItems(n, plan.product))) : names.map(() => []);

  const prices = names.map((n, i) => pickPrice(shops[i], n, plan.words, plan.skip, plan.product.slice(0, 2)));
  const priced = prices.filter((p): p is PriceFact => !!p);
  const usePrice = !!prices[0] && priced.length >= 4;
  const logs = priced.map((p) => Math.log(p.per));
  const [lo, hi] = [Math.min(...logs), Math.max(...logs)];
  const priceDim = (p: PriceFact | null): DimScore | null =>
    p ? { v: hi > lo ? -1.8 + (3.6 * (Math.log(p.per) - lo)) / (hi - lo) : 0, label: `每 ${p.unit} 約 ${p.per} 元`, why: `${p.price.toLocaleString()} 元／${p.size}ml，${p.source}${p.n > 1 ? `（${p.n} 筆取中間值）` : ''}` } : null;

  // 通路：購物搜尋實際看得到幾個（有容量可比的消費品才有）
  const channels = names.map((n, i) => channelsOf(shops[i], n));
  const withCh = channels.filter((c): c is ChannelFact => !!c);
  const useChannel = usePrice && !!channels[0] && withCh.length >= 4;
  const cs = withCh.map((c) => c.n);
  const [c0, c1] = [Math.min(...cs), Math.max(...cs)];
  const channelDim = (c: ChannelFact | null): DimScore | null => (c ? { v: c1 > c0 ? -1.8 + (3.6 * (c.n - c0)) / (c1 - c0) : 0, label: `${c.n} 個通路`, why: c.names.slice(0, 5).join('、') + (c.n > 5 ? '…' : '') } : null);

  const x: MapAxis = { low: '單價低', high: '單價高', kind: 'price' };
  const y: MapAxis = { low: '通路少', high: '通路多', kind: 'channel' };
  const dims = names.map((_, i) => [usePrice ? priceDim(prices[i]) : null, useChannel ? channelDim(channels[i]) : null]);
  const ok = usePrice && useChannel && !!dims[0][0] && !!dims[0][1];
  const on = ok ? names.map((_, i) => i).slice(1).filter((r) => dims[r][0] && dims[r][1]) : [];
  return {
    v: RIVAL_MAP_VERSION,
    x,
    y,
    self: { x: dims[0][0]?.v ?? 0, y: dims[0][1]?.v ?? 0, why: '', dims: dims[0], off: !ok },
    points: on.map((r) => ({ name: names[r], x: dims[r][0]!.v, y: dims[r][1]!.v, type: '', quote: '', dims: dims[r] })),
    axes: [x, y],
    missing: names.slice(1).filter((_, i) => !on.includes(i + 1)),
    ...(usePrice ? { product: plan.product } : {}),
    topic: plan.topic,
    peers: names.slice(1),
  };
}
