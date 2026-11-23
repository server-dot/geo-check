import { askJson, parseJson } from './geo-recommend-visibility';

// ── 回答講的是不是你 ─────────────────────────────────────
// 11-23 aiqkangber：Perplexity 的評價題整篇在講同音的早餐店，引用清單裡剛好有官網，
// 報告就當成「有引用官網、5 段回答之一」。引用清單只代表它查過什麼，要看正文在講誰。
// 一則回答問一次（多則一起問模型會對錯編號）。判成「別人」要附上回答裡真的出現的名字才算；
// 呼叫失敗或不確定就不標——寧可漏標，不要把講對的說成講錯。

const key = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[\s·・.,，。'’"「」()（）\-_@]/g, '');

async function otherSubject(brandName: string, domain: string, about: string, answer: string, apiKey: string): Promise<string | null> {
  const prompt = `有人用名字問 AI「${brandName}」（官網 ${domain}），下面是 AI 的回答。請判斷這則回答主要在講的，是不是這個「${brandName}」，還是把它認成名字相近的其他對象（別的店、公司、品牌、人）。

「${brandName}」官網這樣介紹自己：
${about || '（沒有資料）'}

回答：
${answer}

規則：
- self：回答主要在講這個「${brandName}」，就算有些細節寫錯、評價不好也算 self。
- other：回答主要在介紹或評價另一個對象，做的事跟官網介紹對不起來。
- unsure：兩個都講、回答說查不到、或看不出來。
- who：other 才填，照抄回答裡那個對象的名字，一字不差。

只回傳 JSON：{"subject":"self","who":""}`;
  try {
    const p = parseJson<{ subject?: unknown; who?: unknown }>(await askJson(prompt, apiKey, 100));
    if (p?.subject !== 'other' || typeof p.who !== 'string') return null;
    const who = p.who.trim();
    if (!who || [...who].length > 40 || key(who).length < 2) return null;
    if (key(who) === key(brandName) || !key(answer).includes(key(who))) return null;
    return who;
  } catch {
    return null;
  }
}

// 講別人的回答標上 wrongEntity；它引用到你的網址不算「AI 找得到你」
export async function markWrongEntity<T extends { answer: string; citedSelf: boolean }>(
  brandName: string,
  domain: string,
  about: string,
  answers: T[],
  apiKey: string,
): Promise<(T & { wrongEntity?: string })[]> {
  return Promise.all(
    answers.map(async (a) => {
      const who = await otherSubject(brandName, domain, about, a.answer, apiKey);
      return who ? { ...a, wrongEntity: who, citedSelf: false } : a;
    }),
  );
}
