import JsonLd from './JsonLd';
import type { Post } from '@/lib/geo-posts';
import { ORG, SITE_URL, absUrl } from '@/lib/site';

// 文章頁的 Article 標記。作者掛經營者（積木媒體行銷），沒有具名作者就不編一個；
// author／datePublished 是健檢對 Article 的兩個必填欄位。
export default function ArticleJsonLd({ post, description }: { post: Post & { href: string }; description: string | null | undefined }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: 'zh-Hant',
    articleSection: post.cat,
    mainEntityOfPage: absUrl(post.href),
    url: absUrl(post.href),
    // 直接內嵌，不用 @id 指到 layout 那份 Organization——跨 <script> 的 @id 參照
    // 很多驗證器（包含我們自己的逐欄位檢查）不會去解析，會顯示成空的作者。
    author: { '@type': 'Organization', name: ORG.name, url: ORG.url },
    publisher: { '@type': 'Organization', name: ORG.name, url: ORG.url, logo: { '@type': 'ImageObject', url: ORG.logo } },
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
  return <JsonLd data={data} />;
}
