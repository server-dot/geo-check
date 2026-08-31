import { runVisibilityQueries, type VisibilityAnswer } from './geo-brand-visibility';

// ── GEO：關鍵字 AI 能見度查詢 ────────────────────────────
// 品牌能見度回答的是「AI 知不知道你這個品牌」，這裡回答更貼近使用者真正在意的
// 問題：「有人拿某個主題去問 AI 時，AI 會不會推薦到我」——GEO 優化的關鍵其實
// 不是品牌本身找不找得到，是你想搶的關鍵字/主題底下，AI 推薦名單裡有沒有你。
//
// 查詢邏輯（呼叫引擎、解析引用來源）直接共用 geo-brand-visibility.ts 的
// runVisibilityQueries，差別只在問題怎麼問、結果怎麼解讀。

export interface KeywordVisibilityResult extends VisibilityAnswer {
  keyword: string;
  advice: string;
}

const KEYWORD_MIN_CHARS = 2;
const KEYWORD_MAX_CHARS = 16;
const MAX_CANDIDATES = 5;

function charLen(s: string): number {
  return [...s].length;
}

// 用標題／描述／H1 猜幾個關鍵字候選，純字串處理不叫 AI，先讓使用者免費看到
// 建議，要不要真的花 API 額度去查，交給使用者自己按「查詢」決定——這是刻意
// 的成本控制，不是每個候選都自動查兩個引擎。
export function guessKeywordCandidates(input: { title: string; description: string; h1: string[] }): string[] {
  const pool: string[] = [];

  // 標題常見「品牌｜賣點｜賣點」這種疊法，跳過第一段（通常是品牌名），
  // 後面才是真正的定位/關鍵字素材。
  const titleParts = input.title.split(/[|｜\-–—:：]/).map((s) => s.trim()).filter(Boolean);
  const positioningText = [...titleParts.slice(1), ...input.h1].join(' ');
  pool.push(...positioningText.split(/[×xX,，、\s]+/));

  // description 是完整句子，抓逗號/頓號分隔出來的短語當候選，不硬做語意抽取。
  pool.push(...input.description.split(/[，,、。]/).slice(0, 4));

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of pool) {
    const clean = raw.replace(/\s+/g, ' ').trim();
    const len = charLen(clean);
    if (len < KEYWORD_MIN_CHARS || len > KEYWORD_MAX_CHARS) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    candidates.push(clean);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

export async function checkKeywordVisibility(keyword: string, origin: string): Promise<KeywordVisibilityResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const query = `如果我想找「${trimmed}」相關的服務或資訊，你會推薦哪些網站、服務或資源？請列出來源網址。`;
  const answers = await runVisibilityQueries(query, origin);
  if (!answers) return [];

  return answers.map((a) => {
    const advice = a.citedSelf
      ? `${a.engine} 針對「${trimmed}」這個主題，回答時引用了你自己的網站——這個關鍵字底下 AI 找得到你、也願意推薦你。`
      : `${a.engine} 針對「${trimmed}」這個主題，沒有推薦到你的網站——目前這個關鍵字底下你不在它推薦的範圍內。`;
    return { ...a, keyword: trimmed, advice };
  });
}
