import type { MetadataRoute } from 'next';
import { getPosts } from '@/lib/blog';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://quantaura.tech';

  // Only list pages that are publicly accessible without authentication.
  // Auth-gated routes (/dashboard, /predictions, /portfolio, /backtest,
  // /models, /markets, /research) are excluded — Google was finding them
  // here, crawling them, hitting the auth wall, and reporting noindex/404.
  // They are also disallowed in robots.ts to stop crawl budget waste.
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];

  // Every published post, straight from the same index the blog renders.
  // getPosts() returns [] on any failure, so a blog outage can never break
  // the whole sitemap.
  const posts = await getPosts();
  const blogRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at || p.published_at),
    // Daily posts age fast; weekly recaps are reference content. Both get
    // weekly reindexing so Google picks up corrections and updated_at bumps.
    changeFrequency: 'weekly',
    priority: p.post_type === 'daily' ? 0.6 : 0.7,
  }));

  return [...staticRoutes, ...blogRoutes];
}
