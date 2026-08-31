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
  hasAuthorSchema: boolean; // 結構化資料裡是否查得到 author／Person 標記，當作既有事實給 AI 參考
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

【已知事實】網站的結構化資料（JSON-LD）中${input.hasAuthorSchema ? '偵測到' : '沒有偵測到'} author／Person 標記。這只代表有沒有機器可讀的作者標記，不代表內文本身寫得夠不夠清楚——仍要以下面的內文摘要為準逐項判斷，不能只憑這一點下結論。

【頁面內文摘要】
${input.mainText || '（抓不到內文）'}

請逐項檢查內文是否出現以下四類信任訊號，每項標記「有」或「無」——
- 作者資訊（真實姓名、職稱、簡介）
- 專業證照／資格
- 媒體報導／外部第三方引用
- 可查證的客戶評論／實績（不是自我宣稱的「成功案例」文案，要有具體、可核實的細節）
「有」的項目要引用內文原句當證據；「無」的項目直接寫「無」，不要編造理由。四項都無或幾乎都無→"fail"；有一兩項但薄弱→"warn"；多數項目充足→"ok"。

重要：evidence 的每一項都必須是你根據上面【頁面內文摘要】實際判斷出來的結果，不可以套用任何範例句子或制式說法交差；如果摘要裡真的找不到某一項的具體內容，就只寫「無」，不要杜撰細節。

只回傳 JSON，格式如下（<> 內是需要你自己填入的內容，不是可以照抄的範例文字）：
{"eeat":{"status":"<ok|warn|fail>","message":"<繁體中文一句話總結>","evidence":"作者資訊：<有/無>（<你判斷出的證據或留白>）｜專業證照：<有/無>（<證據或留白>）｜媒體報導：<有/無>（<證據或留白>）｜客戶評論：<有/無>（<證據或留白>）"}}`;
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
