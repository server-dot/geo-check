// ── 受檢網址的安全閘門（防 SSRF）────────────────────────
// 健檢是拿我們的伺服器去打使用者給的網址。沒有這道閘門，任何人都可以叫正式站去掃
// 內網、localhost、雲端 metadata（169.254.169.254）——2026-09-11 自測時就真的用
// /api/geo 健檢了 http://localhost:3000，成功了。
//
// 兩層：
// 1. assertPublicUrl：進 API 時先把網址解析成 IP，私有／loopback／link-local 一律拒絕。
// 2. guardedFetch：轉址每一跳都重驗——公開網域可以 302 到內網位址，只驗第一跳擋不住。
//    所有對受檢網站的 fetch（首頁、robots、llms、爬蟲、bot 探測）都要走這個。
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const BLOCKED_HOSTNAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||                       // 0.0.0.0/8
    a === 10 ||                      // 10/8
    a === 127 ||                     // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) ||      // link-local、雲端 metadata
    (a === 172 && b >= 16 && b <= 31) ||  // 172.16/12
    (a === 192 && b === 168) ||      // 192.168/16
    (a === 192 && b === 0) ||        // 192.0.0/24、192.0.2/24 文件用
    (a === 198 && (b === 18 || b === 19)) || // benchmark
    a >= 224                         // multicast / reserved / broadcast
  );
}

function ipv6Private(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;  // ULA fc00::/7
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true; // link-local fe80::/10
  if (v.startsWith('ff')) return true;                         // multicast
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);    // IPv4-mapped
  if (mapped) return ipv4Private(mapped[1]);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind === 6) return ipv6Private(ip);
  return true; // 解析不出來的當危險處理
}

// 解析主機名的所有位址，任何一個落在私有網段就拒絕（DNS rebinding 的常見手法是混一個內網 IP 進去）
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError('網址格式不正確');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('只支援 http / https 網址');
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnsafeUrlError('只能檢測標準連接埠（80 / 443）的網站');
  if (u.username || u.password) throw new UnsafeUrlError('網址不能帶帳號密碼');

  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.test(host)) throw new UnsafeUrlError('這不是公開網址，無法檢測');
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError('這不是公開網址，無法檢測');
    return u;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`找不到 ${host} 這個網域，請確認網址有沒有打錯`);
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError('這不是公開網址，無法檢測');
  }
  return u;
}

const MAX_REDIRECTS = 5;

// 跟 fetch 一樣用，但轉址自己跟：每一跳都先過 assertPublicUrl 再打。
// 回傳的 Response.url 是最後一跳的網址（跟 redirect:'follow' 行為一致）。
export async function guardedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let url = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      // 讀掉 body 讓連線可以回收
      await res.body?.cancel().catch(() => {});
      url = new URL(location, url).toString();
      continue;
    }
    // undici 的 redirect:'manual' 回來 res.url 是請求的網址，剛好就是最後一跳
    return res;
  }
  throw new Error(`轉址超過 ${MAX_REDIRECTS} 次`);
}
