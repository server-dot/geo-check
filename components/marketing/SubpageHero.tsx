import Breadcrumb from "@/components/seo/Breadcrumb";

// 四個子頁（GEO 知識／判斷標準／費用／關於我們）共用的淺色 hero：
// 56px k 欄 + 麵包屑 + eyebrow + 44px H1（後半句用萊姆螢光筆）+ lede 段落。
// 麵包屑固定「首頁 / 這一頁」，同時輸出 BreadcrumbList JSON-LD（健檢的「標示所在位置」項目）。
export default function SubpageHero({
  k,
  eyebrow,
  crumb,
  heading,
  lede,
  children,
}: {
  k: string;
  eyebrow: string;
  crumb: string;
  heading: React.ReactNode;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-line">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 md:grid-cols-[56px_1fr] gap-x-6 px-5 md:px-10 pb-10 md:pb-[52px] pt-8 md:pt-[60px]">
        <div className="k hidden md:block">{k}</div>
        <div>
          <Breadcrumb items={[{ name: "首頁", href: "/" }, { name: crumb }]} className="mono mb-4 text-[11.5px] text-ink3" />
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="mt-4 max-w-[19em] text-[30px] md:text-[44px] leading-[1.18] tracking-[-0.035em]">{heading}</h1>
          <p className="mt-[18px] max-w-[36em] text-[16.5px] text-ink2">{lede}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
