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
  // 「客服 AI 自動回覆 — LINE/IG 訊息接到 GPT，FAQ 自動處理」只留破折號前那段（11-17 小積木：整串貼出來看不懂）
  const t = title.split(/[｜|]|\s[—–-]\s/)[0].trim() || url;
  return home ? `官網首頁「${t}」` : `「${t}」`;
}

// 優先挑有講「為什麼」的句子（主打、適合、特色、成分…），標題列、只有品牌名的那種不要
// AI 推對手的理由裡講到哪幾類事情，換成你網站上可以寫的項目
// 每類附一句「你那頁具體要寫什麼」，不講「寫清楚」這種空話（11-17 小積木：「啥屁話」）
const POINTS: [RegExp, string, string][] = [
  [/pH|弱酸|酸鹼/i, "pH 值", "寫出產品 pH 值的實際數字"],
  [/成分|萃|乳酸|胺基酸|益生/, "成分", "列出主要成分，每個成分用一句話講它的作用"],
  [/低敏|溫和|無皂鹼|不含|無添加/, "溫和無添加", "寫明不含哪些東西（皂鹼、香精、酒精等）"],
  [/孕|產後|敏感肌/, "適合誰用", "寫出適合哪些人用，例如孕期、產後、敏感肌"],
  [/適合|族群|中小企業|新創|品牌型|規模/, "適合誰", "寫出最適合哪些人、在什麼情況下選你"],
  [/媒體|排行|No\.?\s?1|第一|得獎|評比/i, "媒體報導或得獎", "有被報導、得獎或上排行榜的，列出名稱、年份並附原文連結"],
  [/醫師|婦產科|醫療|藥局/, "醫師或醫療通路背書", "有醫師推薦、或在藥局／婦產科販售的，寫出是誰、在哪裡"],
  [/口碑|評價|好評|熱銷|銷售/, "使用者評價", "放上使用者評價，或銷量、回購率這類數字"],
  [/價格|平價|預算|CP|報價|費用|收費|月費|方案/i, "價格", "寫出價格或收費方式（起價、方案、怎麼計費）"],
  // 11-17 小積木：「能初步講建議嗎 relove 那篇寫超好」——上面幾類全是保養品用語，接案、顧問、軟體業抓不到，建議只剩空話
  [/串接|整合|API|Zendesk|Omnichat|Shopify|ERP|CRM|LINE|多平台|多渠道/i, "能串接哪些系統", "列出你能串接的系統和平台（例如 LINE、Shopify、ERP），一個一行"],
  [/案例|服務過|數百家|上百家|實績|導入經驗|公開案例/, "做過的案例", "放 2～3 個實際案例：客戶是哪一行、做了什麼、結果的數字"],
  [/流程|步驟|盤點|評估|PoC|試點|分階段|小步/i, "導入流程", "寫出合作流程：從評估、試做到上線，每一步做什麼、大概多久"],
  [/年資|超過\s?\d+\s?年|成立|團隊|工程師|認證|合作夥伴|背景|深耕/, "資歷與團隊", "寫出做這行幾年、團隊背景，有哪些認證或合作夥伴資格"],
  [/資安|部署|地端|私有雲|資料保護|權限|資料主權/, "資料與資安", "寫明資料放在哪裡、怎麼保護，能不能私有雲或地端部署"],
  [/維運|維護|售後|保固|交接|教育訓練|培訓|教學/, "上線後的維護與交接", "寫出上線後怎麼維護、出問題找誰、怎麼教你的團隊自己用"],
  [/台灣品牌|台灣製|MIT|本土品牌/, "台灣品牌", "寫明是台灣品牌、在哪裡製造"],
];

// 多段文字時前面的優先（原話裡講的先列，其他行補到 4 個）
export function reasonPoints(...texts: string[]): { label: string; todo: string }[] {
  const out: { label: string; todo: string }[] = [];
  for (const text of texts) {
    for (const [re, label, todo] of POINTS) {
      if (out.length < 4 && re.test(text) && !out.some((x) => x.label === label)) out.push({ label, todo });
    }
  }
  return out;
}

// AI 講這幾個對手的所有行（不只挑出來的那一句原話）：表格一列、條列一點、或品牌標題底下那段。
// 11-17 aiqkangber：ChatGPT 把 Raccoon AI 的理由寫在表格裡（可串接 Zendesk、已服務數百家企業），只看一句會漏掉
export function rivalLines(answers: Answer[], rivals: string[]): string {
  const keys = rivals.flatMap((r) => [...(r.match(/[\u4e00-\u9fff]{2,}/g) ?? []), ...(r.match(/[A-Za-z][A-Za-z0-9.&'-]{2,}/g) ?? [])]).map((k) => k.toLowerCase());
  if (keys.length === 0) return "";
  const out: string[] = [];
  for (const a of answers) {
    const lines = (a.answer ?? "").split("\n");
    lines.forEach((line, i) => {
      if (!keys.some((k) => line.toLowerCase().includes(k))) return;
      out.push(line);
      // 標題行（「### 4. 賽吉兒」「- **Raccoon AI**」）的說明在下面兩行
      if (line.replace(/[#*\-\d.\s]/g, "").length <= 30) out.push(lines[i + 1] ?? "", lines[i + 2] ?? "");
    });
  }
  return out.filter((l) => !HEDGE_LINE.test(l)).join("\n");
}
const HEDGE_LINE = /如果你不限定|也可以列入比較|可從中了解/;


// 打分：句子裡有品牌名 +4；講別人怎麼看它（推薦、排行、媒體、醫師、口碑）+2；講產品特色 +1；衛教提醒（諮詢、不要、避免）-2
const STRONG = /推薦|排行|No\.?\s?1|第一|媒體|醫師|婦產科|口碑|評價|熱銷|認證|得獎|銷售/i;
const WEAK = /主打|特色|成分|配方|溫和|低敏|弱酸|專為|適合|強調|因為|理由|款式|無皂鹼|不含|添加|標示|擅長|專精|提供|案例/;
const ADVICE = /諮詢|就醫|不要|避免|應該先/;
// 提醒、轉介句不是推薦理由（11-17 Relove：「這個品牌不是台灣品牌…如果你不限定也可以列入比較」
// 「知名品牌通常設有護理指南，例如賽吉兒官網，可從中了解…」被當成 AI 推賽吉兒的理由）
const HEDGE = /不是.{0,8}品牌|如果你|如果您|不限定|也可以列入|可從中|通常設有|可參考|可以參考/;

export function rivalQuote(answers: Answer[], rival: string): { text: string; engine: string } | null {
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
      // 句子主角是別人、對手只是被順帶舉例的不算（「屈臣氏 Watsons：…例如 SUMMER'S EVE 舒摩兒」
      // 「婦產科醫師：常受邀於各品牌（如婦潔、賽吉兒）」）：冒號前的主詞沒有對手，或對手只出現在「例如／如」後面
      const about = (t: string) => {
        const low = t.toLowerCase();
        const at = Math.min(...keys.map((k) => low.indexOf(k)).filter((i) => i >= 0));
        if (!Number.isFinite(at)) return false;
        const colon = t.search(/[：:]/);
        if (colon >= 0 && colon <= 25 && at > colon) return false;
        const eg = t.search(/例如|（如|\(如|包括/);
        return !(eg >= 0 && eg < at);
      };
      const ownPara = para.length <= 700 && about(para.trim().slice(0, 40));
      for (const t of sentences) {
        if (!about(t) && !ownPara) continue;
        // 品牌那段裡的句子（品牌名一行、說明在下面）也算在講它，給 1 分
        const score =
          (about(t) ? 4 : ownPara ? 1 : 0) + (STRONG.test(t) ? 2 : 0) + (WEAK.test(t) ? 1 : 0) - (ADVICE.test(t) ? 2 : 0) - (HEDGE.test(t) ? 3 : 0);
        // 只有品牌名、沒講理由的句子（「賽吉兒 SAUGELLA：菁萃潔浴凝露」）不算
        if (score < (about(t) ? 5 : 2)) continue;
        if (!best || score > best.score) best = { text: t.length > 90 ? `${t.slice(0, 90)}…` : t, engine: a.engine, score };
      }
      // 沒有講理由的句子時退而求其次：品牌名那句；如果那句只是標題（短），把下一句接上去
      const fi = sentences.findIndex(about);
      if (!fallback && fi >= 0) {
        const first = sentences[fi];
        const t = [...first].length <= 30 && sentences[fi + 1] ? `${first}：${sentences[fi + 1]}` : first;
        // 備案也不收提醒、轉介句：寧可寫「只列了名字」，不要把提醒當理由
        if (HEDGE.test(t)) continue;
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
      const results = rec.questions[qi].results;
      const quote = rival ? rivalQuote(results as Answer[], rival) : null;
      // AI 這題有沒有讀到你：讀到那一頁／讀了網站別頁／完全沒讀——這是看得到的事實，比「有頁但 AI 推了別人」有用
      const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
      const pageSeen = !!r.match?.pageUrl && results.some((x) => x.citations?.some((c) => norm(c.url) === norm(r.match!.pageUrl)));
      const rivalsText = r.rivals.slice(0, 2).join("、");
      const m = r.match;
      const hasPage = !!m?.pageUrl && r.reason.kind !== "no-page";
      const missing = m?.missing ?? [];

      // 為什麼沒推你：一句話
      let why: ReactNode;
      if (r.reason.kind === "chose-others" && hasPage) {
        // 11-17 小積木：「有在講這個，但 AI 推了大同世界科技」啥屁話——只是重講現象。改講 AI 有沒有讀到你
        const pushed = rivalsText ? <>，推的是 <strong>{rivalsText}</strong></> : null;
        why = pageSeen ? (
          <>
            AI 有讀到你的 <PageLink url={m!.pageUrl} title={m!.pageTitle} />，但推薦時沒有點你的名字{pushed}。
          </>
        ) : (
          <>
            你有一頁 <PageLink url={m!.pageUrl} title={m!.pageTitle} /> 在講這個，但 AI 回答這題時
            {r.selfCited > 0 ? "沒讀到這頁（只讀了你網站的別頁）" : "沒讀到你的網站"}
            {pushed}。
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
      // AI 推前兩名對手時講到哪幾類事，換成你網站上可以寫的項目
      const top = r.rivals.slice(0, 2);
      const points = top.length ? reasonPoints(quote?.text ?? "", rivalLines(results as Answer[], top)) : [];
      const said = points.length ? `AI 推${top.join("、")}時講到${points.map((x) => x.label).join("、")}。` : "";
      let todoLead = "";
      let todos: string[] = [];
      if (r.reason.kind === "chose-others" && hasPage) {
        todoLead = `${said}在${pageName(m!.pageUrl, m!.pageTitle)}這頁：`;
        todos = points.length ? points.map((x) => x.todo) : ["寫出適合哪些人、怎麼使用", "列出實際案例或推薦過你的人"];
      } else if (r.reason.advice && points.length) {
        // 沒有頁／頁沒回答這題：先講要新增或補哪一頁，再講那頁要寫什麼
        todoLead = `${r.reason.advice.replace(/[。.]\s*$/, "")}。${said}這頁可以寫：`;
        todos = points.map((x) => x.todo);
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

          {rival && !quote && <p className="mt-3 text-[14px] text-ink3">AI 推 {rival} 時只列了名字，沒寫為什麼推它。</p>}
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
