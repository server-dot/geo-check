import { detectWaf } from './geo-waf-fingerprint';

// ── GEO：AI 爬蟲實測驗證 ──────────────────────────────
// robots.txt 只是網站「說」它允許誰，是榮譽制——遵守規範的爬蟲才會看它。
// WAF／CDN 的擋爬規則是完全另一套系統，可能對某個 bot 的 User-Agent 直接擋下，
// 跟 robots.txt 寫了什麼毫無關係。只讀 robots.txt 判斷「可存取」是一種推論，
// 不是驗證——這裡拿 bot 實際的 User-Agent 字串真的打一次網站，把推論變成實測。
//
// 老實講的限制：進階 WAF（例如 Cloudflare Verified Bots）不只看 User-Agent，
// 還會核對來源 IP 是否屬於 OpenAI／Anthropic 官方 IP 段。我們的探測請求不是從
// 那些官方 IP 發出的，所以真正的 bot 進得去，我們的探測仍可能被擋——
// 這裡只能誠實地說「UA 測試顯示被擋」，不能講成「這個 bot 一定進不去」。

export interface ProbeResult {
  reachable: boolean | null; // null＝探測本身失敗（逾時、連線錯誤），無法判斷
  httpStatus: number | null;
  note: string;
}

const TIMEOUT_MS = 8000;

async function probeOne(origin: string, ua: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(origin, {
      headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (res.ok) return { reachable: true, httpStatus: res.status, note: `實測回應 HTTP ${res.status}，請求真的進得去` };

    const waf = detectWaf(res.headers);
    return {
      reachable: false,
      httpStatus: res.status,
      note: waf
        ? `實測被擋（HTTP ${res.status}，疑似 ${waf.vendor}）`
        : `實測回應 HTTP ${res.status}，疑似被擋下`,
    };
  } catch {
    return { reachable: null, httpStatus: null, note: '實測請求逾時或失敗，無法判斷' };
  } finally {
    clearTimeout(timer);
  }
}

// 對一批 bot 的 User-Agent 並行探測同一個網址。
// 呼叫端只該把「政策層判定允許」的 bot 傳進來——政策已經擋掉的不用再測，
// 守規矩的爬蟲本來就不會硬闖被 Disallow 的網站。
export async function probeBotAccess(origin: string, uas: string[]): Promise<Map<string, ProbeResult>> {
  const entries = await Promise.all(uas.map(async (ua) => [ua, await probeOne(origin, ua)] as const));
  return new Map(entries);
}
