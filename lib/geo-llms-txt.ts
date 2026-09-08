// ── GEO：llms.txt 品質判斷 ────────────────────────────
// 純函式，吃 llms.txt 原始文字，不只判斷「有沒有」，還判斷「寫得好不好」。
// 不碰網路，方便單獨測試。
//
// llmstxt.org 的建議格式：# 標題 + > 摘要引言 + 用 markdown 連結列出重要頁面，
// 每個連結最好還附一句說明（- [標題](url): 說明）。
// 只給「有幾個連結」這種數字沒有參考價值——使用者沒辦法判斷那些連結
// 是不是真的重要、有沒有寫說明，所以這裡把實際解析出來的標題、摘要、
// 連結清單都帶出去，讓人看得到底稿，不是只信一個分數。

export type LlmsTxtStatus = 'thin' | 'ok';

export interface LlmsTxtLink {
  text: string;
  url: string;
  description: string; // 連結後面冒號接的說明，沒有就是空字串
}

export interface LlmsTxtQuality {
  status: LlmsTxtStatus;
  title: string;
  summary: string;
  links: LlmsTxtLink[];
  charCount: number;
  advice: string;    // 白話：現況＋這對你的影響
  technical?: string; // 格式細節（llmstxt.org 的段落規格），收在技術細節區
}

const THIN_CHARS = 100;
const THIN_LINKS = 2;

function charLen(s: string): number {
  return [...s.trim()].length;
}

// 逐行解析 markdown 連結，順手把同一行冒號後面的說明文字也抓出來
// （llmstxt.org 格式：- [標題](url): 說明），沒有說明就留空。
function extractLinks(text: string): LlmsTxtLink[] {
  const links: LlmsTxtLink[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\[([^\]]+)\]\(([^)]+)\)\s*:?\s*(.*)$/);
    if (m) links.push({ text: m[1].trim(), url: m[2].trim(), description: m[3].trim() });
  }
  return links;
}

export function analyzeLlmsTxt(text: string): LlmsTxtQuality {
  const titleMatch = text.match(/^#\s+(\S.*)$/m);
  const summaryMatch = text.match(/^>\s*(\S.*)$/m);
  const title = titleMatch?.[1]?.trim() ?? '';
  const summary = summaryMatch?.[1]?.trim() ?? '';
  const links = extractLinks(text);
  const charCount = charLen(text);
  const described = links.filter((l) => l.description).length;

  const problems: string[] = [];
  if (!title) problems.push('沒有標題');
  if (!summary) problems.push('沒有開頭摘要');
  if (links.length < THIN_LINKS) problems.push(`只列了 ${links.length} 個重要頁面連結`);

  if (charCount < THIN_CHARS || links.length === 0) {
    return {
      status: 'thin',
      title,
      summary,
      links,
      charCount,
      advice: `你有放 llms.txt，但裡面幾乎是空的（${charCount} 字、${links.length} 個連結）。AI 抓到這份檔案時讀不出你有什麼重點內容，等於白放。`,
      technical: 'llmstxt.org 的標準格式是「# 標題」＋「> 摘要引言」＋逐條 markdown 連結（- [標題](網址): 說明）。',
    };
  }
  if (problems.length > 0) {
    return {
      status: 'thin',
      title,
      summary,
      links,
      charCount,
      advice: `你有放 llms.txt，但少了 AI 會優先讀的段落：${problems.join('、')}。缺這幾段，AI 讀完還是不知道該從哪一頁認識你。`,
      technical: 'llmstxt.org 的標準格式是「# 標題」＋「> 摘要引言」＋逐條 markdown 連結（- [標題](網址): 說明）。',
    };
  }

  // 格式該有的都有，但連結有沒有附說明是另一個品質分水嶺——只有 URL 跟標題，
  // AI 還是得自己猜這個連結在講什麼；附一句說明才是真的幫上忙。
  const advice =
    described === links.length
      ? `寫得完整，${links.length} 個連結都附了說明，AI 不用自己猜每個連結在講什麼，能準確判斷該把人帶去哪一頁。`
      : `該有的段落都有，但 ${links.length} 個連結裡只有 ${described} 個附了說明。沒說明的那幾個，AI 只能從標題猜內容，猜錯就會把人帶到不對的頁面。`;

  return {
    status: 'ok',
    title,
    summary,
    links,
    charCount,
    advice,
    technical: `標題、摘要引言、${links.length} 個 markdown 連結齊備，符合 llmstxt.org 格式；連結說明 ${described}/${links.length}。`,
  };
}
