// ── GEO：品牌能見度即時查詢 ─────────────────────────────
// 前面的檢測都是「AI 讀不讀得到你的網站」（技術可達性），這裡回答的是更直接的問題：
// 「AI 真的知道你是誰嗎？」——拿偵測到的品牌名稱，實際去問會即時上網搜尋的 AI 模型
// （都走 OpenRouter），看它答不答得出來、回答時引用的來源是不是你自己的網站。
//
// 多引擎並列而不是只問一家：同一個品牌，Perplexity 找得到不代表 ChatGPT 也找得到，
// 兩者背後的索引、排序邏輯完全不同——只測一家會讓使用者誤以為「AI」是單一個東西。
//
// 老實講的限制：這只代表這幾個引擎當下的回答，不是「所有 AI 都這樣」；
// 沒設 API key、抓不到品牌名稱、或呼叫失敗時該引擎回 null，不硬湊一個答案出來。

export interface BrandVisibilityResult {
  engine: string; // 給人看的引擎名稱，例如「Perplexity」「ChatGPT（GPT-4o 搜尋）」
  brandName: string;
  query: string;
  answer: string;
  citedSelf: boolean;
  citations: { url: string; title: string; isSelf: boolean }[];
  advice: string;
}

interface UrlCitation {
  type?: string;
  url_citation?: { url?: string; title?: string };
}

// 目前接的兩個即時網頁搜尋模型，都用 OpenRouter 標準化過的 annotations 格式回傳引用來源，
// 所以可以共用同一套解析邏輯。Gemini 的 Google Search grounding 用的是不同的回應格式
// （tools/groundingMetadata，不是 annotations），之後要加得另外處理，先不硬湊。
//
// ChatGPT 這條原本接的是 openai/gpt-4o-search-preview，但 OpenAI 已經棄用這個模型
// （OpenRouter 型錄還留著，實際呼叫會 404）。改用通用的 `:online` web search 外掛
// 掛在 gpt-4o 上，回應格式跟原生 search-preview 一樣是標準化的 annotations，親測可用。
const ENGINES: { engine: string; model: string }[] = [
  { engine: 'Perplexity', model: 'perplexity/sonar' },
  { engine: 'ChatGPT（GPT-4o＋即時搜尋）', model: 'openai/gpt-4o:online' },
];

async function askModel(model: string, query: string, apiKey: string): Promise<{ content: string; citations: UrlCitation[] }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://geo-check.app',
      'X-Title': 'GEO Check Brand Visibility',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
      max_tokens: 500,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤（${model}）：${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string; annotations?: UrlCitation[] } }[];
  };
  const msg = data.choices?.[0]?.message ?? {};
  return { content: msg.content ?? '', citations: msg.annotations ?? [] };
}

// 從頁面標題猜一個能拿去問 AI 的品牌名稱：中文站標題常見「品牌｜賣點｜賣點」這種疊法，
// 取第一段最接近真實品牌名稱；標題本身沒有分隔符就整段用（截斷避免整句拿去問）。
export function guessBrandName(title: string): string {
  const first = title.split(/[|｜\-–—:：]/)[0]?.trim() ?? '';
  return (first || title.trim()).slice(0, 30);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function checkOne(
  engine: string,
  model: string,
  brandName: string,
  query: string,
  domain: string,
  apiKey: string,
): Promise<BrandVisibilityResult | null> {
  let content: string;
  let rawCitations: UrlCitation[];
  try {
    const r = await askModel(model, query, apiKey);
    content = r.content;
    rawCitations = r.citations;
  } catch {
    return null;
  }
  if (!content) return null;

  const citations = rawCitations
    .filter((c): c is Required<UrlCitation> => c.type === 'url_citation' && !!c.url_citation?.url)
    .map((c) => ({
      url: c.url_citation.url!,
      title: c.url_citation.title || c.url_citation.url!,
      isSelf: hostnameOf(c.url_citation.url!) === domain,
    }));

  const citedSelf = citations.some((c) => c.isSelf);
  const mentionsBrand = content.includes(brandName);

  const advice = citedSelf
    ? `${engine} 回答時直接引用了你自己的網站，代表它找得到你、也願意拿你的內容當答案來源。`
    : mentionsBrand
      ? `${engine} 認得這個名字，但回答時引用的是別的網站，不是你自己的——內容可能是從別處轉述來的，不是第一手引用你。`
      : `${engine} 沒有把這次搜尋跟你的品牌連在一起，代表你目前不在它找得到的範圍內。`;

  return { engine, brandName, query, answer: content, citedSelf, citations, advice };
}

// 對每個接好的引擎並行查詢同一個品牌，個別失敗不影響其他引擎——
// 一家 API 掛了，使用者還是看得到另一家的結果，不會整組開天窗。
export async function checkBrandVisibility(title: string, origin: string): Promise<BrandVisibilityResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const brandName = guessBrandName(title);
  if (!apiKey || !brandName) return [];

  const domain = hostnameOf(origin);
  const query = `「${brandName}」是做什麼的？請簡短介紹，如果知道的話請說明它的官方網站。`;

  const results = await Promise.all(
    ENGINES.map((e) => checkOne(e.engine, e.model, brandName, query, domain, apiKey)),
  );
  return results.filter((r): r is BrandVisibilityResult => r !== null);
}
