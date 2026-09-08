// ── GEO：WAF／CDN 指紋辨識 ────────────────────────────
// 純函式，吃 HTTP response headers，判斷擋下我們的是哪家 WAF/CDN。
// 不碰網路，方便單獨測試。
//
// 為什麼要做這個：「讀不到 robots.txt」對使用者來說是個死結——知道被擋，
// 但不知道是什麼東西在擋。辨識出廠商，那個死結才有名字。
// 命中率不是 100%（廠商會變更 headers、也可能被代理層剝掉），辨識不出來
// 就回 null，不要用猜的湊一個答案。
//
// impact 對八家廠商是同一句話——被誰擋不影響後果，後果都是「AI 讀不到你」。
// 廠商差別只在「去哪裡解」，那是 technical 的事，收進技術細節裡給懂的人看。
// 報告主文案不教操作步驟：知道自己被自家防火牆擋住 AI，已經是這一項要傳達的全部。

export interface WafHint {
  vendor: string;
  impact: string;
  technical: string;
}

interface WafSignature {
  vendor: string;
  technical: string;
  match: (headers: Headers) => boolean;
}

const SIGNATURES: WafSignature[] = [
  {
    // cf-mitigated: challenge 是 Cloudflare 明確標示「這個回應是攔截挑戰頁」，
    // 比單純的 server: cloudflare（很多網站只是用 Cloudflare 當 CDN，沒有攔截）精準得多。
    // 實測 104.com.tw、cw.com.tw 這類站都是這個訊號。
    vendor: 'Cloudflare（Bot 攔截／挑戰頁）',
    technical:
      '判定依據：回應帶 cf-mitigated: challenge，這是 Cloudflare 標示「本次回應是攔截挑戰頁」的專屬 header。攔截發生在讀 robots.txt 之前，所以 robots.txt 寫得再寬鬆也沒用。解法在 Cloudflare 後台「Security → Bots」：確認 Bot Fight Mode／Super Bot Fight Mode 沒有連好爬蟲一起擋掉，並在「Verified Bots」或自訂規則放行 GPTBot、ClaudeBot、PerplexityBot 的 User-Agent。',
    match: (h) => (h.get('cf-mitigated') ?? '').toLowerCase().includes('challenge'),
  },
  {
    vendor: 'Cloudflare',
    technical:
      '判定依據：回應帶 cf-ray header，或 server 標示 cloudflare。到後台「Security → WAF」檢查自訂規則與 Bot Fight Mode，確認沒有把 AI 爬蟲的 User-Agent 一起擋掉。',
    match: (h) => !!h.get('cf-ray') || /cloudflare/i.test(h.get('server') ?? ''),
  },
  {
    vendor: 'Akamai',
    technical:
      '判定依據：server 為 AkamaiGHost，或帶 x-akamai-transformed header。到 Bot Manager／Kona Site Defender 把 AI 爬蟲的 User-Agent 加進允許清單或自訂 Bot Category。',
    match: (h) => /akamaighost/i.test(h.get('server') ?? '') || h.has('x-akamai-transformed'),
  },
  {
    vendor: 'Imperva（Incapsula）',
    technical:
      '判定依據：帶 x-iinfo header，或 x-cdn 標示 incapsula。到 Bot Access Control／Advanced Bot Protection 把 AI 爬蟲加入白名單，或確認「Good Bots」規則有開啟。',
    match: (h) => h.has('x-iinfo') || /incapsula/i.test(h.get('x-cdn') ?? ''),
  },
  {
    vendor: 'Sucuri',
    technical:
      '判定依據：帶 x-sucuri-id header，或 server 標示 sucuri。到 Sucuri 後台的 WAF 設定把 AI 爬蟲的 User-Agent 加入白名單規則。',
    match: (h) => h.has('x-sucuri-id') || /sucuri/i.test(h.get('server') ?? ''),
  },
  {
    vendor: 'AWS CloudFront／WAF',
    technical:
      '判定依據：帶 x-amz-cf-id header，或 via／server 標示 cloudfront。檢查 AWS WAF 的 Bot Control 規則，把 AI 爬蟲的 User-Agent 從封鎖規則中排除。',
    match: (h) =>
      h.has('x-amz-cf-id') || /cloudfront/i.test(h.get('via') ?? '') || /cloudfront/i.test(h.get('server') ?? ''),
  },
  {
    vendor: 'Fastly',
    technical:
      '判定依據：帶 x-fastly-request-id header，或 via 標示 varnish。檢查 Fastly 的 Bot Management 或自訂 VCL 規則，確認沒有連 AI 爬蟲的 User-Agent 一起擋掉。',
    match: (h) => h.has('x-fastly-request-id') || /varnish/i.test(h.get('via') ?? ''),
  },
  {
    vendor: 'F5 BIG-IP',
    technical:
      '判定依據：server 標示 BIG-IP（ASM／Advanced WAF）。檢查 Bot Defense／Bot Signature 設定，把 AI 爬蟲的 User-Agent 排除在封鎖規則外。',
    match: (h) => /big-?ip/i.test(h.get('server') ?? ''),
  },
];

// 八家共用同一句影響說明——差別只在廠商名字，後果完全一樣。
function impactFor(vendor: string): string {
  return `你的網站防火牆（${vendor}）把我們的檢測請求當成可疑流量攔了下來。AI 爬蟲來的時候多半也是同一個下場：它讀不到你的頁面，就不會拿你的內容當答案。這種情況最麻煩的地方在於，你自己用瀏覽器打開網站一切正常，完全看不出來 AI 那邊進不來。`;
}

export function detectWaf(headers: Headers): WafHint | null {
  for (const sig of SIGNATURES) {
    if (sig.match(headers)) return { vendor: sig.vendor, impact: impactFor(sig.vendor), technical: sig.technical };
  }
  return null;
}
