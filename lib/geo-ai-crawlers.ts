// ── GEO：AI 爬蟲可達性檢測 ────────────────────────────
// 純函式，吃 robots.txt 原始文字，判斷各家 AI 引擎的爬蟲 User-agent 有沒有被 Disallow。
// 不碰網路，方便單獨測試。路徑比對支援規範裡僅有的兩個特殊字元（* 與結尾的 $），
// 判斷順序為「最長匹配優先，同長度時 Allow 優先」。

// 三態而非布林：讀不到 robots.txt 時必須能表達「無法判定」。
// 若只有 allowed true/false，抓不到的情況會被迫歸到其中一邊，
// 而歸到 allowed 就是給假綠燈——這正是 104、天下這類 WAF 網站會踩到的坑。
//
// mismatch 是第四種狀態，這個檔案本身（純函式、只讀 robots.txt 文字）不會產生它——
// 是 route 層拿 bot 的實際 User-Agent 去打網站驗證後才可能出現的落差：
// robots.txt 說允許，但 WAF 實際上把這個 UA 擋在門外，網站主自己可能都不知道。
export type BotStatus = 'allowed' | 'blocked' | 'unknown' | 'mismatch';

// robots.txt 的抓取結果：真的沒有（none）跟我們讀不到（unreachable）意義完全不同，不能混為一談。
export type RobotsStatus = 'found' | 'none' | 'unreachable';

export interface AiBotResult {
  ua: string;      // User-agent 名稱（用來比對 robots.txt）
  label: string;   // 給人看的說明
  status: BotStatus;
  matchedRule: string; // 實際命中的規則（給證據用）
}

// 目前主流會抓取網站內容餵給生成式 AI 的爬蟲。export 出去給首頁「已檢測 N 家 AI
// 爬蟲」那句文案用 AI_BOTS.length，不要在行銷頁另外手動寫死一個數字。
export const AI_BOTS: { ua: string; label: string }[] = [
  { ua: 'GPTBot', label: 'ChatGPT（OpenAI 一般爬蟲）' },
  { ua: 'OAI-SearchBot', label: 'ChatGPT 搜尋（OpenAI）' },
  { ua: 'ChatGPT-User', label: 'ChatGPT 即時瀏覽（OpenAI）' },
  { ua: 'ClaudeBot', label: 'Claude（Anthropic）' },
  { ua: 'Google-Extended', label: 'Gemini / AI Overview（Google）' },
  { ua: 'PerplexityBot', label: 'Perplexity' },
  { ua: 'CCBot', label: 'Common Crawl（多數 LLM 訓練資料來源）' },
  { ua: 'Bytespider', label: '抖音／字節跳動 AI' },
];

type Rule = { type: 'allow' | 'disallow'; path: string };
type Group = { agents: string[]; rules: Rule[]; contentSignal: string };

// 解析 robots.txt 成一組組「User-agent 清單 + 規則清單 + Content-Signal」
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let currentAgents: string[] = [];
  let currentRules: Rule[] = [];
  let currentSignal = '';

  const flush = () => {
    if (currentAgents.length) {
      groups.push({ agents: currentAgents, rules: currentRules, contentSignal: currentSignal });
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();

    if (k === 'user-agent') {
      if (currentRules.length > 0 || currentSignal) {
        // 已經開始收規則了，代表這是新的一組，先把前一組收掉
        flush();
        currentAgents = [value.trim()];
        currentRules = [];
        currentSignal = '';
      } else {
        // 還在列 User-agent 階段，同一組多個 agent
        currentAgents.push(value.trim());
      }
    } else if (k === 'allow' || k === 'disallow') {
      if (currentAgents.length === 0) continue; // 規則前面沒有 User-agent，忽略
      currentRules.push({ type: k, path: value.trim() });
    } else if (k === 'content-signal') {
      if (currentAgents.length === 0) continue;
      currentSignal = value.trim();
    }
  }
  flush();
  return groups;
}

// 找出某個 bot 適用的規則群組：先找精確比對，沒有就退回 *（萬用）
function findRulesFor(groups: Group[], botUa: string): Rule[] | null {
  const lower = botUa.toLowerCase();
  const exact = groups.find((g) => g.agents.some((a) => a.toLowerCase() === lower));
  if (exact) return exact.rules;
  const wildcard = groups.find((g) => g.agents.includes('*'));
  return wildcard ? wildcard.rules : null;
}

// 把規則路徑編譯成正規表達式。robots.txt 規範只有兩個特殊字元：
//   *  任意字串
//   $  只有放在結尾時有意義，代表網址到此為止（精確結尾）
// 其餘字元一律當字面值，所以要先跳脫再把 * 換回萬用。
// 少了這層，「Disallow: / + Allow: /$」（擋全站但開放首頁，104 就是這樣寫）
// 會因為 "/" 不以 "/$" 開頭而漏掉那條 Allow，首頁被誤判成被擋。
function ruleToRegExp(rulePath: string): RegExp {
  const endAnchored = rulePath.endsWith('$');
  const body = endAnchored ? rulePath.slice(0, -1) : rulePath;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${endAnchored ? '$' : ''}`);
}

// 針對路徑（預設網站根目錄 "/"）判斷是否被擋：比對所有相符的規則，取最長匹配，同長度時 Allow 優先
function isBlocked(rules: Rule[], path = '/'): { blocked: boolean; matchedRule: string } {
  let best: Rule | null = null;
  for (const r of rules) {
    // 空值規則（例如 WordPress/Yoast 常見的「Disallow:」不接路徑）依規範代表「不限制任何路徑」，
    // 等同沒寫這條規則，必須跳過，否則會被誤判成「Disallow: /」（擋全站）
    if (r.path === '') continue;
    if (!ruleToRegExp(r.path).test(path)) continue;
    // 長度比較用規則原文：「/$」(2) 比「/」(1) 精確，所以精確開放首頁會蓋過擋全站
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) {
      best = r;
    }
  }
  if (!best) return { blocked: false, matchedRule: '（無規則或規則為空值，預設允許）' };
  return { blocked: best.type === 'disallow', matchedRule: `${best.type === 'disallow' ? 'Disallow' : 'Allow'}: ${best.path}` };
}

// ── Content Signals ─────────────────────────────────────
// Cloudflare 於 2025-09 提出、寫在 robots.txt 裡的新欄位，已隨其代管設定鋪到數百萬網域，
// IETF 的 AIPREF 工作組正在標準化中。格式：
//   Content-Signal: search=yes, ai-input=yes, ai-train=no
// 它表達的是「抓取之後可以拿來幹嘛」，跟 Allow/Disallow 的「能不能抓」是兩回事——
// 爬蟲進得來，不代表你同意它拿去訓練模型或當成 AI 回答的來源。
export type SignalValue = 'yes' | 'no' | 'unset';

export interface ContentSignalItem {
  key: 'search' | 'ai-input' | 'ai-train';
  label: string;
  meaning: string;
  value: SignalValue;
}

export interface ContentSignals {
  declared: boolean; // 網站有沒有寫這個欄位
  raw: string;
  items: ContentSignalItem[];
}

const SIGNAL_META: { key: ContentSignalItem['key']; label: string; meaning: string }[] = [
  { key: 'search', label: '搜尋索引', meaning: '建立搜尋索引並提供搜尋結果（不含 AI 生成的摘要）' },
  { key: 'ai-input', label: 'AI 回答引用', meaning: '把你的內容當成 AI 回答的參考來源（AI 摘要、RAG）' },
  { key: 'ai-train', label: 'AI 模型訓練', meaning: '把你的內容拿去訓練或微調 AI 模型' },
];

// 從 robots.txt 取出 Content-Signal。以萬用（*）群組為準——
// 這是站台層級的聲明，Cloudflare 的代管設定也寫在 * 底下。
export function parseContentSignals(robotsTxt: string): ContentSignals {
  const groups = parseGroups(robotsTxt);
  const raw =
    groups.find((g) => g.agents.includes('*') && g.contentSignal)?.contentSignal ??
    groups.find((g) => g.contentSignal)?.contentSignal ??
    '';

  const parsed = new Map<string, SignalValue>();
  for (const part of raw.split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim().toLowerCase());
    if (k && (v === 'yes' || v === 'no')) parsed.set(k, v);
  }

  return {
    declared: raw !== '',
    raw,
    items: SIGNAL_META.map((m) => ({ ...m, value: parsed.get(m.key) ?? 'unset' })),
  };
}

// 主入口：吃 robots.txt 原始內容與抓取狀態，回傳每個 AI bot 的可達性。
// robotsStatus 一定要傳實際狀態——unreachable 時全部標 unknown，
// 不可以退回「預設允許」，那會讓擋光光的網站拿到全綠燈。
export function checkAiCrawlerAccess(
  robotsTxt: string,
  robotsStatus: RobotsStatus = 'found',
): AiBotResult[] {
  if (robotsStatus === 'unreachable') {
    return AI_BOTS.map(({ ua, label }) => ({
      ua,
      label,
      status: 'unknown' as const,
      matchedRule: '（讀不到 robots.txt，無法判定）',
    }));
  }

  if (robotsStatus === 'none') {
    return AI_BOTS.map(({ ua, label }) => ({
      ua,
      label,
      status: 'allowed' as const,
      matchedRule: '（網站沒有 robots.txt，依規範預設允許）',
    }));
  }

  const groups = parseGroups(robotsTxt);
  return AI_BOTS.map(({ ua, label }) => {
    const rules = findRulesFor(groups, ua);
    if (!rules) {
      return { ua, label, status: 'allowed' as const, matchedRule: '（robots.txt 未提及，預設允許）' };
    }
    const { blocked, matchedRule } = isBlocked(rules);
    return { ua, label, status: blocked ? ('blocked' as const) : ('allowed' as const), matchedRule };
  });
}
