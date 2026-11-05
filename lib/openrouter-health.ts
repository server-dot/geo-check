// ── OpenRouter 額度不足偵測 ─────────────────────────────────
// 2026-11-04：key 額度用完（「can only afford 111」），品牌輪廓、評價、推薦名單這些 AI 步驟
// 全部 .catch(() => null) 靜默失敗，報告只是少幾塊、看不出壞了，正式站也一起壞。
// 每個呼叫點失敗時回報到這裡；健檢結束時查這段期間有沒有發生過，有就在報告上標出來＋寫 log。

let lastCreditFailAt = 0;

export function isCreditError(status: number, body: string): boolean {
  return status === 402 || /more credits|can only afford|insufficient credits|credit limit/i.test(body);
}

export function noteOpenRouterFailure(status: number, body: string): void {
  if (!isCreditError(status, body)) return;
  lastCreditFailAt = Date.now();
  console.error(`[openrouter] 額度不足，AI 分析步驟失敗（HTTP ${status}）：${body.slice(0, 200)}`);
}

export function creditFailedSince(since: number): boolean {
  return lastCreditFailAt >= since;
}
