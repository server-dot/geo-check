import type { SchemaTypeCard } from './geo-schema-check';

// ── GEO 深度健檢：Schema 缺欄位補完建議 ──────────────────
// 「結構化資料」專區只做到「缺什麼」，這裡再往前一步：拿缺欄位所在那一頁的
// 內文（已經爬過、不用再打一次網站），問 AI「這頁內文裡有沒有寫到這個資訊」，
// 找得到才給建議值，找不到就老實說沒有——不用網路知識瞎猜、不杜撰。
// 跟 geo-audit-ai.ts 同一套紀律：只根據提供的內文判斷，這是先前 E-E-A-T
// 判斷踩過的坑（AI 曾經把 prompt 範例整段照抄回來當結果）。
//
// 只對已經有逐欄位規則（LocalBusiness／Product／Article 家族）的型別做，
// 而且只在真的有缺欄位時才呼叫——最多幾次呼叫，跟 E-E-A-T／品牌能見度同一個
// 免費全開的成本模型，不是每次健檢都燒好幾十次 API。

const MODEL = 'openai/gpt-4.1-mini';

// 「找值」跟「寫值」是兩種不同任務，不能用同一句指令交代過去：地址、電話這類事實型
// 欄位，AI 該做的是「照抄內文裡的原始資訊」；但「簡介」這種敘述型欄位如果也叫 AI
// 照抄，抓到的會是一整段行銷文案（例如「積木行銷SEO 最專業SEO媒體行銷團隊 以策略
// 規劃、專業執行...」），塞進 schema 的 description 完全不能用——太長、離題、不是
// 一句話介紹。小積木反饋這種「照抄」建議「有屁用嗎」，所以敘述型欄位改成要求 AI
// 自己統整寫成 1～2 句精簡介紹，不是原文照搬。
const COMPOSE_FIELDS = new Set(['簡介']);

// 這幾個欄位的值本質是網址（例如 sameAs 要真的社群/外部連結網址），但這裡餵給 AI 的
// pageText 是純文字內文（<a href> 屬性早就在爬蟲那層被拿掉了），純文字裡幾乎不可能
// 找到真正可用的網址——硬要 AI 從純文字裡「找」網址，最後只會生出編造的網址。與其
// 冒杜撰的風險，這種欄位直接不問 AI。
const SKIP_FIELDS = new Set(['社群/外部連結']);

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://geo-check.app',
      'X-Title': 'GEO Check Schema Completion',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildPrompt(type: string, missing: string[], pageText: string): string {
  const factFields = missing.filter((l) => !COMPOSE_FIELDS.has(l));
  const composeFields = missing.filter((l) => COMPOSE_FIELDS.has(l));

  const instructions: string[] = [];
  if (factFields.length > 0) {
    instructions.push(
      `以下欄位是「事實型」，只能照內文原文填：${factFields.join('、')}——內文有寫就抓出真正的值（例如電話就只填號碼，不要整句照搬），內文裡真的找不到對應資訊就填 null，不可以用你自己的知識瞎猜、不可以杜撰。`,
    );
  }
  if (composeFields.length > 0) {
    instructions.push(
      `以下欄位要你根據內文「統整改寫」成 1～2 句精簡的中文介紹，不是照抄整段原文：${composeFields.join('、')}——如果內文完全沒有任何可以歸納的相關資訊，才填 null。`,
    );
  }

  return `你是資深 SEO／GEO 技術顧問，正在幫網站補完結構化資料（JSON-LD，型別：${type}）欠缺的欄位。

【目前缺少的欄位】${missing.join('、')}

【這個頁面的內文】
${pageText || '（抓不到內文）'}

請「只」根據上面【這個頁面的內文】判斷。${instructions.join('\n')}

只回傳 JSON，key 是欄位名稱（要跟上面「目前缺少的欄位」完全一樣），value 是字串或 null，不要有其他文字：
{${missing.map((l) => `"${l}": "<值或 null>"`).join(', ')}}`;
}

function parseSuggestions(text: string, missing: string[]): Record<string, string> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const out: Record<string, string> = {};
  for (const label of missing) {
    const v = (parsed as Record<string, unknown>)[label];
    if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null') {
      out[label] = v.trim();
    }
  }
  return out;
}

async function suggestMissingFields(
  type: string,
  missing: string[],
  pageText: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const text = await askOpenRouter(buildPrompt(type, missing, pageText), apiKey);
  return parseSuggestions(text, missing);
}

// 幫每張有缺欄位的卡片補上 AI 從頁面內文找到的建議值。沒設 API key、找不到頁面內文、
// 呼叫失敗，都直接跳過那張卡片——這是加分功能，不能因為它失敗就拖垮整個健檢結果。
export async function enrichSchemaCards(
  cards: SchemaTypeCard[],
  pages: { url: string; mainText: string }[],
): Promise<SchemaTypeCard[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return cards;

  const textByUrl = new Map(pages.map((p) => [p.url, p.mainText]));

  return Promise.all(
    cards.map(async (card) => {
      const missing = card.fields.filter((f) => !f.present && !SKIP_FIELDS.has(f.label)).map((f) => f.label);
      if (missing.length === 0) return card;
      const pageText = textByUrl.get(card.sampleUrl) ?? '';
      if (!pageText.trim()) return card;

      let suggestions: Record<string, string>;
      try {
        suggestions = await suggestMissingFields(card.type, missing, pageText, apiKey);
      } catch {
        return card;
      }
      if (Object.keys(suggestions).length === 0) return card;

      return {
        ...card,
        fields: card.fields.map((f) => (!f.present && suggestions[f.label] ? { ...f, suggestedValue: suggestions[f.label] } : f)),
      };
    }),
  );
}
