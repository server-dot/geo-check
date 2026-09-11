import type { MetadataRoute } from 'next';
import { PUBLISHED_POSTS } from '@/lib/geo-posts';
import { STATIC_PAGES, absUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = STATIC_PAGES.map((p) => ({
    url: absUrl(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  const posts = PUBLISHED_POSTS.map((p) => ({
    url: absUrl(p.href),
    lastModified: p.date,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
  return [...pages, ...posts];
}
