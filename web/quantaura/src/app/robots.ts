import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://quantaura.tech';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Disallow private/app-only routes that add no SEO value and would
        // waste crawl budget. /api/ is the backend proxy; /dashboard,
        // /portfolio, /account etc. require a login and return 401 for bots.
        // /cdn-cgi/ is Cloudflare infrastructure (email protection, etc.) —
        // those URLs are never real pages and always 404 for crawlers.
        // /signals is a legacy URL that 301s to /predictions; disallowing it
        // prevents Google re-crawling the redirect source.
        // Note: /register and /blog are intentionally NOT disallowed.
        disallow: [
          '/api/',
          '/cdn-cgi/',
          '/signals',
          '/dashboard',
          '/portfolio',
          '/account',
          '/admin',
          '/backtest',
          '/pricing',
          '/predictions',
          '/models',
          '/markets',
          '/research',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
