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
  advice: string;
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
  if (!title) problems.push('沒有 # 標題');
  if (!summary) problems.push('沒有 > 摘要引言');
  if (links.length < THIN_LINKS) problems.push(`只列了 ${links.length} 個重要頁面連結`);

  if (charCount < THIN_CHARS || links.length === 0) {
    return {
      status: 'thin',
      title,
      summary,
      links,
      charCount,
      advice: `內容太單薄（${charCount} 字、${links.length} 個連結），AI 幾乎讀不到有用的網站導覽，建議照 llmstxt.org 的格式補上標題、摘要與重要頁面連結。`,
    };
  }
  if (problems.length > 0) {
    return {
      status: 'thin',
      title,
      summary,
      links,
      charCount,
      advice: `格式不完整：${problems.join('、')}，建議補齊 llmstxt.org 建議的標準格式。`,
    };
  }

  // 格式該有的都有，但連結有沒有附說明是另一個品質分水嶺——只有 URL 跟標題，
  // AI 還是得自己猜這個連結在講什麼；附一句說明才是真的幫上忙。
  const advice =
    described === links.length
      ? `格式完整，${links.length} 個連結都附有說明，AI 不用自己猜每個連結在講什麼，能準確判斷該引導使用者去哪一頁。`
      : `格式完整（標題、摘要、${links.length} 個重要頁面連結都有），但只有 ${described}/${links.length} 個連結附加說明——沒說明的連結 AI 只能靠標題猜內容，建議每個連結補一句話講清楚那頁在講什麼。`;

  return { status: 'ok', title, summary, links, charCount, advice };
}
