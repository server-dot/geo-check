import { LEVEL, CATEGORY } from './geo-audit-rules';
import type { CheckResult, CheckStatus } from './geo-audit-rules';

// ── GEO 深度健檢：AI 語意判斷層 ──────────────────────────
// 規則判不了的語意題，交給 GPT-4o（走 OpenRouter）：E-E-A-T 權威訊號足不足。
// Schema 完整度已改成純規則判斷（見 geo-schema-check.ts），不用再叫 AI 猜。
// 沒設 API key 或呼叫失敗時，回退成 warn（標「AI 未判斷」），不讓整個健檢炸掉。
// 這是每次免費健檢都要花錢的部分，先做出來，之後再決定要不要限流或設閘門。

const MODEL = 'openai/gpt-4o';

export type AiAuditInput = {
  url: string;
  mainText: string;
};

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://geo-check.app',
      'X-Title': 'GEO Check Deep Audit',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      // 一定要設上限：不設的話 OpenRouter 會用模型上限預扣額度，餘額不足時每次都 402
      max_tokens: 500,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildPrompt(input: AiAuditInput): string {
  return `你是資深 SEO／GEO 技術顧問。以下是一個網頁的內文摘要，請判斷 E-E-A-T 權威訊號足不足，給一個狀態與一句中文說明。

【頁面網址】${input.url}

【頁面內文摘要】
${input.mainText || '（抓不到內文）'}

請逐項檢查內文是否出現以下四類信任訊號，每項標記「有」或「無」——
- 作者資訊（真實姓名、職稱、簡介）
- 專業證照／資格
- 媒體報導／外部第三方引用
- 可查證的客戶評論／實績（不是自我宣稱的「成功案例」文案，要有具體、可核實的細節）
「有」的項目要引用內文原句當證據；「無」的項目直接寫「無」。四項都無或幾乎都無→"fail"；有一兩項但薄弱→"warn"；多數項目充足→"ok"。

只回傳 JSON，格式如下（message 用繁體中文、一句話總結；evidence 用「項目：有/無（證據或說明）」逐項列出，四項用「｜」分隔）：
{"eeat":{"status":"ok|warn|fail","message":"...","evidence":"作者資訊：無｜專業證照：無｜媒體報導：無｜客戶評論：無（僅自稱『成功案例』，無可查證細節）"}}`;
}

function parseAiJson(text: string): {
  eeat?: { status?: string; message?: string; evidence?: string };
} | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normStatus(s: string | undefined): CheckStatus {
  return s === 'ok' || s === 'warn' || s === 'fail' ? s : 'warn';
}

export async function runAiChecks(input: AiAuditInput): Promise<CheckResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  const EEAT = { key: 'eeat', level: LEVEL.EFFICIENCY, category: CATEGORY.EXTERNAL, item: '符合 E-E-A-T 原則' };

  const fallback = (reason: string): CheckResult[] => [
    { ...EEAT, status: 'warn', advice: `未經 AI 判斷（${reason}）` },
  ];

  if (!apiKey) return fallback('缺少 OPENROUTER_API_KEY');

  let text: string;
  try {
    text = await askOpenRouter(buildPrompt(input), apiKey);
  } catch (err) {
    return fallback(err instanceof Error ? err.message : 'AI 呼叫失敗');
  }

  const parsed = parseAiJson(text);
  if (!parsed) return fallback('AI 回覆無法解析');

  return [
    {
      ...EEAT,
      status: normStatus(parsed.eeat?.status),
      advice: parsed.eeat?.message ?? '（AI 未提供說明）',
      evidence: parsed.eeat?.evidence,
    },
  ];
}
