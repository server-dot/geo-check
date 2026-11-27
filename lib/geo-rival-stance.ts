import { ownerOf } from './geo-compare';
import { brandTokens } from './geo-rival-facts';
import { askJson, parseJson } from './geo-recommend-visibility';
import type { DimScore, RivalMap } from './geo-rival-map';

// ── 競爭對手分析的縱軸：品牌整體定位（日常溫和清潔 ↔ 進階保養機能 這種），分數由程式算 ──────────
// 11-27 試過叫 AI 直接打 0～100 分：同一題問兩次，賽吉兒 69 → 30 分。兩次講的事實一樣（乳酸、鼠尾草、加強型、
// 特殊時期款），差在「加強型算不算機能」和分數高低標準每次不同（ChatGPT 兩次都說 Relove「明顯偏進階保養」，給 78、60）。
// 小積木：「改成程式算分數」→
//   1. 建圖時請 AI 定一組軸＋偏 high 端的具體訴求清單（每項附同義詞），存在圖裡，之後重算都用同一份
//   2. 每家 AI 的回答請 gpt-4.1 只判斷「原文有沒有說這家有這一項」並照抄原句；程式核對原句在原文、講的是這一家、
//      句子裡真的有這一項的字。只用找字的話，「淨味、嫩白等進階訴求較少」「若期待美白會覺得樸素」都會被算成有（11-27 施巴 86 分）
//   3. 分數＝有的項數 ÷ 清單項數 × 100；每一項都留原文出處
// 不加權：沒有依據說哪家 AI 比較準。

export interface StanceFeature { tag: string; words: string[] }
export interface StanceAxis { low: string; high: string; features?: StanceFeature[] }
export type StanceStatus = 'mixed' | 'one' | 'none';

const ENGINE = (e: string) => (e.startsWith('ChatGPT') ? 'ChatGPT' : e.startsWith('Google') ? 'Google' : e.split(/[（(]/)[0].trim());
const lower = (s: string) => s.toLowerCase().replace(/[\s'’.&·・-]/g, '');
const mentions = (text: string, brand: string) => brandTokens(brand).some((k) => lower(text).includes(k));
const clean = (s: string) => s.replace(/\*\*|__|`|\[\d+\]/g, '').replace(/\s+/g, ' ').trim();

function excerpt(answers: string[], brands: string[], limit: number): string {
  const out: string[] = [];
  for (const a of answers) {
    const lines = a.split('\n');
    lines.forEach((line, i) => {
      if (brands.some((b) => mentions(line, b))) out.push(line, lines[i + 1] ?? '');
    });
  }
  return [...new Set(out.map((l) => l.trim()).filter(Boolean))].join('\n').slice(0, limit);
}

// 從 AI 推薦題的原文挑一組定位軸，和偏 high 端的具體訴求清單
export async function pickStanceAxis(topic: string, brands: string[], texts: { engine: string; answer: string }[], apiKey: string): Promise<StanceAxis | null> {
  const byEngine = new Map<string, string[]>();
  for (const t of texts) if (t.answer) byEngine.set(ENGINE(t.engine), [...(byEngine.get(ENGINE(t.engine)) ?? []), t.answer]);
  const sample = [...byEngine].map(([e, a]) => `【${e}】\n${excerpt(a, brands, 3000)}`).join('\n\n');
  if (!sample.trim()) return null;
  const prompt = `下面是幾家 AI 描述「${topic}」品牌的原文。請做兩件事：
1. 挑一組最能把這些品牌分成兩邊的「品牌整體定位」軸。不能是價格、通路、知名度、評價好壞、規模；要是客人選品牌時在意的路線差異（例如：日常溫和清潔 ↔ 進階保養機能）。兩端各 2～6 個字，白話。
2. 列出 6～12 項會讓品牌偏向 high 端的「具體」訴求、成分或產品線（例如：益生元、美白亮白、特殊時期款）。每項附 2～6 個原文裡會出現的寫法（同義詞、成分名），用來在原文裡找字。不要列 low 端本來就有的東西（例如清潔類的弱酸性、乳酸、蘆薈、洋甘菊這種基本溫和成分）、劑型（凝露、慕斯），也不要列「保養」「機能」這種太籠統的字。

品牌：${brands.join('、')}

原文：
${sample}

只回傳 JSON：{"low":"","high":"","features":[{"tag":"","words":[""]}]}`;
  const p = parseJson<{ low?: unknown; high?: unknown; features?: { tag?: unknown; words?: unknown[] }[] }>(await askJson(prompt, apiKey, 900, 'openai/gpt-4.1').catch(() => ''));
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const low = str(p?.low, 8);
  const high = str(p?.high, 8);
  const features = (p?.features ?? [])
    .map((f) => ({ tag: str(f.tag, 8), words: [...new Set([str(f.tag, 8), ...(f.words ?? []).map((w) => str(w, 10))].filter((w) => w.length >= 2))] }))
    .filter((f) => f.tag && f.words.length > 0)
    .slice(0, 12);
  return low && high && features.length >= 4 ? { low, high, features } : null;
}

export interface StanceHit { brand: string; tag: string; engine: string; quote: string }

// 某一家在這些回答裡的段落：提到它的行＋下面兩行；表格欄標題有它就整張表都給（品牌在欄、不在列的表格）
function excerptFor(answers: string[], brand: string, limit: number): string {
  const out: string[] = [];
  for (const a of answers) {
    const lines = a.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('|') && (i === 0 || !lines[i - 1].trim().startsWith('|')) && mentions(line, brand)) {
        let j = i;
        while (j < lines.length && lines[j].trim().startsWith('|')) out.push(lines[j++]);
        i = j - 1;
        continue;
      }
      if (mentions(line, brand)) out.push(line, lines[i + 1] ?? '', lines[i + 2] ?? '');
    }
  }
  return [...new Set(out.map((l) => l.trim()).filter(Boolean))].join('\n').slice(0, limit);
}

// 這家 AI 的回答裡，這一個品牌「有」哪幾項（附原句，核對過）。11-27 七家塞同一題會漏（Relove 的紅柿、蔓越莓萃取沒算到），改成一家一題
async function hitsFrom(engine: string, answers: string[], brand: string, brands: string[], feats: StanceFeature[], apiKey: string): Promise<StanceHit[]> {
  const text = excerptFor(answers, brand, 6000);
  if (!text) return [];
  const prompt = `下面是 ${engine} 回答裡講到「${brand}」的原文（可能也提到別家）。請逐項判斷原文有沒有明確說「${brand}」有這一項，有的話照抄那句原文。

項目：
${feats.map((f) => `- ${f.tag}（${f.words.slice(1).join('、')}）`).join('\n')}

規則：
- 只有原文明確說「${brand}」有這一項（成分、訴求或產品）才列；表格裡「${brand}」那一列或那一欄寫的也算。
- 說「較少、沒有、不強調、不含」、「若期待…會覺得樸素」、「不要選…」的是沒有，不要列。講別家的不要列。
- quote 從原文照抄 4～60 字、一字不差，句子裡看得到這一項。

原文：
${text}

只回傳 JSON：{"rows":[{"tag":"照抄上面的項目","quote":"…"}]}`;
  const p = parseJson<{ rows?: { tag?: unknown; quote?: unknown }[] }>(await askJson(prompt, apiKey, 1200, 'openai/gpt-4.1').catch((e) => {
    if (process.env.RIVAL_DEBUG) console.log('HIT FAIL', engine, brand, String(e).slice(0, 200));
    return '';
  }));
  if (process.env.RIVAL_DEBUG) console.log('HIT RAW', engine, brand, JSON.stringify(p).slice(0, 400));
  const out: StanceHit[] = [];
  for (const r of p?.rows ?? []) {
    // 模型常把括號裡的同義詞一起抄回來：「益生元/發酵物（益生元、…）」
    const tag = typeof r.tag === 'string' ? r.tag.split(/[（(]/)[0].trim() : '';
    const f = feats.find((x) => x.tag === tag);
    const quote = typeof r.quote === 'string' ? clean(r.quote) : '';
    if (!f || quote.length < 2 || out.some((o) => o.tag === f.tag)) continue;
    const src = answers.find((a) => bareish(a).includes(bareish(quote)));
    const owner = src ? ownerOf(src, quote, brands) : null;
    const word = f.words.some((w) => quote.includes(w) && !negated(quote, w));
    if (!src || owner?.length !== 1 || owner[0] !== brand || !word) {
      if (process.env.RIVAL_DEBUG) console.log('HIT DROP', engine, brand, f.tag, quote.slice(0, 40), !!src, owner, word);
      continue;
    }
    out.push({ brand, tag: f.tag, engine, quote });
  }
  return out;
}
// 同一個子句裡（不跨，。；）找到的字前後有否定詞＝在說沒有：「淨味、抗菌、嫩白、益生元等進階訴求較少」
const NEG = /較少|很少|少有|沒有|不含|不強調|不特別|沒興趣|不是主要|並非|未見|不以/;
function negated(text: string, w: string): boolean {
  for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + w.length)) {
    const from = Math.max(text.lastIndexOf('，', i), text.lastIndexOf('。', i), text.lastIndexOf('；', i), text.lastIndexOf(',', i)) + 1;
    const ends = [text.indexOf('，', i), text.indexOf('。', i), text.indexOf('；', i), text.indexOf(',', i)].filter((x) => x >= 0);
    const to = ends.length ? Math.min(...ends) : text.length;
    if (!NEG.test(text.slice(from, to))) return false;
  }
  return true;
}
const bareish = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

// 各家 AI 的回答 → 每家有哪幾項。花錢的步驟（每家 AI 一次 gpt-4.1），結果存進圖裡，畫面只用存好的
export async function findStanceHits(map: RivalMap, texts: { engine: string; answer: string }[], apiKey: string): Promise<StanceHit[] | null> {
  const feats = map.stanceAxis?.features;
  if (!feats?.length || !map.stanceSelf) return null;
  const names = [map.stanceSelf, ...(map.allPoints ?? map.points).map((p) => p.name)];
  const byEngine = new Map<string, string[]>();
  for (const t of texts) if (t.answer) byEngine.set(ENGINE(t.engine), [...(byEngine.get(ENGINE(t.engine)) ?? []), t.answer]);
  return (await Promise.all([...byEngine].flatMap(([e, a]) => names.map((n) => hitsFrom(e, a, n, names, feats, apiKey))))).flat();
}

// 程式算分數，放上定位圖（縱軸換成定位）
export function applyStance(map: RivalMap, hits: StanceHit[] | null): RivalMap {
  const feats = map.stanceAxis?.features;
  if (!feats?.length || !hits) return map;
  const base = map.allPoints ?? map.points;
  const self = map.stanceSelf ?? '';
  const judge = (name: string): { dim: DimScore | null; status?: StanceStatus } => {
    const mine = hits.filter((h) => h.brand === name);
    const found = feats.flatMap((f) => {
      const h = mine.find((x) => x.tag === f.tag);
      return h ? [{ tag: f.tag, line: `${f.tag}｜${h.engine}「${h.quote}」` }] : [];
    });
    const score = Math.round((found.length / feats.length) * 100);
    const miss = feats.filter((f) => !found.some((x) => x.tag === f.tag)).map((f) => f.tag);
    return {
      dim: { v: ((score - 50) / 50) * 1.8, label: `${score} 分`, why: [`有 ${found.length}／${feats.length} 項${miss.length ? `（沒講到：${miss.join('、')}）` : ''}`, ...found.map((x) => x.line)].join('\n') },
    };
  };
  const me = judge(self);
  const all = base.map((p) => ({ p, j: judge(p.name) }));
  const on = all.filter((x) => x.j.dim);
  if (!me.dim || on.length < 2 || hits.length === 0) return map;
  const axis = { low: map.stanceAxis!.low, high: map.stanceAxis!.high, kind: 'stance' as const };
  const withStance = (dims: (DimScore | null)[] | undefined, d: DimScore | null) => [dims?.[0] ?? null, dims?.[1] ?? null, d];
  return {
    ...map,
    y: axis,
    axes: [map.x, { low: '通路少', high: '通路多', kind: 'channel' }, axis],
    self: { ...map.self, y: me.dim.v, dims: withStance(map.self.dims, me.dim) },
    points: on.map(({ p, j }) => ({ ...p, y: j.dim!.v, dims: withStance(p.dims, j.dim) })),
    allPoints: base,
    unsure: all.filter((x) => !x.j.dim).map(({ p, j }) => ({ name: p.name, status: j.status!, quotes: [] })),
    selfUnsure: undefined,
  };
}
