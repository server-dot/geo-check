import type { VisibilityAnswer } from './geo-brand-visibility';
import { runRecommendVisibility, type PickedQuestion, type RecommendInput, type RecommendVisibility } from './geo-recommend-visibility';
import { matchQuestionsToPages, type MatchPage } from './geo-content-match';
import { detectOwnedSources, markOwnedQuestions } from './geo-owned-sources';
import { extractSentiment, selfShortName, sentimentInputs, type SentimentResult } from './geo-sentiment';
import { extractPositioning, topRivals } from './geo-positioning';
import { extractCompare, fetchCompareAnswers } from './geo-compare';
import type { BrandProfile } from './geo-brand-profile';

// 使用者勾好推薦題、按「問 AI」之後跑的整段（2026-11-11 前這段在健檢流程裡自動跑）：
// 問 AI → 認出品牌自己的來源 → 比對網站上有沒有在回答這些題目（三關第 2 關）→
// 第一名對手的定位、直接比較 → 評價把推薦題回答也算進去重新歸納。
// 任何一個後段步驟失敗都只是少一塊，不讓整次問題白問。

type Sentiment = SentimentResult & { reviewQuery?: string; reviewAnswers?: VisibilityAnswer[] };

export async function askPickedQuestions(args: {
  input: RecommendInput;
  origin: string;
  picked: PickedQuestion[];
  pages: MatchPage[]; // 從檢測紀錄打開的報告沒有爬到的頁面（只存在記憶體 1 小時）→ 空陣列，第 2 關就不判斷
  siteExternalLinks: string[];
  brandChecks: { engine: string; answer: string; citations: { url: string; title: string; isSelf: boolean }[] }[];
  insights: { sentiment: Sentiment | null; profile: BrandProfile | null } | null;
  apiKey: string;
}): Promise<RecommendVisibility | null> {
  const { input, origin, picked, pages, siteExternalLinks, brandChecks, insights, apiKey } = args;
  const rec = await runRecommendVisibility(input, origin, picked).catch(() => null);
  if (!rec) return null;

  const selfName = selfShortName(rec.brandName);
  const reviewAnswers = insights?.sentiment?.reviewAnswers ?? [];
  const owned = await detectOwnedSources({
    brandNames: [rec.brandName, selfName],
    domain: origin,
    siteExternalLinks,
    citations: [
      ...rec.questions.flatMap((q) => q.results.flatMap((r) => r.citations)),
      ...brandChecks.flatMap((b) => b.citations),
      ...reviewAnswers.flatMap((a) => a.citations ?? []),
    ],
  }).catch(() => new Set<string>());
  const rv = { ...rec, ...markOwnedQuestions(rec.questions, owned) };

  const rivals = topRivals(rv.names);
  const all = rv.questions.flatMap((q) => q.results.map((r) => ({ engine: r.engine, answer: r.answer })));
  const [contentMatch, cmp, sentiment] = await Promise.all([
    pages.length > 0 ? matchQuestionsToPages(rv.questions, pages, apiKey).catch(() => null) : Promise.resolve(null),
    rivals[0] ? fetchCompareAnswers(selfName, rivals[0], origin).catch(() => null) : Promise.resolve(null),
    // 評價：推薦題裡點名你的回答也有描述你，加進去重新歸納；失敗就沿用健檢時那份
    extractSentiment(rv.brandName, [...sentimentInputs(rv, brandChecks), ...reviewAnswers], apiKey, owned)
      .then((s) => (s ? { ...s, reviewQuery: insights?.sentiment?.reviewQuery, reviewAnswers: insights?.sentiment?.reviewAnswers } : insights?.sentiment ?? null))
      .catch(() => insights?.sentiment ?? null),
  ]);
  const [positioning, compare] = await Promise.all([
    extractPositioning(selfName, rivals, [...all, ...reviewAnswers, ...(cmp?.answers ?? [])], apiKey).catch(() => null),
    cmp ? extractCompare(selfName, cmp.rival, cmp.query, cmp.answers, apiKey).catch(() => null) : Promise.resolve(null),
  ]);
  return { ...rv, contentMatch, sentiment, positioning, compare, profile: insights?.profile ?? null };
}
