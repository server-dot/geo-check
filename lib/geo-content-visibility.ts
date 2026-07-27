import { parse } from 'node-html-parser';

// ── GEO：AI 眼中的頁面內容 ──────────────────────────────
// 純函式，吃首頁的原始 HTML 字串，抽出「AI 爬蟲實際讀得到什麼」。
// 不碰網路，方便單獨測試。
//
// 為什麼需要這一層：robots.txt 允許 ≠ AI 讀得到你的內容。
// 主流 AI 爬蟲抓的是伺服器回的原始 HTML，**不執行 JavaScript**。
// 一個 robots.txt 完全開放的純前端渲染（CSR）網站，AI 看到的只是空的
// <div id="root"></div>——robots.txt 檢測會給滿分綠燈，實際上 AI 什麼都讀不到。
// 這裡的解析刻意也不執行 JS，所以抽出來的就是 AI 眼中的版本。

export type VisibilityStatus = 'ok' | 'thin' | 'empty';

export interface ContentVisibility {
  status: VisibilityStatus;
  textLength: number;    // AI 讀得到的純文字字數
  htmlLength: number;    // 原始 HTML 長度（對比用）
  scriptCount: number;   // <script> 數量：文字少但腳本多，就是典型 CSR 空殼
  preview: string;       // 實際抽出的純文字開頭，直接給使用者看
  title: string;
  description: string;
  h1: string[];
  jsonLdTypes: string[]; // 結構化資料型別，AI 理解頁面的重要線索
  advice: string;
}

// 判定門檻。中文一個字資訊量高，用字元數（code point）計算，和中文站的實際內容量相符。
const EMPTY_TEXT = 200;   // 少於這個字數，等於沒有內容可讀
const THIN_TEXT = 500;    // 少於這個字數，內容單薄
const BIG_HTML = 5000;    // HTML 很大卻沒文字 → 內容都在 JS 裡

function charLen(s: string): number {
  return [...s].length;
}

// node-html-parser 的 textContent 跟瀏覽器 DOM 一樣，直接把所有文字節點黏在一起，
// 中間不會補空格——<a>Q kangber</a><a>服務</a> 會變成「Q kangber服務」，
// 巢狀選單、卡片一多，整段預覽就變成分不出詞界的字串湯，看起來像壞掉，
// 但那其實只是我們「秀給人看」這一步的問題，AI 爬蟲原始讀到的內容本身沒事。
// 這裡改成逐節點遞迴、用空格接每個節點，避免相鄰標籤的文字黏在一起。
function extractText(node: { nodeType: number; rawText?: string; childNodes?: unknown[] }): string {
  if (node.nodeType === 3) return node.rawText ?? '';
  const children = (node.childNodes ?? []) as typeof node[];
  return children.map(extractText).join(' ');
}

export function analyzeContentVisibility(html: string): ContentVisibility {
  const root = parse(html);
  const htmlLength = html.length;
  const scriptCount = root.querySelectorAll('script').length;

  const title = (root.querySelector('title')?.textContent ?? '').trim();
  const description = (
    root.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
  ).trim();
  const h1 = root.querySelectorAll('h1').map((el) => el.textContent.trim()).filter(Boolean);

  // JSON-LD 的 @type：可能是單一物件、陣列，或帶 @graph 的容器，統一攤平後取型別
  const jsonLdTypes = new Set<string>();
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.rawText.trim());
      const nodes: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { '@graph'?: unknown[] })['@graph'])
          ? (data as { '@graph': unknown[] })['@graph']
          : [data];
      for (const node of nodes) {
        const t = (node as { '@type'?: unknown })?.['@type'];
        if (typeof t === 'string') jsonLdTypes.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && jsonLdTypes.add(x));
      }
    } catch {
      // JSON 壞掉就跳過，不影響其他判斷
    }
  }

  // 剝掉不會被當成內容的節點再取純文字。這些標籤裡的東西 AI 不會當作頁面內容，
  // 留著會讓一個空殼頁看起來「有很多字」。
  const body = root.querySelector('body') ?? root;
  const clone = parse(body.innerHTML);
  clone.querySelectorAll('script, style, noscript, template, svg').forEach((el) => el.remove());
  const text = extractText(clone).replace(/\s+/g, ' ').trim();
  const textLength = charLen(text);

  let status: VisibilityStatus;
  let advice: string;
  if (textLength < EMPTY_TEXT) {
    status = 'empty';
    advice =
      htmlLength > BIG_HTML && scriptCount > 0
        ? `AI 爬蟲讀到的內容幾乎是空的（只有 ${textLength} 個字）。頁面有 ${scriptCount} 個腳本、HTML 共 ${htmlLength} 字元，內容應該是靠 JavaScript 在瀏覽器端才長出來的。AI 爬蟲不執行 JavaScript，所以看到的就是這片空白——建議改用伺服器端渲染（SSR）或預先渲染（SSG）。`
        : `AI 爬蟲讀到的內容幾乎是空的（只有 ${textLength} 個字），這一頁在 AI 眼中等於沒有內容。`;
  } else if (textLength < THIN_TEXT) {
    status = 'thin';
    advice = `AI 爬蟲只讀到 ${textLength} 個字，內容偏單薄。AI 要有足夠的文字才能理解並引用你的頁面，建議首頁至少寫清楚你是誰、提供什麼。`;
  } else {
    status = 'ok';
    advice = `AI 爬蟲能讀到 ${textLength} 個字的內容，不需要執行 JavaScript 就看得到。`;
  }

  return {
    status,
    textLength,
    htmlLength,
    scriptCount,
    preview: text.slice(0, 300),
    title,
    description,
    h1,
    jsonLdTypes: [...jsonLdTypes],
    advice,
  };
}
