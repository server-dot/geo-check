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

// 給人看的預覽用結構化區塊，不是一整條黏死的字串。
// 'tags'：一串短小、並排的標籤/選單字（例如導覽列、分類標籤、跑馬燈項目）——用標籤樣式呈現。
// 'text'：正常長度的句子/段落——用一般文字呈現。
export type PreviewBlock = { kind: 'tags'; items: string[] } | { kind: 'text'; text: string };

export interface ContentVisibility {
  status: VisibilityStatus;
  textLength: number;    // AI 讀得到的純文字字數（正文＋選單／標籤字加總）
  substantiveChars: number; // textLength 裡，屬於正常句子/段落的字數
  furnitureChars: number;   // textLength 裡，屬於導覽列/選單/標籤這類「網站家具」的字數
  htmlLength: number;    // 原始 HTML 長度（對比用）
  scriptCount: number;   // <script> 數量：文字少但腳本多，就是典型 CSR 空殼
  preview: string;       // 實際抽出的純文字開頭（純文字版，備用）
  previewBlocks: PreviewBlock[]; // 同一份預覽內容，依「標籤 / 文字」分好區塊，給畫面呈現用
  title: string;
  description: string;
  h1: string[];
  leadParagraphs: string[]; // 頁面裡幾段「像完整句子」的內容摘錄，各自成段，給標題/描述多一點佐證
  jsonLdTypes: string[]; // 結構化資料型別，AI 理解頁面的重要線索
  summary: string;  // 一句話總結點評——給人看的重點結論，放在最前面
  advice: string;   // 底下支撐 summary 的技術細節（字數、重複內容等）
  duplicateBlockChars: number; // 偵測到結構性重複區塊（例如跑馬燈為做無縫循環而複製兩份）並排除掉的字數
}

// 判定門檻。中文一個字資訊量高，用字元數（code point）計算，和中文站的實際內容量相符。
const EMPTY_TEXT = 200;   // 少於這個字數，等於沒有內容可讀
const THIN_TEXT = 500;    // 少於這個字數，內容單薄
const BIG_HTML = 5000;    // HTML 很大卻沒文字 → 內容都在 JS 裡

// 依句末標點（。！？.!?）切句子，標點留在句尾，用來在字數上限內只取完整句子。
function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function charLen(s: string): number {
  return [...s].length;
}

// node-html-parser 的 textContent 跟瀏覽器 DOM 一樣，直接把所有文字節點黏在一起，
// 中間不會補空格——<a>Q kangber</a><a>服務</a> 會變成「Q kangber服務」，
// 巢狀選單、卡片一多，整段預覽就變成分不出詞界的字串湯，看起來像壞掉，
// 但那其實只是我們「秀給人看」這一步的問題，AI 爬蟲原始讀到的內容本身沒事。
// 這裡改成逐節點遞迴，每個節點各自算一個「文字單位」而不是黏成一條字串，
// 讓後面 groupIntoBlocks() 可以判斷「這一串是不是很多短單位排在一起」（導覽列、
// 標籤雲），跟正常句子分開呈現。
//
// 另外處理一種常見雜訊：跑馬燈/無限捲動元件為了做無縫循環效果，會把同一組
// 項目在 DOM 裡塞兩份（例如「電商品牌 行銷 SEO ...」整串重複兩次）。這不是
// 使用者寫了兩次重複內容，是動畫實作的副作用，但沒過濾的話會虛增字數、
// 也讓預覽看起來很雜亂。偵測方式：同一個父節點底下，子節點文字單位陣列前半跟
// 後半逐項完全相同，就視為這種重複，只保留第一份、把後半排除掉。
function extractUnits(
  node: { nodeType: number; rawText?: string; childNodes?: unknown[] },
  onDuplicate: (chars: number) => void
): string[] {
  if (node.nodeType === 3) {
    const t = (node.rawText ?? '').trim();
    return t ? [t] : [];
  }
  const children = (node.childNodes ?? []) as typeof node[];
  let units = children.flatMap((child) => extractUnits(child, onDuplicate));

  if (units.length >= 4 && units.length % 2 === 0) {
    const half = units.length / 2;
    const first = units.slice(0, half);
    const second = units.slice(half);
    if (first.join(' ') === second.join(' ')) {
      onDuplicate(second.join('').length);
      units = first;
    }
  }

  return units;
}

// 把攤平的文字單位陣列，分成「一串短標籤」跟「一般文字」兩種區塊，給畫面用。
// 連續 3 個以上、每個都很短（沒有標點、字數少）的單位，視為標籤/選單這類
// 「網站家具」，其餘接回正常段落。這只影響「秀給人看」的呈現方式，不影響
// 用來判斷 AI 讀到多少內容的 textLength。
const TAG_UNIT_MAX_CHARS = 12;
const TAG_GROUP_MIN_ITEMS = 3;

function isTagLikeUnit(unit: string): boolean {
  return charLen(unit) > 0 && charLen(unit) <= TAG_UNIT_MAX_CHARS && !/[。！？.!?]/.test(unit);
}

function groupIntoBlocks(units: string[]): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = blocks[blocks.length - 1];
    if (last && last.kind === 'text') last.text += (last.text ? ' ' : '') + t;
    else blocks.push({ kind: 'text', text: t });
  };

  let i = 0;
  while (i < units.length) {
    if (isTagLikeUnit(units[i])) {
      const group: string[] = [];
      while (i < units.length && isTagLikeUnit(units[i])) {
        group.push(units[i]);
        i++;
      }
      if (group.length >= TAG_GROUP_MIN_ITEMS) {
        blocks.push({ kind: 'tags', items: group });
      } else {
        pushText(group.join(' '));
      }
    } else {
      pushText(units[i]);
      i++;
    }
  }
  return blocks;
}

// preview 字數上限內截斷 blocks：標籤區塊整組留下或整組丟掉，不從中間切斷；
// 文字區塊在字數上限內截到最後一個完整詞（空格）為止，加上「…」，不會像
// 直接砍字元數那樣把一個詞從中間切斷（例如「work with」變成「work w」）。
function truncateBlocks(blocks: PreviewBlock[], maxChars: number): PreviewBlock[] {
  const result: PreviewBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    if (used >= maxChars) break;
    if (block.kind === 'tags') {
      const items: string[] = [];
      for (const item of block.items) {
        if (used >= maxChars) break;
        items.push(item);
        used += charLen(item);
      }
      if (items.length) result.push({ kind: 'tags', items });
    } else {
      const remaining = maxChars - used;
      const chars = [...block.text];
      if (chars.length <= remaining) {
        result.push({ kind: 'text', text: block.text });
        used += chars.length;
      } else {
        const cut = chars.slice(0, remaining).join('');
        const lastSpace = cut.lastIndexOf(' ');
        const safe = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
        if (safe) result.push({ kind: 'text', text: safe.trimEnd() + '…' });
        used = maxChars;
      }
    }
  }
  return result;
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
  let duplicateBlockChars = 0;
  const units = extractUnits(clone, (chars) => { duplicateBlockChars += chars; })
    .map((u) => u.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = units.join(' ');
  const textLength = charLen(text);

  const fullBlocks = groupIntoBlocks(units);
  const substantiveChars = fullBlocks
    .filter((b): b is Extract<PreviewBlock, { kind: 'text' }> => b.kind === 'text')
    .reduce((sum, b) => sum + charLen(b.text), 0);
  const furnitureChars = fullBlocks
    .filter((b): b is Extract<PreviewBlock, { kind: 'tags' }> => b.kind === 'tags')
    .reduce((sum, b) => sum + b.items.reduce((s, item) => s + charLen(item), 0), 0);

  // 挑出幾段「真的是句子」的內容摘錄，各自成一段給畫面分段呈現，不是黏成一
  // 大團。只留有句子標點的區塊——排掉「黃小瓜瓜 · Q kangber 智慧助理」這類
  // 沒有標點的短標語/小工具自我介紹。字數上限內只放得下完整的段落；放不下
  // 整段時，改成一句一句累加，永遠停在完整句子結尾，不會截到一半再補「…」。
  const LEAD_PARAGRAPH_MAX_CHARS = 400;
  const leadCandidates = fullBlocks
    .filter((b): b is Extract<PreviewBlock, { kind: 'text' }> => b.kind === 'text')
    .map((b) => b.text)
    .filter((t) => charLen(t) >= 15 && /[。！？，、.!?：:]/.test(t));

  const leadParagraphs: string[] = [];
  let used = 0;
  for (const block of leadCandidates) {
    if (used >= LEAD_PARAGRAPH_MAX_CHARS) break;
    if (used + charLen(block) <= LEAD_PARAGRAPH_MAX_CHARS) {
      leadParagraphs.push(block);
      used += charLen(block);
      continue;
    }
    let partial = '';
    for (const sentence of splitSentences(block)) {
      if (used + charLen(partial) + charLen(sentence) > LEAD_PARAGRAPH_MAX_CHARS) break;
      partial += sentence;
    }
    if (partial) {
      leadParagraphs.push(partial);
      used += charLen(partial);
    }
    break;
  }
  if (leadParagraphs.length === 0 && leadCandidates.length > 0) {
    leadParagraphs.push(splitSentences(leadCandidates[0])[0] ?? leadCandidates[0]);
  }

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
    advice = `AI 爬蟲只讀到 ${textLength} 個字（正文約 ${substantiveChars} 字、選單／標籤約 ${furnitureChars} 字），內容偏單薄。AI 要有足夠的文字才能理解並引用你的頁面，建議首頁至少寫清楚你是誰、提供什麼。`;
  } else {
    status = 'ok';
    advice = `AI 爬蟲能讀到 ${textLength} 個字（正文約 ${substantiveChars} 字、選單／標籤約 ${furnitureChars} 字），不需要執行 JavaScript 就看得到。`;
  }

  if (duplicateBlockChars > 0) {
    advice += ` 另外偵測到約 ${duplicateBlockChars} 個字的內容在頁面裡重複渲染了兩份（常見於跑馬燈／無限捲動效果為了無縫循環而複製的第二份，也可能是響應式版面同時渲染手機版/桌機版兩份選單），這段已經從上面的字數和預覽排除。建議把重複的那份加上 aria-hidden="true"，避免稀釋 AI 讀到的有效內容比例。`;
  }

  // summary：給人看的一句話總結，優先於底下的技術細節（advice）。
  // ok 狀態下再依內容組成（家具占比、有沒有寫 description、有沒有重複區塊）
  // 點出最多兩個值得處理的地方，不是把每個小數字都塞進同一句話。
  let summary: string;
  if (status === 'empty') {
    summary = 'AI 幾乎讀不到你的內容，等於你的網站在 AI 眼中是空的——這是最優先要處理的問題。';
  } else if (status === 'thin') {
    summary = 'AI 讀得到內容，但份量偏薄，建議加寫更多說明文字，AI 才有足夠依據理解並引用你的頁面。';
  } else {
    const furnitureRatio = textLength > 0 ? furnitureChars / textLength : 0;
    const issues: string[] = [];
    if (furnitureRatio > 0.3) {
      issues.push(
        `選單／標籤字占比偏高（約 ${Math.round(furnitureRatio * 100)}%），正文其實只有約 ${substantiveChars} 字，可以考慮精簡導覽或標籤數量`
      );
    }
    if (!description) {
      issues.push('沒有寫 meta description，建議補一段簡短說明，這是 AI 判斷頁面主題的重要依據');
    }
    if (duplicateBlockChars > 0) {
      issues.push(`偵測到約 ${duplicateBlockChars} 字重複渲染內容（常見於跑馬燈或響應式雙份選單），建議加上 aria-hidden 排除`);
    }
    summary =
      issues.length === 0
        ? '內容量足夠、標題與描述也清楚，AI 應該能正確理解你的網站在做什麼，沒有發現明顯需要處理的問題。'
        : `內容量足夠，AI 讀得到理解你網站所需要的文字。可以再優化的地方：${issues.slice(0, 2).join('；')}。`;
  }

  const previewBlocks = truncateBlocks(fullBlocks, 800);

  return {
    status,
    textLength,
    substantiveChars,
    furnitureChars,
    htmlLength,
    duplicateBlockChars,
    scriptCount,
    preview: text.slice(0, 300),
    previewBlocks,
    title,
    description,
    h1,
    leadParagraphs,
    jsonLdTypes: [...jsonLdTypes],
    summary,
    advice,
  };
}
