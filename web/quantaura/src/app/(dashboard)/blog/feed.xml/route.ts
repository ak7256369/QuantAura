import { getPosts } from '@/lib/blog';

// RSS is discovery infrastructure: aggregators, readers, and some crawlers
// poll it. Regenerated on the same ISR cadence as the pages it lists.
// (Next requires this to be a literal — keep in sync with lib/blog.ts.)
export const revalidate = 3600;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
  const posts = await getPosts();
  const base = 'https://quantaura.tech';

  const items = posts.map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/blog/${p.slug}</link>
      <guid isPermaLink="true">${base}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
      <description>${esc(p.meta_description)}</description>
    </item>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>QuantAura Research Blog</title>
    <link>${base}/blog</link>
    <atom:link href="${base}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Weekly Bitcoin AI model reviews — every call graded in public, the paper portfolio tracked against buy-and-hold.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `s-maxage=${revalidate}, stale-while-revalidate`,
    },
  });
}
