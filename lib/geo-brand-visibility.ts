// ── GEO：品牌能見度即時查詢 ─────────────────────────────
// 前面的檢測都是「AI 讀不讀得到你的網站」（技術可達性），這裡回答的是更直接的問題：
// 「AI 真的知道你是誰嗎？」——拿偵測到的品牌名稱，實際去問 Perplexity（走 OpenRouter），
// 看它答不答得出來、回答時引用的來源是不是你自己的網站。
//
// 用 Perplexity Sonar 而不是隨便找個模型加 web search 外掛：Sonar 本來就是即時網頁
// 搜尋＋引用來源的模型，不是硬湊出來的模擬，回應裡的 citation 是真的搜尋結果。
//
// 老實講的限制：這只代表 Perplexity 這一個引擎當下的回答，不是「所有 AI 都這樣」；
// 沒設 API key、抓不到品牌名稱、或呼叫失敗時一律回 null，不硬湊一個答案出來。

export interface BrandVisibilityResult {
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

async function askSonar(query: string, apiKey: string): Promise<{ content: string; citations: UrlCitation[] }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://geo-check.app',
      'X-Title': 'GEO Check Brand Visibility',
    },
    body: JSON.stringify({
      model: 'perplexity/sonar',
      messages: [{ role: 'user', content: query }],
      max_tokens: 500,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
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

export async function checkBrandVisibility(title: string, origin: string): Promise<BrandVisibilityResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const brandName = guessBrandName(title);
  if (!apiKey || !brandName) return null;

  const domain = hostnameOf(origin);
  const query = `「${brandName}」是做什麼的？請簡短介紹，如果知道的話請說明它的官方網站。`;

  let content: string;
  let rawCitations: UrlCitation[];
  try {
    const r = await askSonar(query, apiKey);
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
    ? 'Perplexity 回答時直接引用了你自己的網站，代表 AI 找得到你、也願意拿你的內容當答案來源。'
    : mentionsBrand
      ? 'Perplexity 認得這個名字，但回答時引用的是別的網站，不是你自己的——內容可能是從別處轉述來的，不是第一手引用你。'
      : 'Perplexity 沒有把這次搜尋跟你的品牌連在一起，代表你目前不在它找得到的範圍內。';

  return { brandName, query, answer: content, citedSelf, citations, advice };
}
