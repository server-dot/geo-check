import ExcelJS from 'exceljs';
import type { LinePlan, Tri } from './line-plan-types';
import { pageName } from './line-plan-types';
import type { AuditJob } from './geo-audit-jobs';
import { hostnameOf } from './geo-brand-visibility';
import { SOURCE_LABEL, brandSlugs, classifySource } from './geo-source-type';

// 作戰清單的試算表。版面 11-23 小積木看過樣張定案：待辦只留 8 欄、一個畫面看完，
// 依據和驗收放明細頁，網址只顯示頁面名稱，深藍標題＋金線、只留淡橫線。
const NAVY = 'FF303C54', GOLD = 'FFFCB418', INK = 'FF26303F', SUB = 'FF6B7485', LINE = 'FFE6E9EF', SOFT = 'FFF6F7F9';
const fill = (c: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const font = (size = 10, bold = false, color = INK): Partial<ExcelJS.Font> => ({ name: 'Noto Sans TC', size, bold, color: { argb: color } });
type Cell = string | number | { link: string; text: string } | { formula: string; result: string | number };

// 內容來自網頁和模型，開頭是 = + - @ 會被試算表當公式執行
export const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

const RED: [string, string] = ['FFFBE3DF', 'FFB3382A'], YEL: [string, string] = ['FFFFF1CC', 'FF8A6100'], GRY: [string, string] = ['FFEDEFF3', 'FF5F6A80'], GRN: [string, string] = ['FFE2F3E8', 'FF2B7A4B'], BLU: [string, string] = ['FFE3EEFB', 'FF2563A8'];

function chips(ws: ExcelJS.Worksheet, ref: string, m: Record<string, [string, string]>) {
  ws.addConditionalFormatting({
    ref,
    rules: Object.entries(m).map(([k, [bg, fg]], i) => ({ type: 'cellIs', operator: 'equal', priority: i + 1, formulae: [`"${k}"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: bg } }, font: { bold: true, color: { argb: fg } } } })),
  });
}

function sheet(wb: ExcelJS.Workbook, name: string, title: string, note: string, heads: string[], rows: Cell[][], widths: number[], opt: { center?: number[]; bold?: number[]; tab?: string } = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }], properties: { tabColor: { argb: opt.tab ?? NAVY } }, pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = widths.map((width) => ({ width }));
  const n = heads.length;
  for (let c = 1; c <= n; c++) {
    ws.getCell(1, c).fill = fill(NAVY);
    ws.getCell(2, c).fill = fill(NAVY);
    ws.getCell(3, c).fill = fill(GOLD);
  }
  Object.assign(ws.getCell(1, 1), { value: safeText(title), font: font(18, true, 'FFFFFFFF'), alignment: { vertical: 'middle' } });
  Object.assign(ws.getCell(2, 1), { value: safeText(note), font: font(10, false, 'FFC9CFDB'), alignment: { vertical: 'middle' } });
  ws.getRow(1).height = 38;
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 4;
  ws.getRow(4).height = 30;
  heads.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = font(10, true, SUB);
    c.fill = fill(SOFT);
    c.alignment = { vertical: 'middle', horizontal: opt.center?.includes(i + 1) ? 'center' : 'left' };
    c.border = { bottom: { style: 'medium', color: { argb: NAVY } } };
  });
  rows.forEach((row, ri) => {
    let lines = 1;
    row.forEach((v, i) => {
      const c = ws.getCell(5 + ri, i + 1);
      const bold = !!opt.bold?.includes(i + 1);
      c.font = font(bold ? 11 : 10, bold);
      if (typeof v === 'object' && 'link' in v) {
        // 只放 http(s) 連結
        if (/^https?:\/\//.test(v.link)) {
          c.value = { text: safeText(v.text), hyperlink: v.link };
          c.font = { ...font(10, false, 'FF2563A8'), underline: true };
        } else c.value = safeText(v.text);
      } else if (typeof v === 'object') c.value = { formula: v.formula, result: v.result };
      else c.value = typeof v === 'string' ? safeText(v) : v;
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: opt.center?.includes(i + 1) ? 'center' : 'left' };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      const t = typeof v === 'object' ? ('text' in v ? v.text : '') : String(v);
      const w = [...t].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 2 : 1), 0) * (bold ? 1.12 : 1);
      lines = Math.max(lines, Math.ceil(w / Math.max(1, widths[i] - 4)));
    });
    ws.getRow(5 + ri).height = lines * 15 + 14;
  });
  return ws;
}

const TRI: Record<Tri, string> = { yes: '✓', no: '✗', unknown: '無法判定' };
const path = (u: string) => {
  try {
    const x = new URL(u);
    const p = decodeURIComponent(x.pathname).replace(/\/+$/, '');
    return p ? p.split('/').pop()!.slice(0, 22) : '首頁';
  } catch {
    return u;
  }
};

// 報告上的分析搬過來：誰被推、AI 怎麼回答、定位、沒推你的原因、評價、輪廓、參考網站、Google 前十名、網友問題、AI 讀不讀得到。
// 沒有資料的分頁不建（說明頁會寫哪些沒算出來）。名單不照次數排。
function analysisSheets(wb: ExcelJS.Workbook, plan: LinePlan, report: Partial<AuditJob>) {
  const a = plan.analysis;
  const rows = (name: string, title: string, note: string, heads: string[], data: Cell[][], widths: number[], opt: Parameters<typeof sheet>[7] = {}) => (data.length ? sheet(wb, name, title, note, heads, data, widths, opt) : null);
  const end = (d: unknown[]) => 4 + d.length;
  if (a) {
    const flat = a.questions.flatMap((q) => q.results.map((r) => ({ q: q.question, r })));
    const short = (e: string) => (e.startsWith('Google') ? 'Google' : e.split(/[ （(]/)[0]);
    const spec = (n: string) => plan.rivalSites.some((s) => s.from === '指定' && (n.includes(s.name) || s.name.includes(n)));
    const order = (n: (typeof a.names)[number]) => (n.isSelf ? 0 : spec(n.name) ? 1 : n.kind === 'channel' ? 3 : 2);
    const names = [...a.names].sort((x, y) => order(x) - order(y) || (x.answers?.[0] ?? 0) - (y.answers?.[0] ?? 0));
    const nameRows: Cell[][] = names.map((n) => [
      n.name,
      n.isSelf ? '你' : spec(n.name) ? '指定對手' : n.kind === 'channel' ? '通路／平台' : '品牌',
      ...a.questions.map((q) => [...new Set((n.answers ?? []).filter((i) => flat[i]?.q === q.question).map((i) => short(flat[i].r.engine)))].join('、')),
    ]);
    const nm = rows('AI推薦名單', 'AI 推薦了誰', '格子裡是哪幾家 AI 在這題提到它，空白＝這次沒提到。通路／平台不算對手。', ['名稱', '身分', ...a.questions.map((q) => q.question)], nameRows, [28, 14, ...a.questions.map(() => 22)], { bold: [1], center: [2] });
    if (nm) chips(nm, `B5:B${end(nameRows)}`, { 你: GRN, 指定對手: YEL, '通路／平台': GRY });

    const ansRows: Cell[][] = flat.map(({ q, r }, i) => [q, short(r.engine), r.namedSelf ? '✓ 有推' : '✗ 沒推', names.filter((n) => !n.isSelf && n.kind !== 'channel' && n.answers?.includes(i)).map((n) => n.name).join('、') || '—', [...new Set(r.citations.map((c) => hostnameOf(c.url)))].slice(0, 8).join('、') || '—', r.answer.replace(/\s+/g, ' ').slice(0, 300)]);
    const an = rows('AI回答紀錄', 'AI 回答紀錄', '回答只留開頭 300 字。AI 每次回答會不一樣。', ['關鍵字', 'AI', '推你', '推了誰', '引用網站', '回答開頭'], ansRows, [22, 14, 11, 40, 44, 70], { bold: [1], center: [2, 3] });
    if (an) chips(an, `C5:C${end(ansRows)}`, { '✓ 有推': GRN, '✗ 沒推': RED });

    const m = a.rivalMap;
    if (m) {
      const axes = m.axes ?? [m.x, m.y];
      const dim = (d: { v: number; why: string } | null | undefined, i: number): string => (d ? `${d.v < 0 ? axes[i].low : d.v > 0 ? axes[i].high : '中間'}：${d.why}` : '沒查到');
      rows('市場定位', '市場定位', `AI 上網查每一家的位置。定位圖兩軸：${m.x.low}↔${m.x.high}、${m.y.low}↔${m.y.high}。`, ['品牌', '類型', ...axes.map((x) => `${x.low} ↔ ${x.high}`), '出處'], [{ name: plan.brand, type: m.self.type ?? '', dims: m.self.dims, url: m.self.url, why: m.self.why }, ...m.points.map((x) => ({ ...x, why: x.quote }))].map((p) => [p.name, p.type, ...axes.map((_, i) => (p.dims ? dim(p.dims[i], i) : i === 0 ? p.why : '')), p.url ? { link: p.url, text: hostnameOf(p.url) } : '']), [24, 18, ...axes.map(() => 34), 24], { bold: [1] });
    }
    rows('AI怎麼說各家', 'AI 怎麼形容你和對手', '每一條都附 AI 回答原文。', ['品牌', '特色', '原文', '哪家 AI'], (a.positioning ?? []).flatMap((p) => p.traits.map((t): Cell[] => [p.brand, t.text, t.quote, t.engine])), [24, 30, 80, 16], { bold: [1], center: [4] });

    const V = { yes: '有在回答', partial: '沾到邊', no: '沒有' } as const;
    const whyRows: Cell[][] = (a.contentMatch ?? []).map((c) => {
      const q = a.questions.find((x) => x.question === c.question);
      const named = (q?.results ?? []).filter((r) => r.namedSelf).map((r) => short(r.engine));
      return [c.question, named.length ? `${named.join('、')} 有推` : '都沒推', V[c.verdict], c.pageUrl ? { link: c.pageUrl, text: c.pageTitle || path(c.pageUrl) } : '—', c.pageAbout ?? '', c.missing.join('、'), c.advice ?? '', c.peerPages.map((p) => p.title).join('／')];
    });
    const wy = rows('沒被推的原因', 'AI 為什麼沒推你', '比對你的頁有沒有在回答這題。補了不保證就會被推。', ['關鍵字', 'AI 推你沒', '頁面在回答嗎', '最接近的頁', '那頁在講什麼', '缺的字', '建議', 'AI 引用的同業頁'], whyRows, [22, 20, 14, 26, 30, 20, 44, 44], { bold: [1], center: [3] });
    if (wy) chips(wy, `C5:C${end(whyRows)}`, { 有在回答: GRN, 沾到邊: YEL, 沒有: RED });

    const senRows: Cell[][] = (a.sentiment?.themes ?? []).map((t) => [t.polarity === 'negative' ? '負面' : '正面', t.theme, t.quote, t.quoteEngine]);
    const se = rows('品牌評價', 'AI 怎麼評價你', '含直接問品牌評價的回答，不只這幾條產品線。', ['正負', 'AI 說', '原文', '哪家 AI'], senRows, [10, 36, 90, 16], { bold: [2], center: [1, 4] });
    if (se) chips(se, `A5:A${end(senRows)}`, { 正面: GRN, 負面: RED });

    const pf = a.profile;
    if (pf) rows('品牌輪廓', 'AI 眼中的你', '整個品牌的輪廓，來自健檢那次。', ['項目', ...pf.engines, '說法不一致'], [...(pf.summaries ? [['怎麼介紹你', ...pf.summaries, ''] as Cell[]] : []), ...pf.rows.map((r): Cell[] => [r.label, ...pf.engines.map((e) => { const c = r.cells.find((x) => x.engine === e); return c?.value ? c.value + (c.siteMismatch ? `（跟官網不同：${c.siteMismatch.note}）` : '') : '沒提到'; }), r.conflict])], [18, ...pf.engines.map(() => 46), 36], { bold: [1] });

    const slugs = brandSlugs(a.names.filter((n) => !n.isSelf && n.kind !== 'channel').map((n) => n.name));
    const src = new Map<string, { self: boolean; url: string; title: string; qs: Set<string>; es: Set<string> }>();
    for (const { q, r } of flat)
      for (const c of r.citations) {
        const s = src.get(c.url) ?? { self: c.isSelf, url: c.url, title: c.title, qs: new Set<string>(), es: new Set<string>() };
        s.qs.add(q);
        s.es.add(short(r.engine));
        src.set(c.url, s);
      }
    rows('AI參考網站', 'AI 回答參考了哪些網頁', '', ['網站', '類型', '網頁', '哪些關鍵字', '哪家 AI'], [...src.values()].map((s) => ({ ...s, host: hostnameOf(s.url) })).sort((x, y) => x.host.localeCompare(y.host)).slice(0, 300).map((s): Cell[] => [s.host, SOURCE_LABEL[plan.rivalSites.some((r) => hostnameOf(r.url) === s.host) && !s.self ? 'competitor' : classifySource(s.host, s.self, slugs)], { link: s.url, text: s.title || path(s.url) }, [...s.qs].join('、'), [...s.es].join('、')]), [28, 14, 60, 40, 24], { bold: [1], center: [2] });
  }
  rows('Google前十名', 'Google 第一頁是誰', '台灣 Google 當下的結果。', ['關鍵字', '名次', '網站', '網頁', '身分'], plan.keywords.flatMap((k) => k.top.map((t): Cell[] => [k.keyword, t.rank, t.domain, { link: t.url, text: t.title || path(t.url) }, t.isSelf ? '你' : t.isPlatform ? '論壇／平台' : '其他網站'])), [24, 8, 28, 76, 14], { bold: [3], center: [2, 5] });
  rows('網友在問什麼', '網友在問什麼', '論壇標題搜得到的，不代表搜尋量。', ['網友想知道', '論壇', '原文標題'], plan.forum.map((f): Cell[] => [f.question, f.site, { link: f.link, text: f.title }]), [56, 14, 70], { bold: [1], center: [2] });
  const BOT: Record<string, string> = { allowed: '可存取', blocked: '被擋', unknown: '無法判定', mismatch: '政策允許但實測被擋' };
  rows('AI讀不讀得到', 'AI 讀不讀得到你的網站', '健檢那次的結果。', ['AI 爬蟲', '用途', '結果', '依據'], (report.engine?.results ?? []).map((b): Cell[] => [b.ua, b.label, BOT[b.status] ?? b.status, b.matchedRule]), [24, 40, 14, 60], { bold: [1], center: [3] });
}

export async function buildPlanWorkbook(plan: LinePlan, report: Partial<AuditJob> = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const titles = new Map(plan.pageWords.map((w) => [w.url, pageName({ title: w.currentTitle, url: w.url })]));
  const link = (u: string): Cell => ({ link: u, text: titles.get(u) ?? path(u) });
  const n = plan.todos.length;
  const end = 4 + n;
  const rk = (r: number | null | 'failed') => (r === 'failed' ? '查詢失敗' : r === null ? '第一頁沒有' : `第 ${r} 名`);
  const st = { named: '✓ 有推', not: '✗ 沒推', failed: '查詢失敗', absent: '沒出摘要' } as const;
  const lineOf = (l: string) => plan.todos.filter((t) => t.line === l || t.line === '全部');
  const ov = sheet(
    wb,
    '總覽',
    `${plan.brand}　總覽`,
    `${plan.checkedAt.slice(0, 10)} 查。AI 回答和排名會變，這是當下那一次的結果。`,
    ['產品線', '關鍵字', '由哪頁負責', 'Google', 'Google 前面的同業', 'Perplexity', 'ChatGPT', 'Google AI 摘要', '待辦數', '高優先'],
    plan.keywords.map((k, i) => {
      const r = 5 + i;
      const ls = lineOf(k.line);
      return [
        k.line, k.keyword, link(k.page), rk(k.rank), k.top.filter((t) => !t.isSelf && !t.isPlatform && (typeof k.rank !== 'number' || t.rank < k.rank)).slice(0, 3).map((t) => t.domain).join('、') || '—', ...k.ai.map((a) => st[a.state]),
        { formula: `COUNTIF('待辦明細'!$B:$B,A${r})+COUNTIF('待辦明細'!$B:$B,"全部")`, result: ls.length },
        { formula: `COUNTIFS('待辦明細'!$B:$B,A${r},'待辦明細'!$C:$C,"高")+COUNTIFS('待辦明細'!$B:$B,"全部",'待辦明細'!$C:$C,"高")`, result: ls.filter((t) => t.priority === '高').length },
      ] as Cell[];
    }),
    [16, 24, 24, 14, 34, 14, 14, 17, 10, 10],
    { center: [4, 6, 7, 8, 9, 10], bold: [2] },
  );
  chips(ov, `D5:I${4 + plan.keywords.length}`, { '✓ 有推': GRN, '✗ 沒推': RED, 第一頁沒有: RED, 查詢失敗: GRY, 沒出摘要: GRY });
  const s = 7 + plan.keywords.length;
  Object.assign(ov.getCell(s, 1), { value: '先做這幾件', font: font(14, true) });
  plan.todos.slice(0, 4).forEach((t, i) => {
    const r = s + 1 + i;
    ov.getRow(r).height = 30;
    Object.assign(ov.getCell(r, 1), { value: i + 1, font: font(14, true, NAVY), alignment: { horizontal: 'center', vertical: 'middle' } });
    ov.getCell(r, 1).fill = fill(GOLD);
    Object.assign(ov.getCell(r, 2), { value: safeText(`${t.todo}（${t.role}）`), font: font(12), alignment: { vertical: 'middle' } });
  });

  const td = sheet(
    wb,
    '待辦清單',
    `${plan.brand}　待辦清單`,
    `共 ${n} 項，由上往下做。為什麼要做、怎麼驗收看「待辦明細」。藍字可點開頁面；建議文字是草稿。`,
    ['#', '優先', '要做什麼', '改哪頁', '建議文字（草稿）', '誰做', '狀態', '期限'],
    plan.todos.map((t, i) => [i + 1, t.priority, t.todo, link(t.url), t.suggest, t.role, '未開始', '']),
    [6, 9, 50, 20, 54, 13, 12, 13],
    { center: [1, 2, 6, 7, 8], bold: [3], tab: GOLD },
  );
  for (let r = 5; r <= end; r++) {
    td.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"高,中,低"'] };
    td.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"未開始,進行中,待確認,完成,不做"'] };
    td.getCell(`H${r}`).numFmt = 'm/d';
  }
  if (n > 0) {
    chips(td, `B5:B${end}`, { 高: RED, 中: YEL, 低: GRY });
    chips(td, `G5:G${end}`, { 進行中: BLU, 待確認: YEL, 完成: GRN, 不做: GRY });
    td.autoFilter = `A4:H${end}`;
  }
  const dt = sheet(
    wb,
    '待辦明細',
    '待辦明細',
    '編號對應「待辦清單」。優先會跟著待辦清單自動更新。',
    ['#', '產品線', '優先', '關鍵字', '類別', '現況', '依據', '工作量', '驗收方式'],
    plan.todos.map((t, i) => [i + 1, t.line, { formula: `INDEX('待辦清單'!$B$5:$B$${end},MATCH(A${5 + i},'待辦清單'!$A$5:$A$${end},0))`, result: t.priority }, t.keyword, t.category, t.now, t.basis, t.effort, t.accept]),
    [6, 14, 8, 19, 13, 48, 46, 9, 30],
    { center: [1, 3, 8] },
  );
  if (n > 0) chips(dt, `C5:C${end}`, { 高: RED, 中: YEL, 低: GRY });
  const pw = sheet(wb, '頁面對照', '頁面有沒有寫客人會搜的字', '只看這頁自己的內容，選單和推薦商品不算；圖片裡的字不算。', ['頁面', '客人會搜', '標題', '大標', '內文', '現在的標題'], plan.pageWords.map((w) => [{ link: w.url, text: w.page }, w.word, TRI[w.title], TRI[w.h1], TRI[w.body], w.currentTitle]), [26, 16, 11, 11, 13, 78], { center: [3, 4, 5], bold: [2] });
  if (plan.pageWords.length) chips(pw, `C5:E${4 + plan.pageWords.length}`, { '✓': GRN, '✗': RED, 無法判定: GRY });
  if (plan.rivals.length) {
    const rv = sheet(
      wb,
      '對手比較',
      '對手官網比較：他們有、我們沒有',
      `${plan.rivalSites.map((r) => `${r.name}（${r.from}）`).join('、')}。同一套規則量；「讀不到」「選單沒看到」不代表對手沒有。`,
      ['項目', '怎麼做', plan.brand, ...plan.rivalSites.map((r) => r.name)],
      plan.rivals.map((r) => [r.item, r.action, { link: r.selfUrl, text: r.self }, ...r.cells.map((c) => ({ link: c.url, text: c.text }))]),
      [24, 13, 26, ...plan.rivalSites.map(() => 26)],
      { center: [2], bold: [1] },
    );
    chips(rv, `B5:B${4 + plan.rivals.length}`, { 要追: RED, 可主打: GRN, 不一定: GRY, 無法判定: GRY });
  }
  analysisSheets(wb, plan, report);
  sheet(wb, '媒體名單', '媒體與外部提及', '搜尋得到的標題提及，不是完整外鏈數。業配不算口碑。', ['網站', '連結', '類型', '標題提到誰', 'AI 引用過', '建議'], plan.media.map((m) => [m.site, { link: m.url, text: path(m.url) }, m.type, m.mentions, m.aiCited ? '✓' : '', m.advice]), [26, 28, 14, 18, 12, 50], { center: [5], bold: [1] });
  sheet(wb, '說明', '說明', '', ['項目', '內容'], [
    ['用途', '公司內部用，審過再給客戶。'],
    ['看了什麼', `你的網頁 ${plan.pagesRead} 頁${plan.pagesFailed ? `，另有 ${plan.pagesFailed} 頁讀不到` : ''}；關鍵字 ${plan.keywords.length} 個。`],
    ['沒查到的', plan.notes.join('；') || '沒有'],
    ['不保證', '照做不保證 Google 排名或 AI 一定推薦。'],
    ['沒有的資料', '搜尋量、完整外鏈數、圖片裡的文字、程式動態載入的內容。'],
    ['法規', '宣稱用語請法規人員確認，本表不判定是否違法。'],
    ['口碑', '業配不算口碑；不要假裝網友發文。'],
  ], [18, 120], { bold: [1] });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
