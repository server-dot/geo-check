import { NextRequest, NextResponse } from 'next/server';
import {
  checkAiCrawlerAccess,
  parseContentSignals,
  type RobotsStatus,
} from '@/lib/geo-ai-crawlers';
import { analyzeContentVisibility, type ContentVisibility } from '@/lib/geo-content-visibility';

// GEO 健檢：抓目標網站的 robots.txt 判斷 AI 爬蟲能不能進來，
// 再抓一次首頁原始 HTML 看 AI 實際讀得到什麼內容（不執行 JS，就是 AI 看到的版本）。
// 兩個請求並行，同步回應（很快，不用背景 job + 輪詢）。
export const maxDuration = 30;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TIMEOUT_MS = 10000;

function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    headers: { 'User-Agent': UA, Accept: accept },
    signal: controller.signal,
    redirect: 'follow',
  }).finally(() => clearTimeout(timer));
}

// 連線層失敗（DNS、憑證、逾時）時給出說得出原因的訊息。
// 一律回「連不到這個網站」等於把憑證問題和打錯字混在一起，使用者無從修。
function describeFetchError(err: unknown, host: string): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  const code = cause?.code ?? '';
  const message = cause?.message ?? '';

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `找不到 ${host} 這個網域，請確認網址是否拼錯`;
  }
  if (/certificate|altnames|ERR_TLS/i.test(code + message)) {
    return `${host} 的 HTTPS 憑證與網域不符，無法安全連線（可以試試改成 www.${host}）`;
  }
  if ((err as Error)?.name === 'AbortError' || /TIMEOUT/i.test(code)) {
    return `連線 ${host} 逾時（超過 ${TIMEOUT_MS / 1000} 秒），網站可能太慢或擋住了我們`;
  }
  return `連不到 ${host}，請確認網址是否正確`;
}

interface RobotsOutcome {
  status: RobotsStatus;
  text: string;
  url: string;
  note: string;
}

async function fetchRobots(origin: string): Promise<RobotsOutcome> {
  const requested = `${origin}/robots.txt`;
  const res = await fetchWithTimeout(requested, 'text/plain,*/*');
  // 跟隨轉址後才是規則的真正來源（輸入 nytimes.com 實際讀到的是 www.nytimes.com）
  const url = res.url || requested;

  if (res.ok) {
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    // 有些站對不存在的路徑回 200 + HTML 錯誤頁（soft 404）。
    // 把 HTML 當 robots.txt 解析只會產生垃圾結論，一律視為讀不到。
    if (/text\/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(text)) {
      return {
        status: 'unreachable',
        text: '',
        url,
        note: `伺服器回傳 HTML 而不是純文字（HTTP ${res.status}），這不是有效的 robots.txt`,
      };
    }
    return { status: 'found', text, url, note: '' };
  }

  if (res.status === 404 || res.status === 410) {
    // 真的沒有 robots.txt。依規範代表不設限，這時候的綠燈是正確的
    return { status: 'none', text: '', url, note: `HTTP ${res.status}，網站確實沒有放 robots.txt` };
  }

  // 403 / 429 / 5xx：讀不到不等於沒設限。台灣不少網站（104、天下）用 WAF 擋掉
  // server-side fetch，若當成「沒有 robots.txt」就會給出「AI 全部可存取」的假綠燈，
  // 而實際上它們是 Disallow: / 擋掉所有 AI bot，結論完全相反。
  return {
    status: 'unreachable',
    text: '',
    url,
    note:
      res.status === 403 || res.status === 429
        ? `HTTP ${res.status}，網站的防爬／WAF 機制擋下了我們的檢測`
        : `HTTP ${res.status}，伺服器沒有正常回應`,
  };
}

// 抓首頁原始 HTML。失敗不算致命——robots.txt 的結論還是有效的，
// 只是少了「AI 讀到什麼」這一段，所以回 null 讓呼叫端略過。
async function fetchHomepage(origin: string): Promise<{ html: string | null; note: string }> {
  try {
    const res = await fetchWithTimeout(origin, 'text/html,application/xhtml+xml,*/*');
    if (!res.ok) return { html: null, note: `首頁回傳 HTTP ${res.status}，無法分析內容` };
    return { html: await res.text(), note: '' };
  } catch {
    return { html: null, note: '抓不到首頁，無法分析 AI 讀得到的內容' };
  }
}

// llms.txt（llmstxt.org）：放在根目錄、給 AI 看的網站導覽。
// 回傳 null 代表「不確定」——跟 robots.txt 同一個原則：被 WAF 擋下時不能說人家沒有。
// 只有明確的 404/410 才算真的沒部署。
async function checkLlmsTxt(origin: string): Promise<boolean | null> {
  try {
    const res = await fetchWithTimeout(`${origin}/llms.txt`, 'text/plain,text/markdown,*/*');
    if (res.status === 404 || res.status === 410) return false;
    if (!res.ok) return null; // 403 / 5xx：讀不到，不代表沒有
    const contentType = res.headers.get('content-type') ?? '';
    if (/text\/html/i.test(contentType)) return false; // soft-404：回首頁 HTML 當作沒有
    const text = await res.text();
    return !/^\s*<(!doctype|html)/i.test(text);
  } catch {
    return null; // 抓不到就別亂講有或沒有
  }
}

export async function POST(req: NextRequest) {
  let input: string | undefined;
  try {
    const body = (await req.json()) as { url?: string };
    input = body.url?.trim();
  } catch {
    // body 不是合法 JSON。不接住的話 req.json() 會往外拋成 500
    return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
  }
  if (!input) return NextResponse.json({ error: '請輸入要檢測的網址' }, { status: 400 });

  let origin: string;
  let host: string;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('unsupported protocol');
    origin = u.origin;
    host = u.host;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  let robots: RobotsOutcome;
  let homepage: { html: string | null; note: string };
  let hasLlmsTxt: boolean | null;
  try {
    [robots, homepage, hasLlmsTxt] = await Promise.all([
      fetchRobots(origin),
      fetchHomepage(origin),
      checkLlmsTxt(origin),
    ]);
  } catch (err) {
    // robots.txt 連線層就失敗，代表整個網站連不上，沒有什麼可以報告的
    return NextResponse.json({ error: describeFetchError(err, host) }, { status: 502 });
  }

  const results = checkAiCrawlerAccess(robots.text, robots.status);
  const visibility: ContentVisibility | null = homepage.html
    ? analyzeContentVisibility(homepage.html)
    : null;
  // 只有「讀不到」時才不談 Content-Signal——那是狀態不明，不能說人家沒宣告。
  // 沒有 robots.txt（none）則確定沒宣告，照樣給出說明。
  const contentSignals =
    robots.status === 'unreachable' ? null : parseContentSignals(robots.text);

  return NextResponse.json({
    ok: true,
    origin,
    robotsUrl: robots.url,
    robotsStatus: robots.status,
    robotsNote: robots.note,
    results,
    visibility,
    visibilityNote: homepage.note,
    contentSignals,
    hasLlmsTxt,
  });
}
