import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";
import FaqAccordion from "@/components/marketing/FaqAccordion";

export const metadata: Metadata = {
  title: "費用｜AI 搜尋能見度健檢",
  description: "健檢免費，諮詢也不收費。",
};

const PLANS = [
  {
    label: "01 CHECK",
    price: "免費",
    unit: "健檢工具",
    features: ["首頁 + 多頁深度健檢 21 項", "完整報告與總分 0–100", "不需要註冊，次數不限"],
  },
  {
    label: "02 CONSULT",
    price: "免費",
    unit: "預約諮詢",
    features: ["一起看報告裡的需處理項目", "討論該從哪一項開始改", "由積木媒體行銷的團隊接手"],
  },
];

const STEPS = [
  { title: "你先跑一次健檢", body: "拿到總分與 21 項深度健檢結果。報告連結可以直接轉給同事或工程師。", meta: "約 40 秒" },
  {
    title: "一起讀報告",
    body: "把標成需處理的項目攤開來看，哪些是 robots.txt 一行就能解決、哪些要改網站架構或內容。",
    meta: "線上或台北辦公室",
  },
  {
    title: "排出先改哪一項",
    body: "依影響程度與施工成本排順序。你可以自己做、交給自己的工程師，或請我們報價執行。",
    meta: "不收費",
  },
];

const FAQS = [
  { q: "健檢真的不用錢嗎？", a: "不用。不需要註冊，次數不限，報告完整呈現，沒有把某幾項鎖起來。" },
  { q: "諮詢會不會被推銷？", a: "諮詢的目的是把報告讀完、排出先改哪一項。要不要交給我們執行，看完再決定。" },
  { q: "那你們怎麼收費？", a: "如果後續要我們代為執行 SEO / GEO 的優化工作，才會依專案報價。健檢與諮詢本身不收費。" },
  { q: "我自己有工程師，可以只拿報告嗎？", a: "可以。報告每一列都寫著量到的值與建議做法，直接貼給工程師就能動工。" },
];

export default function PricingPage() {
  return (
    <div className="marketing">
      <Masthead active="pricing" />

      <SubpageHero
        k="FEE"
        eyebrow="費用 · PRICING"
        heading={
          <>
            健檢免費，<mark className="lime-highlight">諮詢也不收費。</mark>
          </>
        }
        lede="工具跑幾次都可以，不需要註冊。報告裡標成需處理的項目，如果你想找人一起看、一起排順序，可以預約一次諮詢；要不要繼續往下做，看完再決定。"
      />

      <Section k="01" eyebrow="TWO THINGS" title="你只會用到兩件事">
        <div className="mt-[30px] grid grid-cols-2 gap-px border-y border-line bg-line">
          {PLANS.map((plan) => (
            <div key={plan.label} className="bg-card px-[22px] pb-[26px] pt-6">
              <div className="k">{plan.label}</div>
              <p className="my-3.5 mb-1 text-[32px] font-bold leading-none tracking-[-0.04em]">{plan.price}</p>
              <p className="mono text-[11.5px] text-ink3">{plan.unit}</p>
              <div className="mt-[18px] border-t border-line2">
                {plan.features.map((f) => (
                  <p key={f} className="border-b border-line2 py-[9px] text-sm text-ink2">
                    {f}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-[26px] flex flex-wrap gap-3">
          <a
            className="btn-lime no-underline"
            href="https://stack.com.tw/%e8%81%af%e7%b5%a1%e6%88%91%e5%80%91/#form"
          >
            預約諮詢
          </a>
          <a className="btn-line no-underline" href="https://lin.ee/UhKq8H1">
            Line 詢問 @683sivea
          </a>
        </div>
      </Section>

      <Section k="02" eyebrow="HOW IT GOES" title="諮詢會發生什麼">
        <ul className="mt-[30px]">
          {STEPS.map((s) => (
            <li key={s.title} className="todo-row">
              <div>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
              <div className="st">{s.meta}</div>
            </li>
          ))}
        </ul>
        <p className="note">要動到程式的部分，報告可以直接貼給你自己的工程師處理，不一定要找我們。</p>
      </Section>

      <Section k="FAQ" eyebrow="FAQ" title="關於費用的常見問題" noBorder>
        <FaqAccordion items={FAQS} />
      </Section>

      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
          <h2 className="max-w-[20em] text-[34px] tracking-[-0.035em]">先跑一次健檢，再決定要不要談。</h2>
          <div className="mt-7 flex gap-3">
            <Link href="/" className="btn-lime no-underline">
              開始檢測
            </Link>
            <Link href="/scoring" className="btn-line-dark">
              看判斷標準
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
