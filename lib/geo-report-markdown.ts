import type { AuditJob } from './geo-audit-jobs';
import { buildCategories5, computeOverallScore } from './geo-score';
import { tallyCitedDomains } from './geo-cited-domains';
import { summarizeSources, sourceHeadline, SOURCE_KIND_META } from './geo-citation-sources';
import { sortByOrder } from './geo-audit-rules';
import { SITE_NAME } from '@/lib/site';

// ── GEO：報告的 AI 可讀版（Markdown）─────────────────────
// 這份報告整頁在講「AI 讀不讀得到你的內容」：可讀字數、選單佔比、JS 空殼、
// llms.txt。但報告本身是一個 React 頁面，內容全靠前端渲染出來——AI 爬蟲抓下去
// 只會拿到一坨骨架，等於我們自己就是自己檢測項目的反例。這個模組把同一份
// 結果輸出成純 Markdown，讓報告頁能提供一個「AI 讀得到」的版本。
//
// 刻意不做的事：不吃網域當網址（/md/example.com 那種），只吃 job id。
// job id 是隨機的、一小時就過期，等於只有拿到報告的人看得到自己那一份——
// 別人的健檢結果不該因為知道網域就被翻出來。
//
// 分數算法跟畫面共用 geo-score.ts，不在這裡重算一遍，避免兩邊數字對不上。

const STATUS_LABEL: Record<string, string> = { ok: '正常', warn: '可優化', fail: '需處理' };

const BOT_STATUS_LABEL: Record<string, string> = {
  allowed: '可存取',
  blocked: '被擋',
  unknown: '無法判定',
  mismatch: '政策允許但實測被擋',
};

function esc(text: string): string {
  // 表格欄位裡的 | 會把欄位切開，換行會把列切開
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function buildReportMarkdown(job: AuditJob): string {
  const engine = job.engine;
  const audit = job.result;
  const host = job.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const out: string[] = [];

  out.push(`# ${host}｜AI 搜尋能見度健檢報告`);
  out.push('');
  out.push(`> 檢測網址：${job.url}　·　檢測時間：${new Date(job.createdAt).toISOString()}　·　工具：${SITE_NAME}（geo.stack.com.tw）`);
  out.push('');
  out.push(
    '_這是同一份報告的純文字版，給 AI 與其他程式讀。內容與畫面上的報告一致，' +
      '數值都是這次實際量到的；AI 引擎的回答會隨時間與問法變動，屬於當下快照，不是趨勢。_',
  );
  out.push('');

  if (!engine) {
    out.push('這份健檢還沒跑完，暫時沒有結果可以輸出。');
    return out.join('\n');
  }

  // ── 總分 ──
  const categories = buildCategories5(engine, audit);
  const overall = computeOverallScore(categories);
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const c of categories) {
    counts.ok += c.ok;
    counts.warn += c.warn;
    counts.fail += c.fail;
  }

  out.push('## 總分');
  out.push('');
  out.push(`- 總分：${overall.score} / 100（${overall.grade} 級・${overall.gradeLabel}）`);
  out.push(`- 項目統計：正常 ${counts.ok} 項、可優化 ${counts.warn} 項、需處理 ${counts.fail} 項`);
  out.push(`- 算法：五個分類各自的通過率平均（${categories.map((c) => c.passRate).join('＋')}）÷ ${categories.length}`);
  out.push('');
  out.push('| 分類 | 通過率 | 正常 | 可優化 | 需處理 |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const c of categories) out.push(`| ${c.name} | ${c.passRate} | ${c.ok} | ${c.warn} | ${c.fail} |`);
  out.push('');

  // ── AI 爬蟲存取（實測，不是只讀 robots.txt）──
  out.push('## AI 爬蟲存取權限');
  out.push('');
  out.push(`規則來源：${engine.robotsUrl}${engine.robotsNote ? `（${esc(engine.robotsNote)}）` : ''}`);
  out.push('');
  out.push('判定方式：先讀 robots.txt 的規則，政策允許的再用該爬蟲的 User-Agent 實際發一次請求對照。「政策允許但實測被擋」代表 robots.txt 寫允許、但 WAF／CDN 實際擋下了。');
  out.push('');
  out.push('| 爬蟲 | User-Agent | 判定 | 依據 |');
  out.push('| --- | --- | --- | --- |');
  for (const b of engine.results) {
    out.push(`| ${esc(b.label)} | ${esc(b.ua)} | ${BOT_STATUS_LABEL[b.status] ?? b.status} | ${esc(b.matchedRule)} |`);
  }
  out.push('');

  // ── 內容使用授權 ──
  if (engine.contentSignals) {
    const cs = engine.contentSignals;
    const yn = (v: string) => (v === 'yes' ? '允許' : v === 'no' ? '不允許' : '未表態');
    out.push('## 內容使用授權（Content Signals）');
    out.push('');
    for (const i of cs.items) out.push(`- ${i.label}：${yn(i.value)}（${i.meaning}）`);
    if (cs.raw) out.push(`- 原始宣告：\`${esc(cs.raw)}\``);
    if (!cs.declared) out.push('- 這個網站三項都還沒表態，等於留給各家 AI 引擎自己認定要不要這樣用你的內容。');
    out.push('');
  }

  // ── llms.txt ──
  out.push('## llms.txt');
  out.push('');
  if (engine.llmsTxt.exists === null) out.push('讀不到（可能被 WAF 擋下），無法判定有沒有部署。');
  else if (!engine.llmsTxt.exists) out.push('沒有部署 llms.txt。');
  else {
    const q = engine.llmsTxt.quality;
    out.push(`已部署，${q?.status === 'ok' ? '格式完整' : '內容單薄'}，共 ${q?.links.length ?? 0} 個連結、${q?.charCount ?? 0} 字。`);
    if (q?.advice) out.push('', esc(q.advice));
  }
  out.push('');

  // ── AI 讀到的內容 ──
  if (engine.visibility) {
    const v = engine.visibility;
    out.push('## AI 讀到的內容');
    out.push('');
    out.push(`- 可讀字數：${v.textLength} 字（正文 ${v.substantiveChars} 字、選單／標籤 ${v.furnitureChars} 字）`);
    out.push(`- 原始 HTML 長度：${v.htmlLength}、\`<script>\` 數量：${v.scriptCount}`);
    out.push(`- 頁面標題：${esc(v.title)}`);
    if (v.description) out.push(`- 頁面描述：${esc(v.description)}`);
    if (v.h1.length > 0) out.push(`- H1：${v.h1.map(esc).join('／')}`);
    if (v.jsonLdTypes.length > 0) out.push(`- 結構化資料型別：${v.jsonLdTypes.join('、')}`);
    out.push('', esc(v.summary));
    out.push('');
  }

  // ── AI 認不認得你 ──
  if (engine.brandVisibility.length > 0) {
    out.push('## AI 認不認得你（實際去問）');
    out.push('');
    for (const r of engine.brandVisibility) {
      out.push(`### ${r.engine}`);
      out.push('');
      out.push(`- 判定：${r.citedSelf ? '引用了你自己的網站' : '沒有引用你自己的網站'}`);
      out.push(`- 問題：${esc(r.query)}`);
      out.push('');
      out.push('回答原文：');
      out.push('');
      out.push(r.answer.split('\n').map((l) => `> ${l}`).join('\n'));
      out.push('');
      if (r.citations.length > 0) {
        out.push('引用來源：');
        out.push('');
        for (const c of r.citations) out.push(`- ${c.isSelf ? '★ ' : ''}[${esc(c.title)}](${c.url})`);
        out.push('');
      }
    }
  }

  // ── 推薦題（AI 推不推你）──
  const rec = job.recommendVisibility;
  if (rec) {
    out.push('## AI 推不推薦你（自動問的推薦題）');
    out.push('');
    out.push(
      `這 ${rec.questions.length} 題是 AI 讀過首頁後猜「一般人找這類服務時會怎麼問」寫出來的，題目裡沒有品牌名。` +
        `題目是推估，不是真實搜尋量。提問時間：${rec.askedAt}。`,
    );
    out.push('');
    out.push(`- ${rec.totalAnswers} 次回答中，有 ${rec.namedSelfCount} 次把你寫進答案。`);
    out.push(
      `- 另有 ${rec.citedSelfCount - rec.namedSelfCount} 次，你的網址只出現在引用清單裡、答案正文沒提到你` +
        `（「被引用」不等於「被推薦」——搜尋型模型一個回答會列十幾筆查過的來源）。`,
    );
    if (rec.names.length > 0) {
      out.push('');
      out.push('AI 在回答裡點名推薦的對象（依被點名次數排序）：');
      out.push('');
      out.push('| 名稱 | 次數 | 引擎 | 是不是你 |');
      out.push('| --- | --- | --- | --- |');
      for (const n of rec.names) out.push(`| ${esc(n.name)} | ${n.count} | ${n.engines.join('、')} | ${n.isSelf ? '是' : '' } |`);
    }
    out.push('');
    for (const q of rec.questions) {
      out.push(`### 「${esc(q.question)}」`);
      out.push('');
      for (const r of q.results) {
        out.push(
          `**${r.engine}**：${r.namedSelf ? '🟢 答案裡推薦了你' : r.citedSelf ? '🟡 查過你，但答案裡沒推薦你' : '🔴 沒有推薦你'}`,
        );
        out.push('');
        out.push(r.answer.split('\n').map((l) => `> ${l}`).join('\n'));
        out.push('');
        if (r.citations.length > 0) {
          out.push('引用來源：' + r.citations.map((c) => `${c.isSelf ? '★ ' : ''}${c.url}`).join('、'));
          out.push('');
        }
      }
    }

    const cited = tallyCitedDomains(
      rec.questions.flatMap((q) => q.results.map((r) => ({ keyword: q.question, citations: r.citations }))),
    );
    if (cited.length > 0) {
      out.push('### 這些題目底下，AI 引用了哪些網站');
      out.push('');
      out.push('| 網域 | 被引用次數 | 出現在幾題 | 是不是你 |');
      out.push('| --- | --- | --- | --- |');
      for (const d of cited.slice(0, 20)) out.push(`| ${d.domain} | ${d.count} | ${d.keywords.length} | ${d.isSelf ? '是' : ''} |`);
      out.push('');
    }

    // 行銷部門那一區：同一批引用來源，依「行銷能不能自己動手」分類
    const breakdown = summarizeSources(
      rec.questions.flatMap((q) =>
        q.results.flatMap((r) => r.citations.map((c) => ({ keyword: q.question, url: c.url, title: c.title, isSelf: c.isSelf }))),
      ),
    );
    if (breakdown.total > 0) {
      out.push('### 行銷部門自己能做的：AI 引用的來源裡，哪些不用工程師也能去佈局');
      out.push('');
      out.push(sourceHeadline(breakdown));
      out.push('');
      for (const k of breakdown.kinds) {
        const meta = SOURCE_KIND_META[k.kind];
        out.push(`**${meta.label}**：${k.count} 次、${k.domains} 個網域、${Math.round(k.share * 100)}%——${meta.action}`);
        for (const t of k.targets.slice(0, 5)) out.push(`- ${t.title ? esc(t.title) + ' ' : ''}${t.url}（${t.count} 次）`);
        if (k.targets.length > 5) out.push(`- …另外 ${k.targets.length - 5} 個`);
        out.push('');
      }
    }
  }

  // ── 深度健檢 ──
  if (audit && audit.length > 0) {
    out.push('## 深度健檢逐項結果');
    out.push('');
    out.push(`爬取 ${job.progress.crawled} 頁，共 ${audit.length} 項。`);
    out.push('');
    for (const c of sortByOrder(audit)) {
      out.push(`### ${STATUS_LABEL[c.status] ?? c.status}｜${esc(c.item)}`);
      out.push('');
      out.push(`- 分類：${c.category}｜影響層級：${c.level}`);
      out.push(`- 現況：${esc(c.advice)}`);
      if (c.impact) out.push(`- 影響：${esc(c.impact)}`);
      if (c.evidence) out.push(`- 量到的值：${esc(c.evidence)}`);
      if (c.technical) out.push(`- 技術細節：${esc(c.technical)}`);
      if (c.details && c.details.length > 0) {
        out.push(`- 有問題的頁面（共 ${c.details.length} 頁，列前 10 筆）：`);
        for (const d of c.details.slice(0, 10)) out.push(`  - ${d.url}：${esc(d.note)}`);
      }
      out.push('');
    }
  }

  out.push('---');
  out.push('');
  out.push(`報告由 ${SITE_NAME} 產出：https://geo.stack.com.tw`);
  out.push('');
  return out.join('\n');
}
