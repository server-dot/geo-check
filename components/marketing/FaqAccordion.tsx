"use client";

import { useState } from "react";

// scoring／pricing 共用的 FAQ 手風琴：同時只展開一題。
export default function FaqAccordion({
  items,
  defaultOpen = -1,
}: {
  items: { q: string; a: string }[];
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-[26px] max-w-[52rem]">
      {items.map((item, i) => (
        <div key={item.q} className="border-t border-line">
          <button
            type="button"
            onClick={() => setOpen((v) => (v === i ? -1 : i))}
            className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-6 py-5 text-left"
          >
            <p className="text-[17px] font-semibold tracking-[-0.02em]">{item.q}</p>
            <span className="mono text-xs text-ink3">{open === i ? "收合" : "展開"}</span>
          </button>
          {open === i && <p className="max-w-[34em] pb-[22px] text-[15px] text-ink2">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}
