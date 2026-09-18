import type { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';
import { getPosts } from '@/lib/blog';

// Server-rendered with ISR: crawlers get finished HTML, and a new post
// appears within an hour of the pipeline committing it — no deploy needed.
// (Next requires this to be a literal — keep in sync with lib/blog.ts.)
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Research Blog — Bitcoin AI Model Daily Calls & Weekly Reviews',
  description:
    'Daily Bitcoin AI prediction posts and weekly model reviews — every BUY, HOLD or SELL call graded in public, the paper portfolio tracked against buy-and-hold, and the research behind the model explained.',
  alternates: {
    canonical: 'https://quantaura.tech/blog',
    types: { 'application/rss+xml': 'https://quantaura.tech/blog/feed.xml' },
  },
  openGraph: {
    title: 'QuantAura Research Blog',
    description: 'Daily Bitcoin AI calls + weekly reviews — every prediction graded in public.',
    url: 'https://quantaura.tech/blog',
    type: 'website',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function PostTypeBadge({ type }: { type?: string }) {
  const isDaily = type === 'daily';
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '2px 7px',
      borderRadius: 4,
      background: isDaily ? 'var(--accent-primary)22' : 'var(--accent-secondary, #7c5cfc)22',
      color: isDaily ? 'var(--accent-primary)' : 'var(--accent-secondary, #a78bfa)',
      border: `1px solid ${isDaily ? 'var(--accent-primary)44' : 'var(--accent-secondary, #7c5cfc)44'}`,
    }}>
      {isDaily ? 'Daily Call' : 'Weekly Recap'}
    </span>
  );
}

export default async function BlogIndexPage() {
  const posts = await getPosts();

  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Blog', url: 'https://quantaura.tech/blog' },
      ]} />

      <div className="page-header">
        <h1>Research Blog</h1>
        <p>
          Daily Bitcoin AI calls and weekly reviews — the written edition of our{' '}
          <a href="https://www.youtube.com/@quantaura_ml" target="_blank" rel="noopener noreferrer"
             style={{ color: 'var(--accent-primary)' }}>YouTube channel</a>.
          Every number comes from a committed log, written down before the outcome was knowable.
        </p>
      </div>

      {posts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>The first post publishes today</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            Daily call posts land every evening after the model runs. Weekly recap posts publish every Sunday
            once the week&apos;s calls are graded — the call table, the running accuracy, the paper portfolio
            against buy-and-hold, and one piece of the research explained. Until then: the live calls are on{' '}
            <Link href="/predictions" style={{ color: 'var(--accent-primary)' }}>Predictions</Link>{' '}
            and the record so far is on{' '}
            <Link href="/portfolio" style={{ color: 'var(--accent-primary)' }}>Portfolio</Link>.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
        {posts.map((p) => (
          <article key={p.slug} className="card" style={{ padding: 0 }}>
            <Link
              href={`/blog/${p.slug}`}
              style={{ display: 'block', padding: '22px 24px', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PostTypeBadge type={p.post_type} />
                  <time dateTime={p.published_at} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDate(p.published_at)}
                  </time>
                </div>
                {p.week_accuracy_pct != null && (
                  <span className="mono" style={{
                    fontSize: 12, fontWeight: 700,
                    color: p.week_accuracy_pct >= 50 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                  }}>
                    {p.week_hits}/{p.week_resolved} correct · {p.week_accuracy_pct.toFixed(0)}%
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 19, lineHeight: 1.35, margin: '0 0 8px' }}>{p.title}</h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                {p.meta_description}
              </p>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
