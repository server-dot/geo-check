"use client";

import { useEffect } from "react";

// 行銷頁「往下滑淡入」：監看 .marketing 底下所有 .reveal，進視窗就加 .is-in。
// 只在 html 掛上 data-reveal 之後 CSS 才會先把元素藏起來（見 globals.css），
// 所以沒跑 JS 的環境（爬蟲、關 JS）內容照常全部可見，不會因為動畫變成空殼。
// 首頁健檢開始後會換掉整段版面，所以用 MutationObserver 補抓後來才出現的元素。
export default function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reveal = "on";

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of document.querySelectorAll(".marketing .reveal:not(.is-in)")) {
        if (seen.has(el)) continue;
        seen.add(el);
        io.observe(el);
      }
    };
    scan();

    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    // 保險：分頁在背景時 IntersectionObserver 不會發，若這段期間被捲過去了，
    // 元素會一直停在透明狀態。捲動時把已經整個滑過視窗頂端的直接標成顯示。
    const sweep = () => {
      for (const el of document.querySelectorAll(".marketing .reveal:not(.is-in)")) {
        if (el.getBoundingClientRect().bottom < 0) el.classList.add("is-in");
      }
    };
    window.addEventListener("scroll", sweep, { passive: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", sweep);
      delete root.dataset.reveal;
    };
  }, []);

  return null;
}
