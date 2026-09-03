import type { Metadata } from "next";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "關於我們｜AI 搜尋能見度健檢",
  description: "積木媒體行銷｜台北的 SEO 與 AI SEO 團隊",
};

const CHECKED_COUNT = Number(process.env.CHECKED_COUNT ?? 250);

const SERVICES = [
  { name: "SEO 關鍵字優化", desc: "關鍵字研究、站內優化、內容規劃", link: "stack.com.tw" },
  { name: "AI SEO / GEO", desc: "AI 引擎的可讀性、結構化資料與引用來源", link: "aiseo服務" },
  { name: "網頁設計製作", desc: "符合 SEO 架構的網站設計與製作", link: "web-design" },
  { name: "反向連結", desc: "外部權威與連結品質", link: "反向連結購買" },
  { name: "媒體採購", desc: "廣告投放與媒體版位", link: "media_buying" },
];

const PRINCIPLES = [
  { name: "只讀取公開可存取的內容", desc: "跟一般搜尋引擎的爬蟲一樣，是唯讀的，不會改動你的網站", tag: "唯讀" },
  { name: "不儲存你的網站內容", desc: "檢測需要的內容只用來產生這一份報告", tag: "不留存" },
  { name: "不會把不確定的事寫成通過", desc: "讀不到答案時標成 ⚪ 無法判定，並告訴你怎麼自己確認", tag: "無法判定" },
];

const CONTACTS = [
  { name: "電話", value: "02-27457601", note: "週一至週五" },
  { name: "Line", value: "@683sivea", note: "即時" },
  { name: "地址", value: "台北市信義區東興路 49 號 11 樓", note: "台北" },
  { name: "營業時間", value: "週一至週五 10:00–19:00", note: "—" },
  { name: "網站", value: "stack.com.tw", note: "積木媒體行銷" },
];

export default function AboutPage() {
  return (
    <div className="marketing">
      <Masthead active="about" />

      <SubpageHero
        k="ABOUT"
        eyebrow="關於我們 · ABOUT"
        heading={<mark className="lime-highlight">積木媒體行銷</mark>}
        lede="我們是台北的 SEO 與 AI SEO 團隊，做關鍵字優化、網站架構、內容與外部連結，也處理 AIO / GEO / AEO 的能見度問題。這份健檢是我們在客戶專案裡實際會跑的檢查，整理出來給大家自己用。"
      >
        <div className="mono mt-[22px] flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink3">
          <a href="https://stack.com.tw/">stack.com.tw</a>
          <span>已檢測 {CHECKED_COUNT} 個網站</span>
        </div>
      </SubpageHero>

      <Section k="01" eyebrow="WHY WE BUILT IT" title="為什麼做這個工具">
        <p className="prose mt-4">
          客戶問的問題變了。以前是「我的關鍵字排第幾」，現在是「為什麼 ChatGPT 回答同業，沒回答我」。
          這兩件事的檢查方式不一樣：排名看得到，AI 讀不讀得到你的網站，得用 AI 爬蟲的身分實際去讀一次才知道。
        </p>
        <p className="prose mt-4">
          所以我們把平常在專案裡手動做的檢查寫成工具：用各家爬蟲的身分請求頁面、關掉 JavaScript
          量可讀內容、實際去問 AI 引擎認不認得這個品牌。跑過 {CHECKED_COUNT} 個網站之後，決定把它開放出來。
        </p>
      </Section>

      <Section k="02" eyebrow="WHAT WE DO" title="我們平常在做的事">
        <ul className="mt-[26px] max-w-[52em]">
          {SERVICES.map((s) => (
            <li key={s.name} className="list-row">
              <div className="nm">{s.name}</div>
              <div className="why">{s.desc}</div>
              <div className="st">{s.link}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section k="03" eyebrow="HOW WE HANDLE YOUR SITE" title="我們怎麼解析你的網站">
        <ul className="mt-[26px] max-w-[52em]">
          {PRINCIPLES.map((p) => (
            <li key={p.name} className="list-row">
              <div className="nm">{p.name}</div>
              <div className="why">{p.desc}</div>
              <div className="st">{p.tag}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section k="04" eyebrow="CONTACT" title="聯絡我們" noBorder>
        <div className="mt-[30px] grid grid-cols-[120px_1fr] items-start gap-x-7">
          <div className="flex h-[120px] w-[120px] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- 固定素材、非使用者上傳圖片，不需要 next/image 的最佳化/尺寸協商 */}
            <img src="/stack-logo.png" alt="積木媒體行銷" className="h-full w-full object-contain" />
          </div>
          <div>
            <ul>
              {CONTACTS.map((c) => (
                <li key={c.name} className="list-row">
                  <div className="nm">{c.name}</div>
                  <div className="why">{c.value}</div>
                  <div className="st">{c.note}</div>
                </li>
              ))}
            </ul>
            <div className="mt-[26px] flex flex-wrap gap-3">
              <a className="btn-lime no-underline" href="https://stack.com.tw/%e8%81%af%e7%b5%a1%e6%88%91%e5%80%91/#form">
                填聯絡表單
              </a>
              <a className="btn-line no-underline" href="https://lin.ee/UhKq8H1">
                Line 詢問 @683sivea
              </a>
            </div>
          </div>
        </div>
      </Section>

      <Footer />
    </div>
  );
}
