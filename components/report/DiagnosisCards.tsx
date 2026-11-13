// 「未被推薦原因」網頁版。11-13 小積木：「這頁的重點是我要知道原因」「不要跟推薦題表現搞混，這就是在講原因（初步）」
// 「這題是哪題，總體還是很不直觀」「怎麼又回到原點」（只是把「最接近的頁」換句話說，不是原因）「最好加一些圖例說明」。
// 每題回答「AI 為什麼推別人」，只用 AI 實際留下的東西：
//   1. 你網站上有沒有在回答這題的頁（lib/geo-diagnosis.ts 的判斷）
//   2. AI 參考了誰：看最多的前 3 個網站（名字＋連結）＋有沒有看你的網站、看了哪頁（11-13 長條圖「意義不明」、類別加總「資訊含量很低」）
//   3. AI 自己說的推薦理由：回答原文裡講到第一名對手的一句話，原文照引
// 推你幾次、AI 推了誰的排名屬於「推薦題表現」，不放這裡。只講現象，不寫解法。

import { GATE_SYMBOL, type Diagnosis, type GateState } from "@/lib/geo-diagnosis";
import { buildCitedPages, type BrandTable, type RecommendLike } from "./ReportOverview";

const STATE_CLS: Record<GateState, string> = { pass: "text-ok", partial: "text-warn", fail: "text-fail", unknown: "text-ink3" };

type Answer = { engine: string; answer?: string };

// 網站名：對手／平台有名字就用名字，不然用頁面標題「｜」後面的站名（「造咖」「屈臣氏 Watsons」），再不然用網域
function siteName(p: { brand: string; host: string; title: string }): string {
  if (p.brand) return p.brand;
  // 標題「｜」後面那段要像站名（有英文字，例如「屈臣氏 Watsons」），「身體保養商品推薦」這種分類名不算
  const tail = p.title.split(/\s*[｜|]\s*/).slice(1).pop()?.trim() ?? "";
  return tail && [...tail].length <= 24 && /[A-Za-z]/.test(tail) ? tail : p.host;
}

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
const POINTS: [RegExp, string][] = [
  [/pH|弱酸|酸鹼/i, "pH 值"],
  [/成分|萃|乳酸|胺基酸|益生/, "成分"],
  [/低敏|溫和|無皂鹼|不含|無添加/, "溫和、無添加"],
  [/適合|族群|孕|產後|敏感/, "適合誰用"],
  [/媒體|排行|No\.?\s?1|第一|得獎|評比/i, "媒體報導或得獎"],
  [/醫師|婦產科|醫療|藥局/, "醫師或醫療通路背書"],
  [/口碑|評價|好評|熱銷|銷售/, "使用者評價"],
  [/價格|平價|預算|CP/i, "價格"],
  [/台灣品牌|台灣製|MIT|本土品牌/, "台灣品牌"],
];

function reasonPoints(text: string): string[] {
  return POINTS.filter(([re]) => re.test(text)).map(([, label]) => label).slice(0, 4);
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


export function DiagnosisCards({ d, rec, table }: { d: Diagnosis; rec: RecommendLike; table: BrandTable }) {
  const items = d.rows
    .map((r, qi) => ({ r, qi }))
    .filter(({ r }) => r.reason.kind !== "recommended")
    .map(({ r, qi }) => {
      const q = rec.questions[qi];
      const pages = buildCitedPages({ ...rec, questions: [q] }, table);
      const total = pages.reduce((s, p) => s + p.count, 0);
      const selfPages = pages.filter((p) => p.type === "self").sort((a, b) => b.count - a.count);
      // 別人的網站：同一個網站的多個頁面合併，取前 3 名，連到被看最多次的那一頁
      const groups = new Map<string, { name: string; count: number; url: string; topCount: number; type: string; mentionsSelf: boolean }>();
      for (const p of pages) {
        if (p.type === "self") continue;
        const key = p.brand || p.host;
        const g = groups.get(key) ?? { name: siteName(p), count: 0, url: p.url, topCount: 0, type: p.type, mentionsSelf: false };
        g.count += p.count;
        if (p.mentionsSelf) g.mentionsSelf = true;
        if (p.count > g.topCount) Object.assign(g, { url: p.url, topCount: p.count });
        groups.set(key, g);
      }
      const sites = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 3);
      const rival = r.rivals[0];
      const quote = rival ? rivalQuote(q.results as Answer[], rival) : null;
      // 「有頁在講，AI 還是推了別人」：別人的推薦文你控制不了（11-13 小積木：「誰能控制出現在別的推薦文啊」），
      // 建議只寫自己網站做得到的事——AI 推對手時講了哪些點，就在你那一頁把你自己的同一類資訊寫清楚
      let advice = r.reason.advice;
      if (r.reason.kind === "chose-others" && r.match?.pageTitle) {
        const page = pageName(r.match.pageUrl, r.match.pageTitle);
        const points = quote ? reasonPoints(quote.text) : [];
        advice = points.length
          ? `AI 推${rival}時講的是${points.map((x) => `「${x}」`).join("")}。可以在${page}把你自己這幾點寫清楚，讓 AI 拿得到同樣的資訊。`
          : `可以在${page}寫清楚適合誰、具體怎麼做、做過哪些案例或有誰推薦，讓 AI 有理由選你。`;
      }
      return { r, advice, total, selfPages, sites, rival, quote };
    });
  const allNamed = d.rows.length - items.length;

  return (
    <div className="space-y-4">
      {items.map(({ r, advice, total, selfPages, sites, rival, quote }, i) => {
        return (
          <section key={r.question} className="rounded-xl border border-line bg-card p-5">
            <p className="text-[13px] text-ink3">題目 {i + 1}</p>
            <p className="text-[17px] font-bold text-ink">{r.question}</p>

            <dl className="mt-4 grid gap-x-6 gap-y-4 md:grid-cols-[170px_minmax(0,1fr)]">
              <dt className="text-[14px] font-medium text-ink3">你的網站</dt>
              <dd>
                <p className={`text-[15px] font-bold ${STATE_CLS[r.reason.state]}`}>
                  <span className="mono mr-1.5">{GATE_SYMBOL[r.reason.state]}</span>
                  {r.reason.title}
                </p>
                {r.match?.pageUrl && r.reason.kind !== "no-page" && (
                  <p className="mt-1 text-[15px] text-ink2">
                    最接近的頁：
                    <a href={r.match.pageUrl} target="_blank" rel="noopener noreferrer" className="report-table-link font-medium">
                      {pageName(r.match.pageUrl, r.match.pageTitle)}
                    </a>
                    {r.reason.said && <span>，{r.reason.said}</span>}
                  </p>
                )}
              </dd>

              {advice && (
                <>
                  <dt className="text-[14px] font-medium text-ink3">建議</dt>
                  <dd className="rounded-lg bg-[var(--limeTint)] px-3 py-2 text-[15px] font-medium text-ink">{advice}</dd>
                </>
              )}

              <dt className="text-[14px] font-medium text-ink3">AI 參考了誰</dt>
              <dd className="text-[15px] text-ink">
                {total === 0 ? (
                  <span className="text-ink3">AI 回答時沒有附參考連結</span>
                ) : (
                  <>
                    <ol className="space-y-1">
                      {sites.map((g, k) => (
                        <li key={g.name}>
                          <span className="mr-1.5 text-ink3 tabular-nums">{k + 1}.</span>
                          <a href={g.url} target="_blank" rel="noopener noreferrer" className="report-table-link font-medium">
                            {g.name}
                          </a>
                          <span className="ml-1.5 text-[14px] text-ink3">
                            看了 {g.count} 次
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1.5">
                      {selfPages.length === 0 ? (
                        <span className="font-semibold text-fail">✗ 你的網站一頁都沒被看</span>
                      ) : (
                        <span className="text-ok">
                          <strong>✓ 有看你的網站：</strong>
                          {selfPages.slice(0, 2).map((p, k) => (
                            <span key={p.url}>
                              {k > 0 && "、"}
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="report-table-link">
                                {pageName(p.url, p.title)}
                              </a>
                            </span>
                          ))}
                        </span>
                      )}
                    </p>
                  </>
                )}
              </dd>

              {rival && (
                <>
                  <dt className="text-[14px] font-medium text-ink3">AI 推 {rival} 的理由</dt>
                  <dd>
                    {quote ? (
                      <blockquote className="border-l-4 border-lime pl-3 text-[15px] text-ink">
                        「{quote.text}」<span className="ml-1 text-[13px] text-ink3">— {quote.engine}</span>
                      </blockquote>
                    ) : (
                      <p className="text-[14px] text-ink3">回答裡沒有寫理由，只列了名字</p>
                    )}
                  </dd>
                </>
              )}
            </dl>
          </section>
        );
      })}
      {allNamed > 0 && <p className="text-[14px] text-ink3">另有 {allNamed} 題，問的每一家 AI 都推了你。</p>}
      <p className="text-[14px] text-ink3">AI 挑誰也看知名度、別人怎麼說你，這兩件事這份報告量不到。{d.recencyNote}</p>
    </div>
  );
}
