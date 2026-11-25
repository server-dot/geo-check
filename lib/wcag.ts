import { parse, type HTMLElement } from 'node-html-parser';
import { fetchSitemapUrls, fetchWithTimeout, readTextCapped } from './geo-audit-crawler';
import { robotsBlocks } from './geo-ai-crawlers';
import { hostnameOf } from './geo-brand-visibility';
import { addShots, type Loc, type ShotTarget } from './wcag-shots';
import { WCAG_VERSION, type SkipReason, type WcagItem, type WcagReport, type WcagScan } from './wcag-types';

// ── 無障礙檢查（WCAG 2.2，只測看 HTML 就能判斷的項目）────────────────
// 11-25 小積木：加上 WCAG，取代「AI 看不看得到你的網站」。全部用規則，不呼叫付費 API。
// 只報「看原始碼就確定」的問題；顏色對比、鍵盤操作要開瀏覽器或人工看，列在 MANUAL_ITEMS，不給燈號。
// 讀不到的頁不算通過也不算有問題（403 或靠程式產生內容的空頁）。

const clean = (s: string | undefined | null) => (s ?? '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const el = (n: unknown) => n as HTMLElement | null;

// 還沒執行的前端樣板（Angular、Vue、Alpine）：名稱要跑完程式才知道，不判定（11-25 Relove 的 Shopline 頁被誤報 100 多個按鈕）
const TEMPLATE_ATTR = /^(ng-|data-ng-|v-|x-(if|for|show|text|bind|html|cloak)|:|\*ng|\[)/i;
const isTemplate = (n: HTMLElement) => Object.entries(n.attributes ?? {}).some(([k, v]) => (TEMPLATE_ATTR.test(k) && !/^(data-)?ng-(app|controller|version|csp|strict-di|init|class|scope)$/i.test(k)) || /\{\{|\{%|<%/.test(v));

function hidden(node: HTMLElement): boolean {
  for (let n: HTMLElement | null = node; n && n.getAttribute; n = el(n.parentNode)) {
    if (n.getAttribute('hidden') !== undefined || n.getAttribute('aria-hidden') === 'true') return true;
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.getAttribute('style') ?? '')) return true;
    if (isTemplate(n)) return true;
    if (/^(TEMPLATE|NOSCRIPT)$/.test(n.tagName ?? '')) return true;
  }
  return false;
}

// 螢幕報讀器會念出來的名字：aria-label、指到的文字、裡面的文字、裡面圖片的說明、title
function accName(node: HTMLElement, root: HTMLElement): string {
  const label = clean(node.getAttribute('aria-label'));
  if (label) return label;
  const ids = clean(node.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
  const refs = clean(ids.map((id) => root.querySelector(`[id="${id.replace(/["\\]/g, '')}"]`)?.text ?? '').join(' '));
  if (refs) return refs;
  if (clean(node.textContent)) return clean(node.textContent);
  const inner = node.querySelectorAll('img,[aria-label],svg title').map((n) => clean(n.getAttribute('alt') ?? n.getAttribute('aria-label') ?? n.text)).find(Boolean);
  return inner ?? clean(node.getAttribute('title'));
}

// 用白話講是畫面上的哪個東西（給小白看，不放原始碼）
function plain(node: HTMLElement): string {
  const icons = node.querySelectorAll('[class],use').map((n) => `${n.getAttribute('class') ?? ''} ${n.getAttribute('xlink:href') ?? n.getAttribute('href') ?? ''}`).join(' ');
  const link = node.tagName === 'A' ? node : node.closest('a');
  const href = link?.getAttribute('href') ?? '';
  const hint = `${node.getAttribute('class') ?? ''} ${node.getAttribute('id') ?? ''} ${node.getAttribute('name') ?? ''} ${icons} ${href}`.toLowerCase();
  const path = (() => { try { return new URL(href, 'https://x.y').pathname; } catch { return ''; } })();
  if (link && href && /^\/((zh-hant|zh-tw|zh|tw)\/?)?$/i.test(path) && !/^(#|javascript)/i.test(href)) return '回首頁的 Logo';
  const known: [RegExp, string][] = [[/sign_?in|log-?in|\buser|member|account/, '登入／會員'], [/search|magnif/, '搜尋'], [/cart|checkout|basket/, '購物車'], [/wish|favorit|heart/, '收藏'], [/hamburger|menu|navbar-toggle/, '選單'], [/close|dismiss/, '關閉'], [/facebook|fb\.com|instagram|line\.me|lin\.ee|youtube|threads/, '社群'], [/prev|next|arrow|slide|carousel|swiper/, '輪播'], [/share/, '分享'], [/logo/, 'Logo']];
  const what = known.find(([re]) => re.test(hint))?.[1];
  const tag = node.tagName;
  if (tag === 'IMG') return what === 'Logo' ? 'Logo 圖' : what ? `${what}的圖` : link ? '點了會換頁的圖' : '頁面上的圖';
  if (tag === 'SELECT') return '下拉選單';
  if (tag === 'INPUT' && !/^(submit|button|image)$/i.test(node.getAttribute('type') ?? '')) return what ? `${what}欄位` : /checkbox|radio/i.test(node.getAttribute('type') ?? '') ? '勾選框' : '輸入欄位';
  if (tag === 'TEXTAREA') return '輸入欄位';
  if (tag === 'A') return what ? `${what}連結` : /product/.test(path) ? '商品圖連結' : '圖片或圖示連結';
  if (tag === 'IFRAME') return /youtu|vimeo/.test(node.getAttribute('src') ?? '') ? '影片' : /map/.test(node.getAttribute('src') ?? '') ? '地圖' : '嵌入的內容';
  return what ? `${what}按鈕` : '只有圖示的按鈕';
}

// 那個東西的圖，給報告當縮圖
function imgOf(node: HTMLElement): string {
  const im = node.tagName === 'IMG' ? node : node.querySelector('img');
  const src = [im?.getAttribute('src'), im?.getAttribute('data-src'), im?.getAttribute('data-original')].find((x) => x && !x.startsWith('data:') && !/[{}]/.test(x));
  return src ?? '';
}

// 是哪一個：講得出來的線索
function detailOf(node: HTMLElement): string {
  if (node.tagName === 'SELECT') {
    const o = node.querySelectorAll('option').map((x) => clean(x.text)).filter((x) => x && !/[{}]/.test(x)).slice(0, 3);
    return o.length ? `選項有「${o.join('、')}」的那個` : '';
  }
  const href = (node.tagName === 'A' ? node : node.closest('a'))?.getAttribute('href') ?? '';
  if (href && !/^(#|javascript)/i.test(href)) {
    try {
      const u = new URL(href, 'https://self.invalid');
      const path = decodeURIComponent(u.pathname);
      if (path === '/' && u.hostname === 'self.invalid') return '點了會回首頁';
      return u.hostname === 'self.invalid' || path !== '/' ? `點了會到 ${path}` : `點了會到 ${u.hostname}`;
    } catch {
      return '';
    }
  }
  return '';
}

// 給瀏覽器找同一個東西用
const LOC_ATTRS = ['id', 'class', 'href', 'src', 'data-src', 'name', 'type'];
const locOf = (node: HTMLElement): Loc => ({ tag: node.tagName.toLowerCase(), attrs: Object.fromEntries(LOC_ATTRS.flatMap((k) => { const v = node.getAttribute(k); return v === undefined ? [] : [[k, v]]; })) });

interface Sample { what: string; img: string; detail: string; loc: Loc }
interface Finding { checked: number; bad: number; samples: Sample[] }
const one = (ok: boolean): Finding => ({ checked: 1, bad: ok ? 0 : 1, samples: [] });
function many(nodes: HTMLElement[], ok: (n: HTMLElement) => boolean): Finding {
  const bad = nodes.filter((n) => !ok(n));
  return { checked: nodes.length, bad: bad.length, samples: bad.map((n) => ({ what: plain(n), img: imgOf(n), detail: detailOf(n), loc: locOf(n) })) };
}

type Rule = Pick<WcagItem, 'key' | 'sc' | 'level' | 'name' | 'why' | 'fix'> & { run: (root: HTMLElement) => Finding };
const RULES: Rule[] = [
  {
    key: 'alt', sc: '1.1.1', level: 'A', name: '有些圖片沒寫說明', why: '看不到畫面的人是用聽的，這些圖聽不到內容。', fix: '請工程師替圖片加上文字說明。',
    // alt="" 是正確的裝飾圖寫法，不算問題；連 alt 都沒有才算
    run: (r) => many(r.querySelectorAll('img').filter((n) => !hidden(n) && !/^(presentation|none)$/.test(n.getAttribute('role') ?? '')), (n) => n.getAttribute('alt') !== undefined || !!clean(n.getAttribute('aria-label')) || !!clean(n.getAttribute('aria-labelledby')) || !!clean(n.getAttribute('title'))),
  },
  {
    key: 'link', sc: '2.4.4', level: 'A', name: '有些連結沒有文字', why: '只放圖，用聽的不知道點了會去哪。', fix: '請工程師替連結加上名稱。',
    run: (r) => many(r.querySelectorAll('a[href]').filter((n) => !hidden(n) && n.getAttribute('tabindex') !== '-1'), (n) => !!accName(n, r)),
  },
  {
    key: 'button', sc: '4.1.2', level: 'A', name: '有些按鈕沒有名稱', why: '只有圖示，用聽的不知道按了會怎樣。', fix: '請工程師替按鈕加上名稱，例如「搜尋」。',
    run: (r) => many(r.querySelectorAll('button,[role="button"],input[type="submit"],input[type="button"],input[type="image"]').filter((n) => !hidden(n)), (n) => {
      const type = (n.getAttribute('type') ?? '').toLowerCase();
      if (n.tagName === 'INPUT' && type === 'submit' && n.getAttribute('value') === undefined) return true; // 瀏覽器有預設名稱
      return !!accName(n, r) || (n.tagName === 'INPUT' && !!clean(type === 'image' ? n.getAttribute('alt') : n.getAttribute('value')));
    }),
  },
  {
    key: 'field', sc: '4.1.2', level: 'A', name: '有些欄位沒說要填什麼', why: '用聽的不知道這格要填或要選什麼。', fix: '請工程師替欄位加上名稱。',
    run: (r) => many(r.querySelectorAll('input,select,textarea').filter((n) => !hidden(n) && !/^(hidden|submit|button|image|reset)$/i.test(n.getAttribute('type') ?? '')), (n) => {
      const id = n.getAttribute('id');
      const byFor = id ? r.querySelectorAll('label').some((l) => l.getAttribute('for') === id && !!accName(l, r)) : false;
      const wrap = n.closest('label');
      // 只有 placeholder 也算有名稱（瀏覽器會拿來念），不誤報
      return byFor || (!!wrap && !!clean(wrap.text)) || !!clean(n.getAttribute('aria-label')) || !!clean(n.getAttribute('aria-labelledby')) || !!clean(n.getAttribute('title')) || !!clean(n.getAttribute('placeholder'));
    }),
  },
  { key: 'lang', sc: '3.1.1', level: 'A', name: '網頁沒標明是中文', why: '報讀軟體可能用外語腔念中文。', fix: '請工程師把網頁語言設成中文。', run: (r) => one(!!clean(r.querySelector('html')?.getAttribute('lang') ?? r.querySelector('html')?.getAttribute('xml:lang'))) },
  { key: 'title', sc: '2.4.2', level: 'A', name: '網頁沒有標題', why: '開很多分頁時分不出是哪一頁。', fix: '替每頁寫標題。', run: (r) => one(!!clean(r.querySelectorAll('title').find((n) => !n.closest('svg'))?.text)) },
  {
    key: 'bypass', sc: '2.4.1', level: 'A', name: '不能跳過選單', why: '用鍵盤或用聽的人，每頁都要從選單重來一次。', fix: '請工程師標出主要內容從哪裡開始。',
    run: (r) => one(!!r.querySelector('main,[role="main"],h1,h2,h3,[role="heading"]') || r.querySelectorAll('a[href^="#"]').slice(0, 5).some((a) => /跳到|跳至|略過|skip/i.test(a.text))),
  },
  {
    key: 'zoom', sc: '1.4.4', level: 'AA', name: '手機不能放大', why: '看不清楚小字的人沒辦法放大。', fix: '請工程師開放縮放。',
    run: (r) => {
      const v = (r.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '').toLowerCase();
      const max = Number(v.match(/maximum-scale\s*=\s*([\d.]+)/)?.[1] ?? 10);
      return one(!/user-scalable\s*=\s*(no|0)(?![.\d])/.test(v) && max >= 2);
    },
  },
  { key: 'frame', sc: '4.1.2', level: 'A', name: '影片或地圖沒有名稱', why: '用聽的不知道那一塊是什麼。', fix: '請工程師替它加上名稱。', run: (r) => many(r.querySelectorAll('iframe').filter((n) => !hidden(n) && n.getAttribute('tabindex') !== '-1' && !/^[01](px)?$/.test(n.getAttribute('width') ?? '') && !/^[01](px)?$/.test(n.getAttribute('height') ?? '')), (n) => !!clean(n.getAttribute('title')) || !!clean(n.getAttribute('aria-label'))) },
  { key: 'motion', sc: '2.2.2', level: 'A', name: '文字一直跑停不下來', why: '有些人來不及讀。', fix: '改成不會動的文字。', run: (r) => one(!r.querySelectorAll('marquee,blink').some((n) => !hidden(n))) },
  { key: 'refresh', sc: '2.2.1', level: 'A', name: '網頁會自己跳走', why: '讀得慢的人還沒看完就被換頁。', fix: '取消自動跳頁。', run: (r) => one(!r.querySelectorAll('meta').some((m) => { const s = Number((m.getAttribute('content') ?? '').match(/^\s*(\d+)/)?.[1] ?? 0); return /^refresh$/i.test(m.getAttribute('http-equiv') ?? '') && s > 0 && s < 72000; })) },
];

export function checkHtml(html: string | HTMLElement): Record<string, Finding> {
  const root = typeof html === 'string' ? parse(html) : html;
  return Object.fromEntries(RULES.map((r) => [r.key, r.run(root)]));
}

type Got = { kind: 'page'; root: HTMLElement; url: string; noindex: boolean } | { kind: 'gone' | 'blocked' | 'unreadable' };
async function getPage(url: string): Promise<Got> {
  let last: Got = { kind: 'unreadable' };
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.status === 404 || res.status === 410) {
        await res.body?.cancel().catch(() => {});
        return { kind: 'gone' };
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        last = { kind: [403, 429, 503].includes(res.status) ? 'blocked' : 'unreadable' };
      } else if (!(res.headers.get('content-type') ?? '').includes('html')) {
        await res.body?.cancel().catch(() => {});
        return { kind: 'gone' };
      } else {
        const html = await readTextCapped(res);
        if (/just a moment|site is now busy|attention required/i.test(html.slice(0, 3000))) last = { kind: 'blocked' };
        else {
          // 內容靠程式產生的空頁：看不到真正的內容，不能判定
          const text = clean(html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));
          if (text.length < 150) return { kind: 'unreadable' };
          const root = parse(html);
          const meta = root.querySelectorAll('meta').filter((m) => /^(robots|googlebot)$/i.test(m.getAttribute('name') ?? '')).map((m) => m.getAttribute('content') ?? '').join(',');
          return { kind: 'page', root, url: res.url || url, noindex: /noindex|\bnone\b/i.test(`${meta},${res.headers.get('x-robots-tag') ?? ''}`) };
        }
      }
    } catch {
      // 再試一次
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

// ── 要查哪些頁：全站，但排除翻譯頁、設定不收錄、重複的頁、功能頁（11-25 小積木）──────
// 「不收錄」看的是網站自己的設定（noindex、robots.txt 擋 Google、canonical 指到別頁），不是 Google 實際收錄狀況
const MAX_PAGES = 1000;
const LANG_SEG = /^\/(en|en-us|en-gb|ja|jp|ko|kr|vi|th|id|ms|fr|de|es|pt|it|ru|ar|zh-cn|zh-hans|cn|sc)(?=\/|$)/i;
const FUNCTION_PAGE = /\/(log-?in|sign_?in|sign_?up|sign-in|sign-up|register|cart|checkout|my-?account|account|member(s|ship)?|users|logout|wish-?list|compare|search|feed|wp-admin|wp-json|wp-login\.php|cdn-cgi|author|tag|tags|thank-?you|order(s)?|password)(\/|$)|\/page\/\d+\/?$/i;
const BAD_QUERY = /(^|&)(sort|sort_by|order|order_by|page|paged|limit|filter[^=]*|q|query|s|search|lang|locale|currency|add-to-cart|replytocom|variant|utm_[^=]*|fbclid|gclid|ref|share)=/i;
type UrlVerdict = { url: string } | { skip: SkipReason } | null;
function judgeUrl(raw: string, home: string, homeLang: string): UrlVerdict {
  try {
    if (/[{}]/.test(raw)) return null;
    const u = new URL(raw, home);
    u.hash = '';
    if (!/^https?:$/.test(u.protocol) || hostnameOf(u.toString()) !== hostnameOf(home)) return null;
    if (/\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|mp4|mp3|css|js|xml|json|txt|docx?|xlsx?|pptx?)$/i.test(u.pathname)) return null;
    const seg = u.pathname.match(LANG_SEG)?.[0].toLowerCase() ?? '';
    if ((seg && seg !== homeLang) || /(^|&)(lang|locale)=/i.test(u.search.slice(1))) return { skip: '翻譯頁' };
    if (FUNCTION_PAGE.test(u.pathname)) return { skip: '功能頁' };
    if (BAD_QUERY.test(u.search.slice(1))) return { skip: '重複的頁' };
    u.protocol = new URL(home).protocol;
    u.host = new URL(home).host;
    return { url: u.toString() };
  } catch {
    return null;
  }
}
const pageKey = (u: string) => {
  const x = new URL(u);
  let path = x.pathname.replace(/\/+$/, '') || '/';
  try {
    path = decodeURIComponent(path);
  } catch {
    // 編碼壞掉就用原樣
  }
  // /zh-hant/ 這種是同一份中文頁的另一個網址，算同一頁（Relove 多出 324 頁）
  path = path.replace(/^\/(zh-hant|zh-tw|zh|tw)(?=\/|$)/i, '') || '/';
  return path.normalize('NFC') + x.search;
};

// 首頁連到的頁，每種路徑先各挑一頁（商品、分類、文章都看得到），先出結果用
function firstFew(urls: string[]): string[] {
  const kind = (u: string) => new URL(u).pathname.split('/')[1];
  const firsts = urls.filter((u, i) => urls.findIndex((x) => kind(x) === kind(u)) === i);
  return [...new Set([...firsts, ...urls])].slice(0, 4);
}

// 每一個有問題的東西列一次（頁首的 Logo 每頁都有，只算一個）
interface Group { target: ShotTarget; pages: Set<string>; shotTried: boolean }
interface Tally { checked: number; bad: number; badPages: number; groups: Map<string, Group>; overflow: number }
const MAX_EXAMPLES = 20;
const MAX_GROUPS = 400;
// 電腦版、手機版各放一個的 Logo、登入圖示，看起來是同一個東西
const SAME_THING = /^(回首頁的 Logo|登入／會員連結|購物車連結|搜尋按鈕|選單按鈕)$/;

// 從大字串切出來的小字串會讓整頁 HTML 留在記憶體（Relove 700 頁吃到 791MB），存之前複製一份
const own = (x: string) => Buffer.from(x).toString();

function addTo(t: Tally, f: Finding, url: string) {
  t.checked += f.checked;
  t.bad += f.bad;
  if (f.bad > 0) t.badPages++;
  const samples = f.samples.length > 0 ? f.samples : f.bad > 0 ? [{ what: '', img: '', detail: '', loc: null as Loc | null }] : [];
  for (const x of samples) {
    let img = '';
    try {
      const u = x.img ? new URL(x.img, url) : null;
      if (u?.protocol === 'https:') img = u.toString();
    } catch {
      // 圖的網址壞掉就不放
    }
    const key = SAME_THING.test(x.what) || !x.what ? x.what : `${x.what}|${img || JSON.stringify(x.loc)}|${x.detail}`;
    let g = t.groups.get(key);
    if (!g) {
      if (t.groups.size >= MAX_GROUPS) {
        t.overflow++;
        continue;
      }
      g = { target: { example: { what: x.what, url, img: own(img), detail: own(x.detail), on: [], onCount: 0 }, locs: [] }, pages: new Set(), shotTried: false };
      t.groups.set(own(key), g);
    }
    g.pages.add(url);
    if (!g.target.example.img && img) g.target.example.img = own(img);
    if (g.target.locs.length < 6) g.target.locs.push({ url, loc: x.loc && (JSON.parse(JSON.stringify(x.loc)) as Loc), detail: own(x.detail), img: own(img) });
  }
}

// 每種東西先各排一個在前面（有圖的優先），其他照出現頁數多的排
function ordered(t: Tally): Group[] {
  const all = [...t.groups.values()].filter((g) => !(g.target.checked && !g.target.example.shot && !g.target.example.img)).sort((a, b) => b.pages.size - a.pages.size);
  const lead = [...new Set(all.map((g) => g.target.example.what))].map((w) => all.find((g) => g.target.example.what === w && (g.target.example.shot || g.target.example.img)) ?? all.find((g) => g.target.example.what === w)!);
  return [...lead, ...all.filter((g) => !lead.includes(g))];
}

// 一次只查一個網站，其他排隊
let line: Promise<unknown> = Promise.resolve();
let waiting = 0;
export function runWcag(siteUrl: string, onUpdate: (r: WcagReport) => void = () => {}): Promise<WcagReport> {
  if (waiting >= 20) return Promise.reject(new Error('queue full'));
  waiting++;
  const run = line.then(() => scan(siteUrl, onUpdate)).finally(() => waiting--);
  line = run.catch(() => {});
  return run;
}

async function scan(siteUrl: string, onUpdate: (r: WcagReport) => void): Promise<WcagReport> {
  const start = `${new URL(siteUrl).origin}/`;
  const first = await getPage(start);
  const home = first.kind === 'page' ? first.url : start;
  const homeLang = new URL(home).pathname.match(LANG_SEG)?.[0].toLowerCase() ?? '';
  const primary = (r: HTMLElement) => clean(r.querySelector('html')?.getAttribute('lang')).toLowerCase();
  const homeHtmlLang = first.kind === 'page' ? primary(first.root).split('-')[0] : '';
  const simplified = (l: string) => /^zh-(cn|hans)/.test(l);
  const homeSimplified = first.kind === 'page' && simplified(primary(first.root));

  const tally = new Map<string, Tally>(RULES.map((r) => [r.key, { checked: 0, bad: 0, badPages: 0, groups: new Map(), overflow: 0 }]));
  const pages: WcagReport['pages'] = [];
  const info: WcagScan = { status: 'running', done: 0, total: 1, skipped: {}, capped: false, unreadable: 0 };
  const skip = (r: SkipReason, u = '') => {
    if (process.env.WCAG_DEBUG) console.log('SKIP', r, u);
    info.skipped[r] = (info.skipped[r] ?? 0) + 1;
  };
  const seen = new Set<string>([pageKey(home), pageKey(start)]);
  const queue: string[] = [];
  let robots = '';
  const enqueue = (raw: string) => {
    const v = judgeUrl(raw, home, homeLang);
    if (!v) return;
    let key: string;
    try {
      key = 'url' in v ? pageKey(v.url) : pageKey(new URL(raw, home).toString());
    } catch {
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    if ('skip' in v) return void skip(v.skip, key);
    const u = new URL(v.url);
    if (robots && robotsBlocks(robots, 'Googlebot', u.pathname + u.search)) return void skip('設定不收錄');
    if (seen.size > MAX_PAGES * 8) return void (info.capped = true); // 網址多到不合理（篩選組合），不再收新的
    queue.push(v.url);
  };

  const report = (): WcagReport => ({
    v: WCAG_VERSION,
    checkedAt: new Date().toISOString(),
    scan: { ...info, skipped: { ...info.skipped }, total: info.status === 'running' ? info.done + queue.length + busyNow : info.done },
    pages: [...pages],
    items: RULES.map(({ key, sc, level, name, why, fix }) => {
      const t = tally.get(key)!;
      const list = ordered(t);
      // 找到的全都確認看不到＝這項沒問題
      const none = t.bad > 0 && list.length === 0 && t.overflow === 0;
      return {
        key, sc, level, name, why, fix,
        checked: t.checked,
        bad: none ? 0 : t.bad,
        pages: [],
        more: Math.max(0, list.length - MAX_EXAMPLES) + t.overflow,
        examples: list.slice(0, MAX_EXAMPLES).map((g) => ({ ...g.target.example, on: [...g.pages].slice(0, 10), onCount: g.pages.size })),
      };
    }),
  });

  let busyNow = 0;
  let opened = 0;
  let blocked = 0; // 連續被擋幾次
  const visit = (got: Got, url: string) => {
    if (got.kind === 'gone') return void skip('打不開', url);
    if (got.kind !== 'page') {
      info.done++;
      info.unreadable++;
      pages.push({ url, title: '', readable: false });
      blocked = got.kind === 'blocked' ? blocked + 1 : 0;
      return;
    }
    blocked = 0;
    const isHome = pageKey(url) === pageKey(home);
    if (!isHome) {
      if (hostnameOf(got.url) !== hostnameOf(home)) return void skip('重複的頁', url);
      const finalKey = pageKey(got.url);
      if (finalKey !== pageKey(url)) {
        // 轉址：轉到查過的頁就不重查，轉到登入頁、外語頁就排除
        const v = judgeUrl(got.url, home, homeLang);
        if (v && 'skip' in v) return void skip(v.skip, url);
        if (seen.has(finalKey)) return void skip('重複的頁', url);
        seen.add(finalKey);
      }
      if (got.noindex) return void skip('設定不收錄', url);
      const lang = primary(got.root);
      if (lang && homeHtmlLang && (lang.split('-')[0] !== homeHtmlLang || (homeHtmlLang === 'zh' && simplified(lang) !== homeSimplified))) return void skip('翻譯頁', url);
      const canon = got.root.querySelector('link[rel="canonical"]')?.getAttribute('href');
      if (canon) {
        const v = judgeUrl(canon, got.url, homeLang);
        if (v && 'url' in v && pageKey(v.url) !== finalKey) {
          enqueue(canon);
          return void skip('重複的頁', url);
        }
      }
    }
    for (const a of got.root.querySelectorAll('a[href]')) if (!isTemplate(a)) enqueue(new URL(a.getAttribute('href') ?? '', got.url).toString());
    const found = checkHtml(got.root);
    for (const r of RULES) addTo(tally.get(r.key)!, found[r.key], url);
    pages.push({ url, title: own(clean(got.root.querySelectorAll('title').find((n) => !n.closest('svg'))?.text).slice(0, 60)), readable: true });
    info.done++;
  };
  const safeVisit = (got: Got, url: string) => {
    try {
      visit(got, url);
    } catch (e) {
      console.error('wcag', url, e);
      info.done++;
      info.unreadable++;
      pages.push({ url, title: '', readable: false });
    }
  };
  // 截圖：每項前 20 個裡還沒試過的；一個項目先拍各種東西的第一個
  const shoot = async () => {
    const todo = RULES.flatMap((r) => ordered(tally.get(r.key)!).slice(0, MAX_EXAMPLES)).filter((g) => !g.shotTried);
    todo.forEach((g) => (g.shotTried = true));
    await addShots(todo.map((g) => g.target));
  };

  const rb = await fetchWithTimeout(`${new URL(home).origin}/robots.txt`).then(async (r) => (r.ok && !/html/i.test(r.headers.get('content-type') ?? '') ? readTextCapped(r) : ''), () => '');
  robots = rb;
  safeVisit(first, home);
  if (first.kind === 'page') {
    const few = firstFew([...queue]);
    queue.splice(0, queue.length, ...queue.filter((u) => !few.includes(u)));
    const got = await Promise.all(few.map(getPage));
    few.forEach((u, i) => safeVisit(got[i], u));
    onUpdate(report());
    await shoot();
    onUpdate(report());
    const map = await fetchSitemapUrls(new URL(home).origin, 5000, 40).catch(() => [] as string[]);
    // 地圖只列外語網址（Relove 全是 /en/）：拿掉語言段改讀主要語言那一版；有列主要語言的就照列
    const foreign = map.filter((u) => { try { const s = new URL(u).pathname.match(LANG_SEG)?.[0].toLowerCase(); return !!s && s !== homeLang; } catch { return false; } });
    const onlyForeign = map.length > 0 && foreign.length === map.length;
    for (const u of map) enqueue(onlyForeign ? u.replace(/^(https?:\/\/[^/]+)(\/.*)$/, (_, o: string, p: string) => o + (p.replace(LANG_SEG, '') || '/')) : u);
    if (onlyForeign) info.skipped['翻譯頁'] = (info.skipped['翻譯頁'] ?? 0) + foreign.length;

    const worker = async () => {
      while (info.status === 'running') {
        // 算真的查了幾頁，打開才知道要排除的不佔名額
        if (info.done + busyNow >= MAX_PAGES || opened >= MAX_PAGES * 3) {
          if (queue.length > 0) info.capped = true;
          return;
        }
        const url = queue.shift();
        if (!url) {
          // 別的還在讀，可能會帶出新連結
          if (busyNow === 0) return;
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        busyNow++;
        opened++;
        try {
          safeVisit(await getPage(url), url);
        } finally {
          busyNow--;
        }
        if (blocked >= 8) info.status = 'stopped';
        if (info.done % 10 === 0) onUpdate(report());
        await new Promise((r) => setTimeout(r, 200));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await shoot();
    // 拿掉看不到的之後會遞補新的，再拍一輪
    await shoot();
  }
  if (info.status === 'running') info.status = 'done';
  const final = report();
  onUpdate(final);
  return final;
}
