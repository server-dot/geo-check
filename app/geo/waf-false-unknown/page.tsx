import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/marketing/Masthead";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "健檢顯示「無法判定」，是防火牆擋住了嗎？｜AI 搜尋能見度健檢",
  description: "robots.txt 回應 403，不代表網站對 AI 開放，只是我們讀不到。健檢怎麼辨識是哪家 WAF，以及你要怎麼自己確認。",
};

const STEPS = [
  { name: "打開 https://你的網域/robots.txt，看瀏覽器能不能正常顯示內容", tag: "2 分鐘" },
  { name: "如果連你自己都打不開或跳驗證頁，先確認網站本身沒有故障", tag: "5 分鐘" },
  { name: "找到健檢辨識出的 WAF／CDN 廠商，照對應的後台設定放行 AI 爬蟲的 User-Agent", tag: "工程師" },
];

const RELATED = [
  { title: "robots.txt 明明允許，AI 爬蟲卻連不進來？", href: "/geo/waf-blocks-despite-allow" },
  { title: "網站用 JavaScript 渲染，AI 讀得到內容嗎？", href: "/geo/js-rendering-empty-shell" },
  { title: "結構化資料要補哪些欄位，AI 才認得出你是誰？", href: "/geo/schema-priority" },
];

export default function WafFalseUnknownArticlePage() {
  return (
    <div className="marketing">
      <Masthead active="geo" />

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 pb-[52px] pt-[60px]">
          <div className="k">POST</div>
          <div>
            <div className="mono text-[11.5px] text-ink3">
              <Link href="/geo">GEO 知識</Link> / 技術與索引
            </div>
            <h1 className="mt-4 max-w-[22em] text-[44px] leading-[1.18] tracking-[-0.035em]">
              健檢顯示「無法判定」，是防火牆擋住了嗎？
            </h1>
            <p className="mt-[18px] max-w-[34em] text-[16.5px] text-ink2">
              robots.txt 回應 403，不代表網站對 AI 開放，只是我們讀不到——這種情況很容易被誤解成
              「沒設限、應該算過關」，但讀不到答案跟答案是好的，是兩件不一樣的事。
            </p>
            <div className="mono mt-5 flex flex-wrap gap-5 text-[11.5px] text-ink3">
              <span>2026-08-29</span>
              <span>（作者待填）</span>
              <span>（閱讀時間待填）</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr_220px] gap-x-6 px-10 py-[72px]">
          <div className="k">01</div>

          <div className="max-w-[34em]">
            <p className="text-[15.5px] leading-[1.75] text-ink2">
              健檢請求 robots.txt 時，站方前面掛的 WAF（Web Application Firewall）或 CDN
              有時候會把我們的請求一起攔下來，回一個 403 或挑戰頁，不是真正的 robots.txt 內容。
              如果健檢把這種情況也算「可存取」，等於是給了一個假的綠燈——不確定的事不能寫成通過，
              所以這種狀況會被標成 ⚪ 無法判定，跟真正確認過「可存取」或「被擋」的結果分開處理，
              不會混在同一個燈號裡。
            </p>

            <h2 className="mt-11 text-[30px]">問題長什麼樣</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              健檢會讀回應標頭（headers），比對幾家常見 WAF／CDN 廠商的特徵訊號，辨識出可能是誰擋的——
              命中率不是 100%，廠商會變更 headers、也可能被代理層剝掉，辨識不出來就不硬猜，
              直接告訴你「讀不到」跟「怎麼自己確認」。目前認得出的廠商包括 Cloudflare、Akamai、
              Imperva、Sucuri、AWS CloudFront／WAF、Fastly、F5 BIG-IP。
            </p>
            <div className="excerpt whitespace-pre-wrap">
              {"⚪ 無法判定：robots.txt 回應 403\n這不代表你的網站對 AI 開放——很可能有 robots.txt 但我們讀不到。\n\n偵測到可能的原因：Cloudflare（Bot 攔截／挑戰頁）\n到 Cloudflare 後台「Security → Bots」，確認 Bot Fight Mode／\nSuper Bot Fight Mode 有沒有連好爬蟲一起擋掉，並在「Verified Bots」\n或自訂規則中放行 GPTBot、ClaudeBot、PerplexityBot 等 AI 爬蟲的 User-Agent。"}
            </div>

            <h2 className="mt-11 text-[30px]">怎麼修</h2>
            <div className="mt-[18px]">
              {STEPS.map((s) => (
                <div key={s.name} className="list-row list-row--step">
                  <div className="nm">{s.name}</div>
                  <div className="st">{s.tag}</div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[15.5px] leading-[1.75] text-ink2">
              辨識出的廠商不同，後台設定的位置也不同——Cloudflare 是 Security → Bots，Akamai 是
              Bot Manager／Kona Site Defender，Imperva 是 Bot Access Control。健檢給的建議會依實際辨識出的廠商，
              直接告訴你去哪個後台開哪個設定，不是「請聯絡你的網站管理員」這種空話。
            </p>

            <h2 className="mt-11 text-[30px]">改完怎麼複驗</h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.75] text-ink2">
              回到 <Link href="/">健檢</Link> 重跑一次，這一項應該從 ⚪ 無法判定 變成{" "}
              <span className="t-ok">可存取</span>。你也可以先自己在瀏覽器打開{" "}
              <span className="mono">https://你的網域/robots.txt</span>
              人工確認——如果連你自己都打不開或跳出驗證頁，代表擋的範圍比 AI 爬蟲更廣，要先確認網站本身沒有故障。
            </p>
            <p className="note">
              （放行 AI 爬蟲的 User-Agent，跟允不允許它抓走內容拿去訓練模型是兩回事——想放行讀取但保留其他權利，
              可以搭配 Content Signals 表態，見「要讓 AI 引用你的內容，該怎麼表態？」那篇。）
            </p>
          </div>

          <div>
            <div className="k">本文對應的檢測項目</div>
            <div className="mt-3.5 rounded-[10px] bg-ink p-5 text-paper">
              <p className="text-[15px] font-semibold">AI 爬蟲的存取權限</p>
              <p className="mono mt-2 text-xs leading-[1.7] text-[#a9b5ac]">
                可存取 / 被擋 / 無法判定 / 政策允許但實測被擋
              </p>
              <Link href="/" className="btn-lime mt-[18px] inline-block text-[13.5px]">
                檢測我的網站
              </Link>
            </div>
            <div className="k mt-8">相關文章</div>
            <div className="mt-3.5 grid gap-3 text-sm">
              {RELATED.map((r) => (
                <Link key={r.href} href={r.href} className="text-ink3">
                  {r.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1120px] px-10 py-[72px]">
          <h2 className="max-w-[20em] text-[34px] tracking-[-0.035em]">看看你的 robots.txt 讀不讀得到。</h2>
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
