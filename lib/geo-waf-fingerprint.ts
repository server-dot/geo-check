// ── GEO：WAF／CDN 指紋辨識 ────────────────────────────
// 純函式，吃 HTTP response headers，判斷擋下我們的是哪家 WAF/CDN。
// 不碰網路，方便單獨測試。
//
// 為什麼要做這個：「讀不到 robots.txt」對使用者來說是個死結——知道被擋，
// 但不知道去哪裡解。這裡辨識出廠商後給的是「去哪個後台、開哪個設定」的
// 具體操作建議，不是「請聯絡你的網站管理員」這種空話。
// 命中率不是 100%（廠商會變更 headers、也可能被代理層剝掉），辨識不出來
// 就回 null，不要用猜的湊一個答案。

export interface WafHint {
  vendor: string;
  advice: string;
}

interface WafSignature {
  vendor: string;
  advice: string;
  match: (headers: Headers) => boolean;
}

const SIGNATURES: WafSignature[] = [
  {
    // cf-mitigated: challenge 是 Cloudflare 明確標示「這個回應是攔截挑戰頁」，
    // 比單純的 server: cloudflare（很多網站只是用 Cloudflare 當 CDN，沒有攔截）精準得多。
    // 實測 104.com.tw、cw.com.tw 這類站都是這個訊號。
    vendor: 'Cloudflare（Bot 攔截／挑戰頁）',
    advice:
      '到 Cloudflare 後台「Security → Bots」，確認 Bot Fight Mode／Super Bot Fight Mode 有沒有連好爬蟲一起擋掉，並在「Verified Bots」或自訂規則中放行 GPTBot、ClaudeBot、PerplexityBot 等 AI 爬蟲的 User-Agent。',
    match: (h) => (h.get('cf-mitigated') ?? '').toLowerCase().includes('challenge'),
  },
  {
    vendor: 'Cloudflare',
    advice:
      '網站掛在 Cloudflare 後面。到 Cloudflare 後台「Security → WAF」檢查自訂規則或 Bot Fight Mode，確認沒有把 AI 爬蟲的 User-Agent 一起擋掉。',
    match: (h) => !!h.get('cf-ray') || /cloudflare/i.test(h.get('server') ?? ''),
  },
  {
    vendor: 'Akamai',
    advice:
      '疑似使用 Akamai。到 Akamai 後台的 Bot Manager／Kona Site Defender，把這些 AI 爬蟲的 User-Agent 加進允許清單或自訂 Bot Category。',
    match: (h) => /akamaighost/i.test(h.get('server') ?? '') || h.has('x-akamai-transformed'),
  },
  {
    vendor: 'Imperva（Incapsula）',
    advice:
      '疑似使用 Imperva（Incapsula）。到後台的 Bot Access Control／Advanced Bot Protection，把 AI 爬蟲加入白名單，或確認「Good Bots」規則有開啟。',
    match: (h) => h.has('x-iinfo') || /incapsula/i.test(h.get('x-cdn') ?? ''),
  },
  {
    vendor: 'Sucuri',
    advice: '疑似使用 Sucuri。到 Sucuri 後台的 WAF 設定，把這些 AI 爬蟲的 User-Agent 加入白名單規則。',
    match: (h) => h.has('x-sucuri-id') || /sucuri/i.test(h.get('server') ?? ''),
  },
  {
    vendor: 'AWS CloudFront／WAF',
    advice:
      '疑似使用 AWS CloudFront 或 AWS WAF。檢查 WAF 的 Bot Control 規則，把這些 AI 爬蟲的 User-Agent 從封鎖規則中排除。',
    match: (h) =>
      h.has('x-amz-cf-id') || /cloudfront/i.test(h.get('via') ?? '') || /cloudfront/i.test(h.get('server') ?? ''),
  },
  {
    vendor: 'Fastly',
    advice:
      '疑似使用 Fastly。檢查 Fastly 的 Bot Management 或自訂 VCL 規則，確認沒有連這些 AI 爬蟲的 User-Agent 一起擋掉。',
    match: (h) => h.has('x-fastly-request-id') || /varnish/i.test(h.get('via') ?? ''),
  },
  {
    vendor: 'F5 BIG-IP',
    advice:
      '疑似使用 F5 BIG-IP（ASM／Advanced WAF）。檢查 Bot Defense／Bot Signature 設定，將這些 AI 爬蟲的 User-Agent 排除在封鎖規則外。',
    match: (h) => /big-?ip/i.test(h.get('server') ?? ''),
  },
];

export function detectWaf(headers: Headers): WafHint | null {
  for (const sig of SIGNATURES) {
    if (sig.match(headers)) return { vendor: sig.vendor, advice: sig.advice };
  }
  return null;
}
