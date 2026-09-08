import { LEVEL, CATEGORY } from './geo-audit-rules';
import type { CheckResult, CheckStatus } from './geo-audit-rules';

// ── GEO 深度健檢：AI 語意判斷層 ──────────────────────────
// 規則判不了的語意題，交給 AI（走 OpenRouter）：E-E-A-T 權威訊號足不足。
// Schema 完整度已改成純規則判斷（見 geo-schema-check.ts），不用再叫 AI 猜。
// 沒設 API key 或呼叫失敗時，回退成 warn（標「AI 未判斷」），不讓整個健檢炸掉。
// 這是每次免費健檢都要花錢的部分，先做出來，之後再決定要不要限流或設閘門。
//
// 2026-08-31 從 openai/gpt-4o（2024 年舊模型）換模型，原本想換 gpt-5-mini，
// 但實測發現它是推理模型（reasoning model）：completion tokens 大部分被內部
// 思考過程吃掉，max_tokens=500 常常在思考階段就用完，實際輸出的 content 是
// 空的，整個判斷直接回退成「AI 回覆無法解析」。改用 gpt-4.1-mini——非推理
// 模型，輸出穩定可預期，價格比 gpt-4o 更低（約 1/6），指令遵循也是更新一代
// 模型應有的水準（gpt-4o 曾經把 prompt 範例整段照抄回來當結果，見 commit
// d182bbb 的 bug 記錄）。
const MODEL = 'openai/gpt-4.1-mini';

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

// prompt 裡的【文字規範】是必要的，不是保險：這一項的 advice／impact 是模型直接生成的，
// 前端沒有任何過濾層擋得住它吐 E-E-A-T、JSON-LD 這種術語出來——要白話就得在源頭要求。
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

針對「無」或薄弱的項目，寫出這件事對這個品牌的實際影響——要根據這個頁面實際寫了什麼去講，不能是「會影響權威性」這種空泛的話。例如內文提到參與過講座、擔任業師、有具體專案案例，但沒有寫清楚也沒有外部連結佐證，就講「這些經歷 AI 讀不出來，別人問誰比較專業時你拿不出證據」。四項都已經足夠（status 是 "ok"）時，impact 留空字串。

【文字規範】message 與 impact 這兩欄會直接顯示給不懂技術的品牌經營者看：
- 只能用白話。不可以出現 E-E-A-T、schema、JSON-LD、author、Person、SERP、canonical 這類術語。
- 不可以是祈使句，不可以出現「建議」「請」「加上」「補上」「部署」這類字眼。這份報告的用途是讓對方知道問題在哪，不是教他怎麼修。
- 講「現在缺什麼、這對這個品牌的生意有什麼影響」，不要講怎麼做。
- evidence 欄不受此限，那欄是給技術人員看的，維持原本格式。

重要：evidence 跟 impact 都必須是你根據上面【頁面內文摘要】實際判斷出來的結果，不可以套用任何範例句子或制式說法交差；如果摘要裡真的找不到某一項的具體內容，evidence 就只寫「無」，不要杜撰細節。

只回傳 JSON，格式如下（<> 內是需要你自己填入的內容，不是可以照抄的範例文字）：
{"eeat":{"status":"<ok|warn|fail>","message":"<繁體中文一句話總結現況，白話，不含術語與建議>","evidence":"作者資訊：<有/無>（<你判斷出的證據或留白>）｜專業證照：<有/無>（<證據或留白>）｜媒體報導：<有/無>（<證據或留白>）｜客戶評論：<有/無>（<證據或留白>）","impact":"<這些缺口對這個品牌的實際影響，一到兩句白話，或空字串>"}}`;
}

function parseAiJson(text: string): {
  eeat?: { status?: string; message?: string; evidence?: string; impact?: string };
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

  const EEAT = { key: 'eeat', level: LEVEL.EFFICIENCY, category: CATEGORY.EXTERNAL, item: '網站看起來夠不夠可信' };

  // 跑不出結果時要老實說「這次沒判斷出來」，不能講成「沒問題」也不能講成「有問題」——
  // 跟 robots.txt 的三態同一個紀律。原因（缺 key、呼叫失敗）是我們的事，收進技術細節。
  const fallback = (reason: string): CheckResult[] => [
    {
      ...EEAT,
      status: 'warn',
      advice: '這一項這次沒有判斷出結果。',
      impact: '這一項是靠 AI 讀你的內容來判斷的，這次沒跑成功。不代表你的網站有問題，也不代表沒問題——過一陣子重跑通常就有結果。',
      technical: `未執行原因：${reason}`,
    },
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

  const message = parsed.eeat?.message ?? '（AI 未提供說明）';
  const impact = parsed.eeat?.impact?.trim();

  return [
    {
      ...EEAT,
      status: normStatus(parsed.eeat?.status),
      advice: message,
      impact: impact || undefined,
      // 四項信任訊號的逐項判定結果本來就是技術性的證據列，正好就是技術細節要放的東西
      evidence: parsed.eeat?.evidence,
    },
  ];
}
