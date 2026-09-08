// ── GEO：AI 推薦名單彙整 ────────────────────────────────
// 關鍵字能見度查詢已經拿回每個引擎的引用來源了，但一次只看一張卡片，看不出
// 「這個主題底下 AI 到底都在推誰」。這裡把所有查詢的引用來源依網域彙總排序，
// 讓使用者直接看到 AI 現在推薦的名單長什麼樣、自己排第幾、或根本不在名單上。
//
// 刻意不對這些網域跑技術檢測：AI 推薦誰，主要看的是內容深度跟品牌權威，
// 不是 robots.txt 設定——把「他有 llms.txt 所以贏你」這種因果講出來是唬爛。
// 這裡只做一件事：如實呈現 AI 引用了誰、引用幾次。
//
// 純函式、零 import，前端 client component 可以直接引用，不用另外複製一份。

export interface CitedDomain {
  domain: string;
  count: number;      // 總共被引用幾次（同一個網域在多個回答裡出現會累加）
  keywords: string[]; // 在哪些關鍵字的回答裡出現
  isSelf: boolean;
  sampleUrl: string;  // 代表網址，讓使用者點得進去看 AI 引用的是哪一頁
}

export interface CitationSource {
  keyword: string;
  citations: { url: string; isSelf: boolean }[];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// 依網域彙總所有查詢的引用來源，被引用次數多的排前面；
// 次數相同時把「出現在較多關鍵字底下」的排前面——只在一個主題被引用一次，
// 跟三個主題都被引用一次，後者在 AI 眼中明顯更常被當成答案。
export function tallyCitedDomains(sources: CitationSource[]): CitedDomain[] {
  const map = new Map<string, CitedDomain>();

  for (const { keyword, citations } of sources) {
    for (const c of citations) {
      const domain = hostnameOf(c.url);
      if (!domain) continue;
      const existing = map.get(domain);
      if (existing) {
        existing.count += 1;
        if (!existing.keywords.includes(keyword)) existing.keywords.push(keyword);
      } else {
        map.set(domain, { domain, count: 1, keywords: [keyword], isSelf: c.isSelf, sampleUrl: c.url });
      }
    }
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || b.keywords.length - a.keywords.length || a.domain.localeCompare(b.domain),
  );
}
