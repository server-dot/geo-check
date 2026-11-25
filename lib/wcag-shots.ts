import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertPublicUrl } from './geo-url-guard';
import type { WcagExample } from './wcag-types';

// ── 無障礙例子的實際截圖（11-25 小積木：「為何不用實際，不能截圖或是至少說是哪個東西」）──────
// 開瀏覽器到那一頁，找到那個東西、畫紅框、截附近一塊。沒有瀏覽器或找不到就不放圖，報告照樣出。
// 開的是別人的網站：關掉網頁程式（也不會跳彈窗），每個請求都先過 assertPublicUrl，不給環境變數。
export interface Loc { tag: string; attrs: Record<string, string> }
export interface ShotTarget { example: WcagExample; locs: { url: string; loc: Loc | null; detail: string; img: string }[]; checked?: boolean } // checked：出現的每一頁都開過、電腦和手機寬度都找過

const chromePath = () => [process.env.WCAG_CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));

let busy: Promise<unknown> = Promise.resolve();
// 一次只開一個瀏覽器，免得吃光記憶體
export function addShots(targets: ShotTarget[]): Promise<void> {
  const run = busy.then(() => shoot(targets)).catch((e) => console.error('wcag-shots', e));
  busy = run;
  return run;
}

async function shoot(targets: ShotTarget[]): Promise<void> {
  const executablePath = chromePath();
  if (!executablePath || targets.length === 0) return;
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath, headless: true, ...(process.env.WCAG_CHROME_DATA ? { userDataDir: process.env.WCAG_CHROME_DATA } : {}), env: { PATH: process.env.PATH ?? '', HOME: tmpdir() }, args: ['--disable-extensions', '--disable-background-networking', '--disable-dev-shm-usage', '--mute-audio', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'], timeout: 20_000 });
  const deadline = Date.now() + 75_000;
  let left = 30; // 一輪最多截幾張，免得報告太大
  try {
    const urls = [...new Set(targets.flatMap((t) => t.locs.map((l) => l.url)))];
    const ok = new Map<string, Promise<boolean>>();
    const isPublic = (u: string) => {
      const host = new URL(u).host;
      if (!ok.has(host)) ok.set(host, assertPublicUrl(u).then(() => true, () => false));
      return ok.get(host)!;
    };
    // 電腦版找不到的（手機版選單）再用手機寬度找一次
    const opened = new Set<string>();
    for (const [width, height] of [[1280, 800], [390, 800]])
      for (const url of urls) {
        const todo = targets.filter((t) => !t.example.shot && t.locs.some((l) => l.url === url));
        if (todo.length === 0 || left <= 0 || Date.now() > deadline) continue;
        const page = await browser.newPage();
        try {
          await page.setJavaScriptEnabled(false);
          await page.setViewport({ width, height });
          await page.setRequestInterception(true);
          page.on('request', (r) => {
            const u = r.url();
            if (/^data:/.test(u)) return void r.continue().catch(() => {});
            if (!/^https?:/.test(u) || /^(media|websocket|script)$/.test(r.resourceType())) return void r.abort().catch(() => {});
            void isPublic(u).then((y) => (y ? r.continue() : r.abort())).catch(() => {});
          });
          const res = await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
          if (!res?.ok()) continue;
          await page.evaluate('globalThis.__name = (f) => f'); // 有些打包工具會替函式加這個，瀏覽器裡沒有
          // 延遲載入的圖靠網頁程式換網址，程式關了要自己換；原本的 src 記下來，找東西時才對得上
          await page.evaluate(async () => {
            for (const im of document.querySelectorAll('img')) {
              im.setAttribute('gc-src', im.getAttribute('src') ?? '');
              im.loading = 'eager';
              const real = im.getAttribute('data-src') || im.getAttribute('data-original') || im.getAttribute('data-lazy-src');
              if (real && !/[{}]/.test(real) && (!im.getAttribute('src') || im.src.startsWith('data:') || im.naturalWidth < 2)) im.src = real;
            }
          });
          await new Promise((r) => setTimeout(r, 2500));
          for (const t of todo)
            for (const l of t.locs.filter((x) => x.url === url).slice(0, 20)) {
              const box = await page.evaluate(
                (loc: Loc | null) => {
                  document.getElementById('gc-box')?.remove();
                  const list = loc ? [...document.querySelectorAll(loc.tag)].filter((n) => Object.entries(loc.attrs).every(([k, v]) => ((k === 'src' && n.hasAttribute('gc-src') ? n.getAttribute('gc-src') : n.getAttribute(k)) === v))) : [...document.querySelectorAll('header,nav,[class*="NavigationBar" i],[class*="header" i]')];
                  const visible = (n: Element) => {
                    const r = n.getBoundingClientRect();
                    // 圖沒載到就是一塊空白，換下一個
                    const im = n.matches('img') ? n : n.textContent?.trim() ? null : n.querySelector('img');
                    if (im && (im as HTMLImageElement).naturalWidth < 2) return false;
                    if (r.width < 8 || r.height < 8 || r.left < 0 || r.right > innerWidth + 2) return false;
                    for (let p: Element | null = im ?? n; p; p = p.parentElement) {
                      const s = getComputedStyle(p);
                      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.1) return false;
                    }
                    return true;
                  };
                  const n = list.find(visible);
                  if (!n) return null;
                  n.scrollIntoView({ block: 'center' });
                  const r = n.getBoundingClientRect();
                  const top = r.top + scrollY;
                  // 被別的東西蓋住就不算看得到
                  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60));
                  if (loc && hit && !n.contains(hit) && !hit.contains(n)) return null;
                  const d = document.createElement('div');
                  d.id = 'gc-box';
                  d.style.cssText = `position:absolute;z-index:2147483647;left:${r.left + scrollX - 4}px;top:${top - 4}px;width:${r.width}px;height:${r.height}px;border:4px solid #d1261c;box-sizing:content-box;pointer-events:none`;
                  document.documentElement.appendChild(d);
                  return { x: r.left + scrollX, y: top, w: r.width, h: r.height, vh: innerHeight, docW: document.documentElement.clientWidth, docH: document.documentElement.scrollHeight };
                },
                l.loc,
              );
              if (!box || left <= 0) continue;
              // 截附近一塊：看得出在畫面哪裡，又不會小到看不清
              const w = Math.min(box.docW, Math.max(560, box.w + 160, Math.min(box.h, 440) * 2.2 + 160));
              const h = Math.round(w / 2.2);
              const x = Math.max(0, Math.min(box.docW - w, box.x + box.w / 2 - w / 2));
              const y = Math.max(0, Math.min(Math.max(0, box.docH - h), box.y + Math.min(box.h, 440) / 2 - h / 2));
              const shot = await page.screenshot({ type: 'jpeg', quality: 60, encoding: 'base64', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: Math.min(1, 640 / w) } });
              const side = box.x + box.w / 2 < box.docW / 3 ? '左邊' : box.x + box.w / 2 > (box.docW * 2) / 3 ? '右邊' : '中間';
              const screens = Math.floor(box.y / box.vh);
              left--;
              t.example.shot = `data:image/jpeg;base64,${shot}`;
              t.example.url = url;
              t.example.detail = l.detail;
              t.example.img = l.img;
              t.example.where = `${width < 500 ? '手機版，' : ''}${screens === 0 ? (box.y < 200 ? '最上面' : '第一個畫面') : `往下捲約 ${screens} 個畫面`}${box.w > box.docW * 0.7 ? '' : side}`;
              break;
            }
          opened.add(`${width}|${url}`);
        } catch (e) {
          console.error("wcag-shots", url, (e as Error).message.slice(0, 160));
          // 這頁開不起來就不放圖
        } finally {
          await page.close().catch(() => {});
        }
      }
    for (const t of targets) t.checked = left > 0 && t.locs.every((l) => opened.has(`1280|${l.url}`) && (!!t.example.shot || opened.has(`390|${l.url}`)));
  } finally {
    await browser.close().catch(() => {});
  }
}
