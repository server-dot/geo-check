import { parse, type HTMLElement } from 'node-html-parser';
import { fetchWithTimeout, normalizeUrl, readTextCapped } from './geo-audit-crawler';
import { hostnameOf, isSameSite } from './geo-brand-visibility';
import type { WcagItem, WcagReport } from './wcag-types';

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

interface Finding { checked: number; bad: number; samples: string[] }
const file = (u: string) => { if (u.startsWith('data:')) return '內嵌圖片'; const f = u.split(/[?#]/)[0].split('/').pop() ?? ''; try { return decodeURIComponent(f); } catch { return f; } };
const one = (ok: boolean, sample = ''): Finding => ({ checked: 1, bad: ok ? 0 : 1, samples: ok || !sample ? [] : [sample] });
function many(nodes: HTMLElement[], ok: (n: HTMLElement) => boolean, sample: (n: HTMLElement) => string): Finding {
  const bad = nodes.filter((n) => !ok(n));
  return { checked: nodes.length, bad: bad.length, samples: [...new Set(bad.map((n) => clean(sample(n)).slice(0, 80)).filter(Boolean))].slice(0, 3) };
}

type Rule = Pick<WcagItem, 'key' | 'sc' | 'level' | 'name' | 'why' | 'fix'> & { run: (root: HTMLElement) => Finding };
const RULES: Rule[] = [
  {
    key: 'alt', sc: '1.1.1', level: 'A', name: '圖片有文字說明', why: '看不到畫面的人靠報讀軟體聽圖片說明，沒寫就不知道圖在講什麼。', fix: '每張圖補 alt；純裝飾的圖寫 alt=""。',
    // alt="" 是正確的裝飾圖寫法，不算問題；連 alt 都沒有才算
    run: (r) => many(r.querySelectorAll('img').filter((n) => !hidden(n) && !/^(presentation|none)$/.test(n.getAttribute('role') ?? '')), (n) => n.getAttribute('alt') !== undefined || !!clean(n.getAttribute('aria-label')) || !!clean(n.getAttribute('aria-labelledby')) || !!clean(n.getAttribute('title')), (n) => file(n.getAttribute('src') ?? n.getAttribute('data-src') ?? '')),
  },
  {
    key: 'link', sc: '2.4.4', level: 'A', name: '連結聽得出要去哪', why: '只放圖示、沒有文字的連結，報讀軟體只會念「連結」。', fix: '連結裡放文字，或替圖示補 aria-label、圖片補 alt。',
    run: (r) => many(r.querySelectorAll('a[href]').filter((n) => !hidden(n) && n.getAttribute('tabindex') !== '-1'), (n) => !!accName(n, r), (n) => n.getAttribute('href') ?? ''),
  },
  {
    key: 'button', sc: '4.1.2', level: 'A', name: '按鈕有名稱', why: '沒名稱的按鈕（常見是選單、關閉、購物車圖示），用聽的不知道按下去會怎樣。', fix: '按鈕補文字或 aria-label。',
    run: (r) => many(r.querySelectorAll('button,[role="button"],input[type="submit"],input[type="button"],input[type="image"]').filter((n) => !hidden(n)), (n) => {
      const type = (n.getAttribute('type') ?? '').toLowerCase();
      if (n.tagName === 'INPUT' && type === 'submit' && n.getAttribute('value') === undefined) return true; // 瀏覽器有預設名稱
      return !!accName(n, r) || (n.tagName === 'INPUT' && !!clean(type === 'image' ? n.getAttribute('alt') : n.getAttribute('value')));
    }, (n) => n.getAttribute('id') || n.getAttribute('class') || n.tagName.toLowerCase()),
  },
  {
    key: 'field', sc: '4.1.2', level: 'A', name: '輸入欄位有名稱', why: '欄位沒有名稱，報讀軟體的使用者不知道要填什麼。', fix: '用 label 綁定欄位，或補 aria-label。',
    run: (r) => many(r.querySelectorAll('input,select,textarea').filter((n) => !hidden(n) && !/^(hidden|submit|button|image|reset)$/i.test(n.getAttribute('type') ?? '')), (n) => {
      const id = n.getAttribute('id');
      const byFor = id ? r.querySelectorAll('label').some((l) => l.getAttribute('for') === id && !!accName(l, r)) : false;
      const wrap = n.closest('label');
      // 只有 placeholder 也算有名稱（瀏覽器會拿來念），不誤報
      return byFor || (!!wrap && !!clean(wrap.text)) || !!clean(n.getAttribute('aria-label')) || !!clean(n.getAttribute('aria-labelledby')) || !!clean(n.getAttribute('title')) || !!clean(n.getAttribute('placeholder'));
    }, (n) => n.getAttribute('name') || n.getAttribute('id') || n.tagName.toLowerCase()),
  },
  { key: 'lang', sc: '3.1.1', level: 'A', name: '網頁有標明語言', why: '沒標語言，報讀軟體可能用錯的語言念中文。', fix: '在 html 加 lang="zh-Hant-TW"。', run: (r) => one(!!clean(r.querySelector('html')?.getAttribute('lang') ?? r.querySelector('html')?.getAttribute('xml:lang'))) },
  { key: 'title', sc: '2.4.2', level: 'A', name: '網頁有標題', why: '開很多分頁時，靠標題分辨現在在哪一頁。', fix: '每頁寫自己的 title。', run: (r) => one(!!clean(r.querySelectorAll('title').find((n) => !n.closest('svg'))?.text)) },
  {
    key: 'bypass', sc: '2.4.1', level: 'A', name: '可以跳過選單', why: '用鍵盤或報讀軟體的人，不用每一頁都從選單開始聽。', fix: '主要內容用 main 包起來，或加「跳到主要內容」連結、段落標題。',
    run: (r) => one(!!r.querySelector('main,[role="main"],h1,h2,h3,[role="heading"]') || r.querySelectorAll('a[href^="#"]').slice(0, 5).some((a) => /跳到|跳至|略過|skip/i.test(a.text))),
  },
  {
    key: 'zoom', sc: '1.4.4', level: 'AA', name: '手機可以放大畫面', why: '鎖住縮放，視力不好的人就沒辦法把字放大。', fix: '拿掉 viewport 的 user-scalable=no，maximum-scale 不要小於 2。',
    run: (r) => {
      const v = (r.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '').toLowerCase();
      const max = Number(v.match(/maximum-scale\s*=\s*([\d.]+)/)?.[1] ?? 10);
      return one(!/user-scalable\s*=\s*(no|0)(?![.\d])/.test(v) && max >= 2, v);
    },
  },
  { key: 'frame', sc: '4.1.2', level: 'A', name: '嵌入的影片、地圖有名稱', why: '嵌入內容沒名稱，用聽的不知道裡面是影片還是地圖。', fix: 'iframe 補 title。', run: (r) => many(r.querySelectorAll('iframe').filter((n) => !hidden(n) && n.getAttribute('tabindex') !== '-1' && !/^[01](px)?$/.test(n.getAttribute('width') ?? '') && !/^[01](px)?$/.test(n.getAttribute('height') ?? '')), (n) => !!clean(n.getAttribute('title')) || !!clean(n.getAttribute('aria-label')), (n) => hostnameOf(n.getAttribute('src') ?? '') || 'iframe') },
  { key: 'motion', sc: '2.2.2', level: 'A', name: '沒有停不下來的跑馬燈', why: '一直動的文字會讓部分人讀不下去。', fix: '改成靜態文字，或提供暫停。', run: (r) => one(!r.querySelectorAll('marquee,blink').some((n) => !hidden(n))) },
  { key: 'refresh', sc: '2.2.1', level: 'A', name: '網頁不會自己跳走', why: '讀得慢的人還沒看完就被換頁。', fix: '拿掉有倒數的 meta refresh。', run: (r) => one(!r.querySelectorAll('meta').some((m) => { const s = Number((m.getAttribute('content') ?? '').match(/^\s*(\d+)/)?.[1] ?? 0); return /^refresh$/i.test(m.getAttribute('http-equiv') ?? '') && s > 0 && s < 72000; })) },
];

export function checkHtml(html: string): Record<string, Finding> {
  const root = parse(html);
  return Object.fromEntries(RULES.map((r) => [r.key, r.run(root)]));
}

async function getPage(url: string): Promise<{ html: string; url: string } | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
        const html = await readTextCapped(res);
        const body = parse(html).querySelector('body');
        body?.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
        // 內容靠程式產生的空頁、防火牆的驗證頁：看不到真正的內容，不能判定
        if (clean(body?.text).length >= 150 && !/just a moment|site is now busy|attention required/i.test(html.slice(0, 3000))) return { html, url: res.url || url };
      } else await res.body?.cancel().catch(() => {});
    } catch {
      // 再試一次
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

// 首頁＋首頁連到的 4 頁（每種路徑先各挑一頁，商品、分類、文章都看得到）
function pickLinks(html: string, home: string): string[] {
  const seen = new Set([normalizeUrl(home)]);
  const urls: string[] = [];
  for (const a of parse(html).querySelectorAll('a[href]')) {
    try {
      if (hidden(a) || /[{}]/.test(a.getAttribute('href')!)) continue;
      const u = new URL(a.getAttribute('href')!, home);
      u.hash = '';
      if (!/^https?:$/.test(u.protocol) || !isSameSite(u.hostname, hostnameOf(home)) || u.search || u.pathname === '/') continue;
      if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|xml)$/i.test(u.pathname) || /login|sign_?in|sign_?up|register|cart|checkout|account|member|logout|cdn-cgi/i.test(u.pathname)) continue;
      const k = normalizeUrl(u.toString());
      if (seen.has(k)) continue;
      seen.add(k);
      urls.push(u.toString());
    } catch {
      // 不是網址
    }
  }
  const kind = (u: string) => new URL(u).pathname.split('/')[1];
  const firsts = urls.filter((u, i) => urls.findIndex((x) => kind(x) === kind(u)) === i);
  return [...new Set([...firsts, ...urls])].slice(0, 4);
}

export async function runWcag(siteUrl: string): Promise<WcagReport> {
  const home = `${new URL(siteUrl).origin}/`;
  const first = await getPage(home);
  const rest = first ? await Promise.all(pickLinks(first.html, first.url).map(async (u) => ({ u, p: await getPage(u) }))) : [];
  const all = [{ u: home, p: first }, ...rest];
  const results = all.flatMap(({ u, p }) => (p ? [{ url: u, f: checkHtml(p.html) }] : []));
  return {
    checkedAt: new Date().toISOString(),
    pages: all.map(({ u, p }) => ({ url: u, title: p ? clean(parse(p.html).querySelector('title')?.text).slice(0, 60) : '', readable: !!p })),
    items: RULES.map(({ key, sc, level, name, why, fix }) => {
      const f = results.map((x) => ({ url: x.url, ...x.f[key] }));
      return {
        key,
        sc,
        level,
        name,
        why,
        fix,
        checked: f.reduce((n, x) => n + x.checked, 0),
        bad: f.reduce((n, x) => n + x.bad, 0),
        pages: f.filter((x) => x.bad > 0).map((x) => ({ url: x.url, bad: x.bad })),
        samples: [...new Set(f.flatMap((x) => x.samples))].slice(0, 5),
      };
    }),
  };
}
