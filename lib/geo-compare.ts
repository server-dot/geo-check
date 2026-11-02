import { askJson, parseJson } from './geo-recommend-visibility';
import { runVisibilityQueries, type VisibilityAnswer } from './geo-brand-visibility';
import { fetchGoogleAio } from './geo-google-aio';

// ── 直接比較題：「你 跟 第一名對手 哪個好？」──────────────
// 通用推薦題裡，強勢品牌幾乎每題都會出現，跟對手的差距看不出來（2026-11-02 Relove vs 婦潔：
// 婦潔被推的每一次 Relove 都在）。直接叫 AI 把兩家放在一起比，才看得出它偏向誰、拿什麼標準比。
// 成本：Perplexity＋ChatGPT 各 1 次、Google 最多 2 次 SerpApi、歸納 1 次。只比第一名對手。

export interface CompareVerdict {
  engine: string;
  favors: 'self' | 'rival' | 'tie';
  reason: string; // 一句話：它為什麼這樣判
  quote: string;
}

export interface CompareDimension {
  name: string; // 比較標準，例如「價格」「溫和度」「通路」
  winner: 'self' | 'rival' | 'tie';
  quote: string;
  engine: string;
}

export interface CompareResult {
  rival: string;
  query: string;
  verdicts: CompareVerdict[];
  dimensions: CompareDimension[];
}

function shortEngine(e: string): string {
  return e.split(/[（(]/)[0].trim();
}

// 「婦潔 (VIGILL)」→「婦潔」：問 AI 時用一般人會打的寫法
export function plainBrand(name: string): string {
  return name.replace(/[（(][^）)]*[）)]/g, '').trim() || name;
}

export async function fetchCompareAnswers(selfName: string, rivalName: string, origin: string) {
  const rival = plainBrand(rivalName);
  const query = `${selfName} 跟 ${rival} 哪個好`;
  const [llm, google] = await Promise.all([
    runVisibilityQueries(`${query}？請比較兩者的優缺點，並附上來源網址。`, origin, 900).catch(() => null),
    fetchGoogleAio(query, origin).catch(() => null),
  ]);
  const answers: VisibilityAnswer[] = [...(llm ?? []), ...(google?.status === 'present' ? [google.answer] : [])];
  return { rival, query, answers };
}

export async function extractCompare(
  selfName: string,
  rival: string,
  query: string,
  answers: VisibilityAnswer[],
  apiKey: string,
): Promise<CompareResult | null> {
  if (answers.length === 0) return null;
  const blocks = answers.map((a, i) => `[${i}] ${shortEngine(a.engine)}：\n${a.answer.slice(0, 3000)}`).join('\n\n---\n\n');
  const prompt = `有人問 AI「${query}？」，下面是幾家 AI 的回答。請整理：

1. verdicts：每一段回答最後比較偏向誰。favors 填 "self"（偏向 ${selfName}）、"rival"（偏向 ${rival}）或 "tie"（沒有偏向、看需求）。reason 用一句台灣口語說它為什麼這樣判（20 字內）。
2. dimensions：這些回答拿來比較的標準（例如價格、溫和度、通路、成分、口碑），每個標準誰比較好。winner 填 "self"、"rival" 或 "tie"。名稱 6 字內。最多 6 個。

每一項都要附 quote：原文裡一字不差的連續片段（10～40 字），answer 填出自第幾段。找不到原句就不要列。

${blocks}

只回傳 JSON：{"verdicts":[{"answer":0,"favors":"tie","reason":"…","quote":"…"}],"dimensions":[{"name":"價格","winner":"rival","answer":0,"quote":"…"}]}`;

  let raw = '';
  try {
    raw = await askJson(prompt, apiKey, 1400);
  } catch {
    return null;
  }
  const parsed = parseJson<{ verdicts?: unknown; dimensions?: unknown }>(raw);
  if (!parsed) return null;
  const norm = (t: string) => t.replace(/[\s*_`#>|[\]()]/g, '');
  const texts = answers.map((a) => norm(a.answer));
  const okQuote = (i: unknown, q: unknown): q is string =>
    typeof i === 'number' && typeof q === 'string' && norm(q).length >= 4 && !!texts[i]?.includes(norm(q.trim()));
  const side = (v: unknown): 'self' | 'rival' | 'tie' => (v === 'self' || v === 'rival' ? v : 'tie');

  const verdicts: CompareVerdict[] = [];
  for (const v of (Array.isArray(parsed.verdicts) ? parsed.verdicts : []) as Record<string, unknown>[]) {
    if (!okQuote(v.answer, v.quote)) continue;
    const i = v.answer as number;
    if (verdicts.some((x) => x.engine === shortEngine(answers[i].engine))) continue;
    verdicts.push({ engine: shortEngine(answers[i].engine), favors: side(v.favors), reason: String(v.reason ?? '').trim(), quote: (v.quote as string).trim() });
  }
  const dimensions: CompareDimension[] = [];
  for (const d of (Array.isArray(parsed.dimensions) ? parsed.dimensions : []) as Record<string, unknown>[]) {
    if (typeof d.name !== 'string' || !okQuote(d.answer, d.quote)) continue;
    dimensions.push({ name: d.name.trim(), winner: side(d.winner), quote: (d.quote as string).trim(), engine: shortEngine(answers[d.answer as number].engine) });
  }
  return { rival, query, verdicts, dimensions: dimensions.slice(0, 6) };
}
