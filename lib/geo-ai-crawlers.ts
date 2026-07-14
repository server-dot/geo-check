// ── GEO：AI 爬蟲可達性檢測 ────────────────────────────
// 純函式，吃 robots.txt 原始文字，判斷各家 AI 引擎的爬蟲 User-agent 有沒有被 Disallow。
// 不碰網路，方便單獨測試；比對邏輯簡化版（不處理 * / $ 萬用字元，用「路徑前綴＋最長匹配」判斷，
// 對多數 robots.txt 已足夠準確，複雜萬用字元規則建議人工複核）。

export interface AiBotResult {
  ua: string;      // User-agent 名稱（用來比對 robots.txt）
  label: string;   // 給人看的說明
  allowed: boolean;
  matchedRule: string; // 實際命中的規則（給證據用）
}

// 目前主流會抓取網站內容餵給生成式 AI 的爬蟲
const AI_BOTS: { ua: string; label: string }[] = [
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
type Group = { agents: string[]; rules: Rule[] };

// 解析 robots.txt 成一組組「User-agent 清單 + 規則清單」
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let currentAgents: string[] = [];
  let currentRules: Rule[] = [];

  const flush = () => {
    if (currentAgents.length) groups.push({ agents: currentAgents, rules: currentRules });
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();

    if (k === 'user-agent') {
      if (currentRules.length > 0) {
        // 已經開始收規則了，代表這是新的一組，先把前一組收掉
        flush();
        currentAgents = [value.trim()];
        currentRules = [];
      } else {
        // 還在列 User-agent 階段，同一組多個 agent
        currentAgents.push(value.trim());
      }
    } else if (k === 'allow' || k === 'disallow') {
      if (currentAgents.length === 0) continue; // 規則前面沒有 User-agent，忽略
      currentRules.push({ type: k, path: value.trim() });
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

// 針對路徑（預設網站根目錄 "/"）判斷是否被擋：比對所有前綴相符的規則，取最長匹配，同長度時 Allow 優先
function isBlocked(rules: Rule[], path = '/'): { blocked: boolean; matchedRule: string } {
  let best: Rule | null = null;
  for (const r of rules) {
    // 空值規則（例如 WordPress/Yoast 常見的「Disallow:」不接路徑）依規範代表「不限制任何路徑」，
    // 等同沒寫這條規則，必須跳過，否則會被誤判成「Disallow: /」（擋全站）
    if (r.path === '') continue;
    if (path.startsWith(r.path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) {
        best = r;
      }
    }
  }
  if (!best) return { blocked: false, matchedRule: '（無規則或規則為空值，預設允許）' };
  return { blocked: best.type === 'disallow', matchedRule: `${best.type === 'disallow' ? 'Disallow' : 'Allow'}: ${best.path}` };
}

// 主入口：吃 robots.txt 原始內容，回傳每個 AI bot 的可達性
export function checkAiCrawlerAccess(robotsTxt: string): AiBotResult[] {
  const groups = parseGroups(robotsTxt);
  return AI_BOTS.map(({ ua, label }) => {
    const rules = findRulesFor(groups, ua);
    if (!rules) return { ua, label, allowed: true, matchedRule: '（robots.txt 未提及，預設允許）' };
    const { blocked, matchedRule } = isBlocked(rules);
    return { ua, label, allowed: !blocked, matchedRule };
  });
}
