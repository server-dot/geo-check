"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 導覽列右上角的帳號區：沒登入是「登入」按鈕，按了跳登入彈框；登入後顯示頭像，點開看信箱、
// GEO／SEO 用過沒、登出。首頁的「開始檢測」沒登入時也是丟 gc:open-login 事件叫出同一個彈框
// （帶 next，登入完回到首頁自動開始那次健檢）。登入／登出後丟 gc:auth-changed，首頁收到就重抓狀態。

type Kind = "geo" | "seo";
interface Me {
  user: { email: string; name: string; picture?: string } | null;
  usage?: Record<Kind, { url: string; at: string } | null>;
  admin?: boolean;
  loginAvailable: boolean;
}

interface HistoryItem {
  id: string;
  kind: Kind;
  url: string;
  createdAt: string;
  finishedAt: string;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export const OPEN_LOGIN_EVENT = "gc:open-login";
export const AUTH_CHANGED_EVENT = "gc:auth-changed";

export function openLogin(next?: string, hint?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT, { detail: { next, hint } }));
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Avatar({ user, size = 30 }: { user: NonNullable<Me["user"]>; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (user.picture && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Google 頭像，外部網址不走 next/image
      <img
        src={user.picture}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper"
      style={{ width: size, height: size }}
    >
      {(user.name || user.email).slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AccountMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [modalNext, setModalNext] = useState<string | null>(null);
  const [modalHint, setModalHint] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d: Me) => setMe(d))
        .catch(() => {});
    void load();
    const onOpen = (e: Event) => {
      const { next, hint } = (e as CustomEvent<{ next?: string; hint?: string }>).detail ?? {};
      setModalHint(hint ?? "");
      setModalNext(next || window.location.pathname + window.location.search);
    };
    window.addEventListener(OPEN_LOGIN_EVENT, onOpen);
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    // createPortal 要等到瀏覽器端才有 document.body
    const t = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener(OPEN_LOGIN_EVENT, onOpen);
      window.removeEventListener(AUTH_CHANGED_EVENT, load);
    };
  }, []);

  // 彈框：Esc 關掉
  useEffect(() => {
    if (modalNext === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModalNext(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalNext]);

  // 帳號選單：點外面關掉
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setMenuOpen(false);
    setMe((m) => ({ user: null, loginAvailable: m?.loginAvailable ?? true }));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }

  const loginHref = (next: string) => `/api/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <>
      {me?.user ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              const open = !menuOpen;
              setMenuOpen(open);
              // 每次打開都重抓，剛跑完的那次才會出現
              if (open)
                fetch("/api/history")
                  .then((r) => r.json())
                  .then((d: { items?: HistoryItem[] }) => setHistory(d.items ?? []))
                  .catch(() => setHistory([]));
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`帳號：${me.user.email}`}
            className="flex items-center gap-2 rounded-full p-0.5 hover:bg-black/[.05]"
          >
            <Avatar user={me.user} />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 w-[300px] rounded-xl border border-line bg-white p-4 text-sm shadow-[0_12px_32px_rgba(0,0,0,.12)]">
              <div className="flex items-center gap-3">
                <Avatar user={me.user} size={36} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{me.user.name}</div>
                  <div className="truncate text-[12.5px] text-ink3">{me.user.email}</div>
                </div>
              </div>
              <div className="mt-3 border-t border-line pt-3 text-[13px]">
                {me.admin ? (
                  <div className="text-ink3">管理員，不限次數</div>
                ) : (
                  (["geo", "seo"] as const).map((k) => (
                    <div key={k} className="flex justify-between py-0.5">
                      <span>{k.toUpperCase()} 健檢</span>
                      <span className="text-ink3">{me.usage?.[k] ? "今日已檢測" : "今日可免費 1 次"}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 text-[13px] font-semibold">檢測紀錄</div>
                {history === null ? (
                  <div className="py-1 text-[12.5px] text-ink3">載入中…</div>
                ) : history.length === 0 ? (
                  <div className="py-1 text-[12.5px] text-ink3">還沒有檢測紀錄</div>
                ) : (
                  <ul className="-mx-2 max-h-[260px] overflow-y-auto">
                    {history.map((h) => (
                      <li key={h.id}>
                        <a role="menuitem" href={`/?report=${h.id}`} className="plain-link block rounded-lg px-2 py-1.5 hover:bg-black/[.04]">
                          <span className="flex items-center gap-2">
                            <span className="rounded border border-line px-1 text-[11px] text-ink2">{h.kind.toUpperCase()}</span>
                            <span className="truncate text-[13px]">{h.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                          </span>
                          <span className="mono mt-0.5 block text-[11.5px] text-ink3">{fmtTime(h.finishedAt)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="mt-3 w-full rounded-lg border border-line py-2 text-[13px] hover:bg-black/[.04]"
              >
                登出
              </button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => openLogin()} className="btn-lime whitespace-nowrap">
          登入
        </button>
      )}

      {mounted &&
        modalNext !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/50 px-4"
            onMouseDown={(e) => e.target === e.currentTarget && setModalNext(null)}
          >
            <div role="dialog" aria-modal="true" aria-labelledby="login-title" className="relative w-full max-w-[400px] rounded-2xl bg-white p-7 text-ink shadow-[0_20px_60px_rgba(0,0,0,.25)]">
              <button
                type="button"
                onClick={() => setModalNext(null)}
                aria-label="關閉"
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-xl leading-none text-ink3 hover:bg-black/[.05]"
              >
                ×
              </button>
              <h2 id="login-title" className="text-[20px] font-bold">{modalHint || "登入積木 GEO 健檢"}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink3">
                登入後每天 GEO、SEO 健檢各免費一次。只會取得你的 Google 名稱和信箱，用來記錄使用次數。
              </p>
              {me && !me.loginAvailable ? (
                <p className="mt-5 rounded-lg bg-black/[.04] p-3 text-[13.5px]">登入功能還沒設定好，請稍後再試。</p>
              ) : (
                <a
                  href={loginHref(modalNext)}
                  autoFocus
                  className="plain-link mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white py-3 text-[15px] font-medium text-[#3c4043] hover:bg-[#f8f9fa]"
                >
                  <GoogleG />
                  使用 Google 帳號登入
                </a>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
