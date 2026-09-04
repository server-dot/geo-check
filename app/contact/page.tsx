import type { Metadata } from "next";
import Masthead from "@/components/marketing/Masthead";
import Section from "@/components/marketing/Section";
import SubpageHero from "@/components/marketing/SubpageHero";
import Footer from "@/components/marketing/Footer";
import ContactTopicChips from "@/components/marketing/ContactTopicChips";

export const metadata: Metadata = {
  title: "聯絡我們｜AI 搜尋能見度健檢",
  description: "健檢報告的問題、想知道怎麼修，或是要我們接手優化，填表單或用 Line 傳網址給我們都可以。",
};

const CONTACTS = [
  { name: "電話", value: "02-27457601", note: "週一至週五" },
  { name: "地址", value: "台北市信義區東興路 49 號 11 樓", note: "台北" },
  { name: "營業時間", value: "週一至週五 10:00–19:00", note: "—" },
  { name: "網站", value: "stack.com.tw", note: "積木媒體行銷" },
];

const POLICIES = [
  { name: "健檢問題優先回", desc: "報告裡標成需處理的項目，我們會告訴你怎麼確認與修", tag: "優先" },
  { name: "一定回信", desc: "合作洽詢與問題回報都會回覆，不接的案子也會直接說", tag: "必回" },
  { name: "不做保證排名", desc: "要求保證 AI 一定會提到你的品牌，我們會直接婉拒", tag: "婉拒" },
];

const STACK_FORM_URL = "https://stack.com.tw/%e8%81%af%e7%b5%a1%e6%88%91%e5%80%91/#form";
const LINE_URL = "https://lin.ee/UhKq8H1";

export default function ContactPage() {
  return (
    <div className="marketing">
      <Masthead active="contact" />

      <SubpageHero
        k="CONTACT"
        eyebrow="聯絡我們 · CONTACT"
        heading={<>健檢報告的問題、<mark className="lime-highlight">直接問我們</mark>。</>}
        lede="報告看不懂、想知道怎麼修，或是要我們接手優化，填表單或用 Line 傳網址給我們都可以。週一至週五 10:00–19:00 回覆。"
      />

      <div className="border-b border-line bg-card">
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-x-16 gap-y-12 px-10 py-[72px] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <div className="eyebrow">FORM</div>
            <h2 className="mt-[14px] text-[30px]">填表單與我們取得聯繫</h2>
            <p className="prose mt-3 text-[15.5px]">
              附上要檢查的網址，並說明想解決的問題；合作洽詢請說明形式、時程與預算範圍，我們處理會快很多。
            </p>

            <div className="mt-8 grid grid-cols-1 gap-[18px] sm:grid-cols-2">
              <div>
                <span className="lbl">稱呼</span>
                <input className="fld" type="text" placeholder="王小明" />
              </div>
              <div>
                <span className="lbl">品牌／單位</span>
                <input className="fld" type="text" placeholder="積木媒體行銷" />
              </div>
              <div>
                <span className="lbl">信箱</span>
                <input className="fld" type="email" placeholder="name@example.com" />
              </div>
              <div>
                <span className="lbl">電話</span>
                <input className="fld" type="tel" placeholder="02-27457601" />
              </div>
              <div className="sm:col-span-2">
                <span className="lbl">網站網址</span>
                <input className="input-mono" type="url" placeholder="https://example.com" />
              </div>

              <div className="sm:col-span-2 mt-1">
                <span className="lbl">諮詢事項（可多選）</span>
                <ContactTopicChips />
              </div>

              <div className="sm:col-span-2">
                <span className="lbl">詢問內容</span>
                <textarea
                  className="fld"
                  rows={5}
                  placeholder="例如：ChatGPT 問我們的品牌都回答同業，想知道是哪裡的問題。"
                />
              </div>

              <p className="sm:col-span-2 text-[13px] text-ink3">
                目前送出會帶你到積木媒體行銷官網的聯絡表單，上面填的內容需要在那邊的表單再貼一次——送出表示你同意我們用你留的信箱或電話回覆，資料不會用於行銷或提供給第三方。
              </p>
              <div className="sm:col-span-2 flex flex-wrap gap-3">
                <a href={STACK_FORM_URL} className="btn-lime">
                  送出
                </a>
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow">LINE</div>
            <h3 className="mt-3 text-[19px]">用 Line 傳網址給我們</h3>
            <p className="mt-2 text-[14.5px] text-ink2">掃 QR code 加好友，直接把要檢查的網址貼過來，比填表單快。</p>
            <a href={LINE_URL} className="mt-[18px] block w-[168px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- 固定素材、非使用者上傳圖片，不需要 next/image 的最佳化/尺寸協商 */}
              <img src="/line-qr.png" alt="加 GEOCHECK 官方 Line 好友的 QR code" className="block h-[168px] w-[168px] rounded-lg border border-line" />
            </a>

            <ul className="mt-[34px] list">
              {CONTACTS.map((c) => (
                <li key={c.name} className="list-row">
                  <div className="nm">{c.name}</div>
                  <div className="why">{c.value}</div>
                  <div className="st">{c.note}</div>
                </li>
              ))}
            </ul>

            <div className="mt-[30px]">
              <span className="lbl">辦公室位置</span>
              <div className="overflow-hidden rounded-lg border border-line bg-paper">
                <iframe
                  title="積木媒體行銷位置地圖"
                  src="https://maps.google.com/maps?q=%E5%8F%B0%E5%8C%97%E5%B8%82%E4%BF%A1%E7%BE%A9%E5%8D%80%E6%9D%B1%E8%88%88%E8%B7%AF49%E8%99%9F11%E6%A8%93&z=17&output=embed"
                  className="block h-[240px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <a
                className="mono mt-2.5 inline-block text-xs"
                href="https://maps.google.com/maps?q=%E5%8F%B0%E5%8C%97%E5%B8%82%E4%BF%A1%E7%BE%A9%E5%8D%80%E6%9D%B1%E8%88%88%E8%B7%AF49%E8%99%9F11%E6%A8%93"
              >
                在 Google 地圖開啟
              </a>
            </div>
          </div>
        </div>
      </div>

      <Section k="01" eyebrow="HOW WE REPLY" title="我們怎麼處理來信" noBorder>
        <ul className="mt-[26px] list">
          {POLICIES.map((p) => (
            <li key={p.name} className="list-row">
              <div className="nm">{p.name}</div>
              <div className="why">{p.desc}</div>
              <div className="st">{p.tag}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Footer />
    </div>
  );
}
