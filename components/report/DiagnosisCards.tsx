// 「未被推薦原因」網頁版。11-13 小積木：「這頁的重點是我要知道原因」「不要跟推薦題表現搞混，這就是在講原因（初步）」
// 「這題是哪題，總體還是很不直觀」「怎麼又回到原點」（只是把「最接近的頁」換句話說，不是原因）「最好加一些圖例說明」。
// 每題回答「AI 為什麼推別人」，只用 AI 實際留下的東西：
//   1. 你網站上有沒有在回答這題的頁（lib/geo-diagnosis.ts 的判斷）
//   2. 建議：你那頁具體要補什麼
//   3. AI 自己說的推薦理由：回答原文裡講到第一名對手的一句話，原文照引
// 11-17 小積木：「AI 參考了誰」拿掉比較乾淨；燈號標題（△你有相關的頁…）也拿掉，只在沒有頁時寫一句。
// 推你幾次、AI 推了誰的排名屬於「推薦題表現」，不放這裡。只講現象，不寫解法。

import type { ReactNode } from "react";
import { type Diagnosis } from "@/lib/geo-diagnosis";
import { type BrandTable, type RecommendLike } from "./ReportOverview";

type Answer = { engine: string; answer?: string };

// 回答原文裡第一句講到這個對手的話（去掉 Markdown 記號、引用編號）
// 頁名：標題「｜」前那段；首頁標「官網首頁」，不然大家不知道是哪一頁
function pageName(url: string, title: string): string {
  let home = false;
  try {
    home = new URL(url).pathname.replace(/\/$/, "") === "";
  } catch {}
  const t = title.split(/[｜|]/)[0].trim() || url;
  return home ? `官網首頁「${t}」` : `「${t}」`;
}

// 優先挑有講「為什麼」的句子（主打、適合、特色、成分…），標題列、只有品牌名的那種不要
// AI 推對手的理由裡講到哪幾類事情，換成你網站上可以寫的項目
// 每類附一句「你那頁具體要寫什麼」，不講「寫清楚」這種空話（11-17 小積木：「啥屁話」）
const POINTS: [RegExp, string, string][] = [
  [/pH|弱酸|酸鹼/i, "pH 值", "寫出產品 pH 值的實際數字"],
  [/成分|萃|乳酸|胺基酸|益生/, "成分", "列出主要成分，每個成分用一句話講它的作用"],
  [/低敏|溫和|無皂鹼|不含|無添加/, "溫和、無添加", "寫明不含哪些東西（皂鹼、香精、酒精等）"],
  [/適合|族群|孕|產後|敏感/, "適合誰用", "寫出適合哪些人用，例如孕期、產後、敏感肌"],
  [/媒體|排行|No\.?\s?1|第一|得獎|評比/i, "媒體報導或得獎", "有被報導、得獎或上排行榜的，列出名稱、年份並附原文連結"],
  [/醫師|婦產科|醫療|藥局/, "醫師或醫療通路背書", "有醫師推薦、或在藥局／婦產科販售的，寫出是誰、在哪裡"],
  [/口碑|評價|好評|熱銷|銷售/, "使用者評價", "放上使用者評價，或銷量、回購率這類數字"],
  [/價格|平價|預算|CP/i, "價格", "寫出價格和容量"],
  [/台灣品牌|台灣製|MIT|本土品牌/, "台灣品牌", "寫明是台灣品牌、在哪裡製造"],
];

function reasonPoints(text: string): { label: string; todo: string }[] {
  return POINTS.filter(([re]) => re.test(text)).map(([, label, todo]) => ({ label, todo })).slice(0, 4);
}


// 打分：句子裡有品牌名 +4；講別人怎麼看它（推薦、排行、媒體、醫師、口碑）+2；講產品特色 +1；衛教提醒（諮詢、不要、避免）-2
const STRONG = /推薦|排行|No\.?\s?1|第一|媒體|醫師|婦產科|口碑|評價|熱銷|認證|得獎|銷售/i;
const WEAK = /主打|特色|成分|配方|溫和|低敏|弱酸|專為|適合|強調|因為|理由/;
const ADVICE = /諮詢|就醫|不要|避免|應該先/;

function rivalQuote(answers: Answer[], rival: string): { text: string; engine: string } | null {
  const keys = [...(rival.match(/[\u4e00-\u9fff]{2,}/g) ?? []), ...(rival.match(/[A-Za-z][A-Za-z0-9.&'-]{2,}/g) ?? [])].map((k) => k.toLowerCase());
  if (keys.length === 0) return null;
  let fallback: { text: string; engine: string } | null = null;
  let best: { text: string; engine: string; score: number } | null = null;
  for (const a of answers) {
    // 段落：以 Markdown 標題、或頂層編號（「3. 賽吉兒」）切段——品牌名那行跟底下的說明（就算中間空一行）算同一段
    const paras = (a.answer ?? "")
      .split(/\n(?=#{1,4}\s|\d+[.、]\s|\*\*\d+[.、])/)
      .map((para) =>
        para
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "")
          .replace(/\[\d+\]/g, "")
          .replace(/[*#>`_]/g, "")
          // Markdown 表格：一列當一句，格子用「；」接起來，分隔線那列丟掉
          .split("\n")
          .map((line) => (line.includes("|") ? line.split("|").map((c) => c.trim()).filter((c) => c && !/^[-:\s]+$/.test(c)).join("；") : line))
          .join("\n"),
      );
    for (const para of paras) {
      if (!keys.some((k) => para.toLowerCase().includes(k))) continue;
      const sentences = para
        .split(/[。！？!?\n]/)
        .map((t) => t.replace(/^\s*(?:[-•]|\d+[.、)])\s*/, "").replace(/^[^：:]{0,20}[：:]\s*$/, "").trim())
        .filter((t) => [...t].length >= 12);
      // 理由句要嘛自己有品牌名，要嘛這段很短、開頭就是這個品牌（品牌名一行、說明下一行的寫法），免得抓到別家的理由
      const about = (t: string) => keys.some((k) => t.toLowerCase().includes(k));
      const ownPara = para.length <= 700 && about(para.trim().slice(0, 40));
      for (const t of sentences) {
        if (!about(t) && !ownPara) continue;
        const score = (about(t) ? 4 : 0) + (STRONG.test(t) ? 2 : 0) + (WEAK.test(t) ? 1 : 0) - (ADVICE.test(t) ? 2 : 0);
        // 只有品牌名、沒講理由的句子（「賽吉兒 SAUGELLA：菁萃潔浴凝露」）不算
        if (score < (about(t) ? 5 : 2)) continue;
        if (!best || score > best.score) best = { text: t.length > 90 ? `${t.slice(0, 90)}…` : t, engine: a.engine, score };
      }
      // 沒有講理由的句子時退而求其次：品牌名那句；如果那句只是標題（短），把下一句接上去
      const fi = sentences.findIndex(about);
      if (!fallback && fi >= 0) {
        const first = sentences[fi];
        const t = [...first].length <= 30 && sentences[fi + 1] ? `${first}：${sentences[fi + 1]}` : first;
        fallback = { text: t.length > 90 ? `${t.slice(0, 90)}…` : t, engine: a.engine };
      }
    }
  }
  return best ? { text: best.text, engine: best.engine } : fallback;
}


const q = (words: string[]) => words.map((w) => `「${w}」`).join("");

function PageLink({ url, title }: { url: string; title: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="report-table-link font-semibold">
      {pageName(url, title)}
    </a>
  );
}

// 11-17 小積木：「最接近的頁：「私密潔淨系列」，介紹私密潔淨系列產品 誰看得懂」「整體排版文字都要調整」
// 每題三段：一句話講為什麼沒推你（直接講缺什麼）→ AI 推對手的原話當證據 → 可以怎麼做（條列）
// table 留在參數型別：呼叫端照傳，之後要再加回參考網站不用改呼叫端
export function DiagnosisCards({ d, rec }: { d: Diagnosis; rec: RecommendLike; table: BrandTable }) {
  const items = d.rows
    .map((r, qi) => ({ r, qi }))
    .filter(({ r }) => r.reason.kind !== "recommended")
    .map(({ r, qi }) => {
      const rival = r.rivals[0];
      const quote = rival ? rivalQuote(rec.questions[qi].results as Answer[], rival) : null;
      const m = r.match;
      const hasPage = !!m?.pageUrl && r.reason.kind !== "no-page";
      const missing = m?.missing ?? [];

      // 為什麼沒推你：一句話
      let why: ReactNode;
      if (r.reason.kind === "chose-others" && hasPage) {
        why = (
          <>
            你的 <PageLink url={m!.pageUrl} title={m!.pageTitle} /> 有在講這個，但 AI 推了{rival ? <strong>{rival}</strong> : "別人"}。
          </>
        );
      } else if (r.reason.kind === "partial-page" && hasPage) {
        why = (
          <>
            你網站上最接近的是 <PageLink url={m!.pageUrl} title={m!.pageTitle} />
            {missing.length ? `，但這頁沒提到${q(missing)}，回答不了這題。` : "，但這頁沒有直接回答這題。"}
          </>
        );
      } else if (r.reason.kind === "no-page") {
        why = "你網站上沒有一頁在講這件事，AI 沒有你的內容可以用。";
      } else {
        why = r.reason.detail;
      }

      // 可以怎麼做：別人的推薦文你控制不了，只給自己網站做得到的事
      let todoLead = "";
      let todos: string[] = [];
      if (r.reason.kind === "chose-others" && hasPage) {
        const points = quote ? reasonPoints(quote.text) : [];
        todoLead = `在${pageName(m!.pageUrl, m!.pageTitle)}這頁：`;
        todos = points.length ? points.map((x) => x.todo) : ["寫出適合哪些人、怎麼使用", "列出實際案例或推薦過你的人"];
      } else if (r.reason.advice) {
        todos = [r.reason.advice];
      }
      return { r, why, todoLead, todos, rival, quote };
    });
  const allNamed = d.rows.length - items.length;

  return (
    <div className="space-y-4">
      {items.map(({ r, why, todoLead, todos, rival, quote }, i) => (
        <section key={r.question} className="rounded-xl border border-line bg-card p-5">
          <p className="text-[13px] text-ink3">題目 {i + 1}</p>
          <h3 className="mt-0.5 text-[17px] font-bold leading-snug text-ink">{r.question}</h3>

          <p className="mt-4 text-[13px] font-semibold text-ink3">為什麼沒推你</p>
          <p className="mt-1 text-[16px] leading-relaxed text-ink">{why}</p>

          {rival && quote && (
            <blockquote className="mt-3 border-l-4 border-lime pl-3 text-[14px] leading-relaxed text-ink2">
              <span className="text-ink3">AI 推 {rival} 時這樣寫：</span>「{quote.text}」
              <span className="ml-1 text-[13px] text-ink3">— {quote.engine}</span>
            </blockquote>
          )}

          {todos.length > 0 && (
            <div className="mt-4 rounded-lg bg-[var(--limeTint)] px-4 py-3">
              <p className="text-[13px] font-semibold text-ink3">可以怎麼做</p>
              {todoLead && <p className="mt-1 text-[15px] font-medium text-ink">{todoLead}</p>}
              {todos.length === 1 && !todoLead ? (
                <p className="mt-1 text-[15px] font-medium text-ink">{todos[0]}</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px] text-ink">
                  {todos.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      ))}
      {allNamed > 0 && <p className="text-[14px] text-ink3">另有 {allNamed} 題，問的每一家 AI 都推了你。</p>}
      <p className="text-[14px] text-ink3">AI 挑誰也看知名度、別人怎麼說你，這兩件事這份報告量不到。{d.recencyNote}</p>
    </div>
  );
}
