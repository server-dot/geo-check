import Link from 'next/link';
import JsonLd from './JsonLd';
import { absUrl } from '@/lib/site';

export type Crumb = { name: string; href?: string };

// 可見的麵包屑 + BreadcrumbList JSON-LD 一起出，兩邊永遠一致。
// 最後一節是目前這頁（或所屬分類），不給連結；JSON-LD 最後一節照 Google 的規範可以不帶 item。
export default function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: absUrl(c.href) } : {}),
    })),
  };
  return (
    <nav aria-label="breadcrumb" className={className ?? 'mono text-[11.5px] text-ink3'}>
      <JsonLd data={data} />
      {items.map((c, i) => (
        <span key={`${c.name}-${i}`}>
          {i > 0 && ' / '}
          {c.href ? <Link href={c.href}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
        </span>
      ))}
    </nav>
  );
}
