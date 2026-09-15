import type { CheckStatus } from './geo-audit-rules';

// ── GEO：五分類分數計算（前後端共用）──────────────────────
// 這段原本只活在 app/HomeClient.tsx 裡，但報告的 Markdown 版（給 AI 讀的那份，
// 見 geo-report-markdown.ts）也要算同一組分數——複製一份遲早會兩邊算出不同的
// 總分。抽成純函式放這裡，前端 client component 跟後端 route 都直接 import。
// 型別刻意用「最小結構」宣告，前端本地那份 EngineResult／CheckItem 介面
// 也吃得下，不用為了共用把兩邊的型別綁死。

export interface Category5 {
  name: string;
  passRate: number; // (ok×1 + warn×0.5) / total × 100，四捨五入
  total: number;
  ok: number;
  warn: number;
  fail: number;
}

export interface ScoreEngineInput {
  results: { status: string }[];
  contentSignals: { declared: boolean } | null;
  llmsTxt: { exists: boolean | null; quality: { status: string } | null };
}

export interface ScoreCheckInput {
  key: string;
  status: CheckStatus;
}

export const CATEGORY5_KEY_MAP: Record<string, string> = {
  duplicate: "內容與追蹤",
  externalLinks: "內容與追蹤",
  analytics: "內容與追蹤",
  tkd: "內容與追蹤",
  schema: "結構化資料",
  localbiz: "結構化資料",
  sitemap: "技術與索引",
  robots: "技術與索引",
  indexing: "技術與索引",
  headings: "技術與索引",
  llmsSeo: "技術與索引",
  page: "技術與索引",
  viewport: "技術與索引",
  breadcrumb: "技術與索引",
  internalLinks: "技術與索引",
  brokenLinks: "技術與索引",
  homepage: "技術與索引",
  imgAlt: "技術與索引",
  imgFormat: "技術與索引",
  eeat: "品牌與權威",
  aboutPage: "品牌與權威",
  contactPage: "品牌與權威",
  // categoryDepth 量的是「網址最深幾層 + 幾頁有麵包屑」，那是網站結構，不是品牌
  // 權威。它原本掛在品牌與權威底下，讓一個只有 2 項的分類憑一個技術指標拿到 75 分
  // ——一個連 GSC 都沒裝的網站不可能有 75 分的品牌權威。移到技術與索引。
  categoryDepth: "技術與索引",
};
export const CATEGORY5_ORDER = ["AI 可達性", "內容與追蹤", "結構化資料", "技術與索引", "品牌與權威"];

export function buildCategories5(engine?: ScoreEngineInput, audit?: ScoreCheckInput[]): Category5[] {
  const buckets = new Map<string, { ok: number; warn: number; fail: number }>();
  const bump = (name: string, status: CheckStatus) => {
    const b = buckets.get(name) ?? { ok: 0, warn: 0, fail: 0 };
    b[status] += 1;
    buckets.set(name, b);
  };

  if (engine) {
    for (const b of engine.results) {
      bump("AI 可達性", b.status === "allowed" ? "ok" : b.status === "blocked" ? "fail" : "warn");
    }
    if (engine.contentSignals) bump("AI 可達性", engine.contentSignals.declared ? "ok" : "warn");
    if (engine.llmsTxt.exists !== null) {
      bump("AI 可達性", engine.llmsTxt.exists ? (engine.llmsTxt.quality?.status === "ok" ? "ok" : "warn") : "warn");
    }
  }

  if (audit) {
    for (const c of audit) {
      const group = CATEGORY5_KEY_MAP[c.key];
      if (group) bump(group, c.status);
    }
  }

  return CATEGORY5_ORDER.map((name) => {
    const b = buckets.get(name) ?? { ok: 0, warn: 0, fail: 0 };
    const total = b.ok + b.warn + b.fail;
    const passRate = total > 0 ? Math.round(((b.ok + b.warn * 0.5) / total) * 100) : 0;
    return { name, passRate, total, ok: b.ok, warn: b.warn, fail: b.fail };
  });
}

// 總分＝5 分類各自 passRate 的平均（每個分類權重相同，跟雷達圖五個角一一對應，
// 不會因為某個分類底下檢測項目數量多就搶走權重）。等第門檻是隨性抓的區間，
// 沒有業界標準可循——先求「有個總覽數字」堪用，之後要調全靠這幾個數字改。
export function computeOverallScore(categories: Category5[]): { score: number; grade: string; gradeLabel: string } {
  const score = categories.length > 0 ? Math.round(categories.reduce((s, c) => s + c.passRate, 0) / categories.length) : 0;
  const grade =
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  const gradeLabel =
    score >= 85 ? "優異" : score >= 70 ? "良好" : score >= 55 ? "普通" : score >= 40 ? "待加強" : "不合格";
  return { score, grade, gradeLabel };
}
