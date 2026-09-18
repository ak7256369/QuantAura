/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  trailingSlash: false,
  poweredByHeader: false,
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        // Clean public URL for the desktop-widget installer, served by the API
        // (which streams it from the server, out of the git tree).
        source: '/download/widget',
        destination: `${backendUrl}/api/download/widget`,
      },
    ];
  },
  async redirects() {
    // Routes that existed in an earlier version of the site. Google still has
    // them and reports them as 404s in Search Console; a 301 to the page that
    // replaced them clears the error and preserves any accumulated link
    // equity, which a bare 404 discards.
    // /portfolio is a real page again (the paper portfolio), so its old
    // redirect to /dashboard is gone — the URL keeps whatever equity the
    // legacy route accumulated.
    //
    // www → non-www: The canonical form is https://quantaura.tech (no www).
    // The primary redirect lives in Nginx (server_name www.quantaura.tech),
    // but this layer catches any request that bypasses the reverse proxy.
    // Google Search Console was reporting https://www.quantaura.tech/ and
    // /markets as "alternate pages with canonical tag" — these 301s fix that.
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.quantaura.tech' }],
        destination: 'https://quantaura.tech/:path*',
        permanent: true,
      },
      { source: '/signals', destination: '/predictions', permanent: true },
      // Cloudflare / CDN asset-fingerprinting appends a query string to the
      // favicon URL (e.g. /favicon.ico?favicon.0b3bf435.ico). Next.js serves
      // /favicon.ico without any query param, so those requests 404. A 301
      // to the bare path fixes the Search Console error without adding
      // redirects for every fingerprint variant — the ?favicon=… form is
      // handled by the `has` query matcher.
      {
        source: '/favicon.ico',
        has: [{ type: 'query', key: 'favicon' }],
        destination: '/favicon.ico',
        permanent: true,
      },
    ];
  },
  async headers() {
    // _next/static is content-hashed and already served immutable by Next.
    // These cover the unhashed metadata assets, which otherwise ship with no
    // cache policy and are re-fetched on every visit.
    const day = 'public, max-age=86400, stale-while-revalidate=604800';
    return [
      { source: '/icon.png', headers: [{ key: 'Cache-Control', value: day }] },
      { source: '/opengraph-image.png', headers: [{ key: 'Cache-Control', value: day }] },
      { source: '/twitter-image.png', headers: [{ key: 'Cache-Control', value: day }] },
      { source: '/logo.png', headers: [{ key: 'Cache-Control', value: day }] },
    ];
  },
};

export default nextConfig;
