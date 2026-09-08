"use client";

import { useState } from "react";

// 聯絡表單的「諮詢事項」多選標籤。純本地 UI 狀態——目前表單沒有真的送出到
// 後端（送出按鈕連去 stack.com.tw 的官網表單），這裡只是讓使用者先勾一下
// 想問什麼，方便他們填下面的「詢問內容」時聚焦。
const TOPICS = ["健檢報告問題", "GEO / AI SEO 優化", "SEO 關鍵字", "網頁設計製作", "合作提案", "其他"];

// 健檢報告每一項「需處理」旁邊的諮詢連結會帶 ?topic=report 進來，這裡先幫他勾好，
// 少一個要自己找的步驟。用穩定的英文 key 而不是直接傳中文標籤，中文標籤之後
// 改字不會讓舊連結失效。
const TOPIC_BY_KEY: Record<string, string> = { report: "健檢報告問題" };

export default function ContactTopicChips({ defaultTopicKey }: { defaultTopicKey?: string }) {
  const [active, setActive] = useState<string[]>(() => {
    const preset = defaultTopicKey ? TOPIC_BY_KEY[defaultTopicKey] : undefined;
    return preset ? [preset] : [];
  });

  return (
    <div className="flex flex-wrap gap-2">
      {TOPICS.map((topic) => {
        const on = active.includes(topic);
        return (
          <button
            key={topic}
            type="button"
            onClick={() =>
              setActive((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]))
            }
            className={`rounded-full px-[15px] py-2 text-[13.5px] tracking-[-0.01em] ${
              on ? "bg-lime font-semibold text-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "bg-paper font-medium text-ink2 shadow-[inset_0_0_0_1px_var(--line)]"
            }`}
          >
            {topic}
          </button>
        );
      })}
    </div>
  );
}
