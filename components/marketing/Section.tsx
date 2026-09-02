// 五個行銷頁重複最多次的版面骨架：56px 編號欄 + 1fr 內容欄，72px 上下留白、
// 底線分隔。抽出來是因為這個結構在 5 個頁面裡出現快 20 次，抄一份 dc.html 的
// inline style 逐處貼就是活生生的複製貼上地獄。
export default function Section({
  k,
  eyebrow,
  title,
  noBorder,
  children,
}: {
  k: string;
  eyebrow?: string;
  title?: string;
  noBorder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={noBorder ? undefined : "border-b border-line"}>
      <div className="mx-auto grid max-w-[1120px] grid-cols-[56px_1fr] gap-x-6 px-10 py-[72px]">
        <div className="k">{k}</div>
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          {title && <h2 className="mt-[14px] text-[30px]">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}
