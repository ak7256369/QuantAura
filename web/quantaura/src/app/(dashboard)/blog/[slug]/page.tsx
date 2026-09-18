import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleJsonLd, BreadcrumbJsonLd } from '@/components/SEO/JsonLd';
import { getPost, BlogPost } from '@/lib/blog';
import { SOCIAL } from '@/lib/social';

// On-demand ISR: the first request renders and caches the article; the
// pipeline's new post appears within an hour of its commit. Crawlers always
// receive finished HTML.
// (Next requires this to be a literal — keep in sync with lib/blog.ts.)
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Post not found' };
  const url = `https://quantaura.tech/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.meta_description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.meta_description,
      url,
      type: 'article',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      siteName: 'QuantAura',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.meta_description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

const P_STYLE: React.CSSProperties = {
  fontSize: 14.5, lineHeight: 1.8, color: 'var(--text-secondary)', margin: '0 0 14px',
};
const H2_STYLE: React.CSSProperties = { fontSize: 20, margin: '34px 0 14px' };

function Narrative({ sentences }: { sentences: string[] }) {
  return <>{sentences.map((s, i) => <p key={i} style={P_STYLE}>{s}</p>)}</>;
}

function CallTable({ post }: { post: BlogPost }) {
  return (
    <div className="signals-table-container">
      <table className="signals-table">
        <thead>
          <tr><th>Day</th><th>Call</th><th>Confidence</th><th>24h Move</th><th>Result</th></tr>
        </thead>
        <tbody>
          {post.week.days.map((d) => (
            <tr key={d.date}>
              <td>
                <span style={{ fontWeight: 600 }}>{d.weekday}</span>{' '}
                <time dateTime={d.date} className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {d.date}
                </time>
              </td>
              <td>
                <span className={`signal-badge ${d.signal === 'BUY' ? 'buy' : d.signal === 'SELL' ? 'sell' : 'hold'}`}>
                  {d.signal}
                </span>
                {d.gated && (
                  <span style={{ fontSize: 10.5, color: 'var(--signal-hold)', marginLeft: 6 }}>gated</span>
                )}
              </td>
              <td className="mono">{d.confidence_pct != null ? `${d.confidence_pct.toFixed(1)}%` : '—'}</td>
              <td className="mono" style={{
                color: (d.change_pct ?? 0) >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
              }}>
                {d.change_pct != null ? `${d.change_pct >= 0 ? '+' : ''}${d.change_pct.toFixed(2)}%` : '—'}
              </td>
              <td style={{
                fontWeight: 700,
                color: d.correct ? 'var(--signal-buy)' : 'var(--signal-sell)',
              }}>
                {d.correct ? 'HIT' : 'MISS'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-model vote breakdown card for daily posts. */
function ModelBreakdown({ post }: { post: BlogPost }) {
  if (!post.per_model || !post.weights) return null;
  const models = Object.entries(post.per_model);
  return (
    <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
      <p style={{ ...P_STYLE, margin: '0 0 12px', fontWeight: 600, fontSize: 13 }}>
        Model breakdown
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {models.map(([model, vote]) => (
          <div key={model} style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--bg-card-secondary, var(--bg-secondary))',
            border: '1px solid var(--border-card)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {model}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`signal-badge ${vote === 'BUY' ? 'buy' : vote === 'SELL' ? 'sell' : 'hold'}`} style={{ fontSize: 11 }}>
                {vote}
              </span>
              {post.weights?.[model] != null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {(post.weights[model] * 100).toFixed(0)}% wt
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The daily-post-specific layout: signal card + model breakdown + narrative. */
function DailyPostBody({ post }: { post: BlogPost }) {
  const signal = post.signal ?? 'HOLD';
  const signalClass = signal === 'BUY' ? 'buy' : signal === 'SELL' ? 'sell' : 'hold';

  return (
    <>
      <section aria-label="Today's call">
        <Narrative sentences={post.narrative.intro} />

        {/* Signal card */}
        <div className="card" style={{ padding: '22px 24px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Today&apos;s AI call
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`signal-badge ${signalClass}`} style={{ fontSize: 18, padding: '6px 16px' }}>
                  {signal}
                </span>
                {post.gated && (
                  <span style={{ fontSize: 12, color: 'var(--signal-hold)' }}>
                    (raw signal gated by confidence threshold)
                  </span>
                )}
              </div>
            </div>
            {post.confidence_pct != null && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Confidence
                </div>
                <div className="mono" style={{ fontSize: 24, fontWeight: 700 }}>
                  {post.confidence_pct.toFixed(1)}%
                </div>
              </div>
            )}
            {post.fear_greed && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Fear &amp; Greed
                </div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
                  {post.fear_greed.value}{' '}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
                    {post.fear_greed.classification}
                  </span>
                </div>
              </div>
            )}
            {post.change_pct != null && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  24h Result
                </div>
                <div className="mono" style={{
                  fontSize: 20, fontWeight: 700,
                  color: post.change_pct >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                }}>
                  {post.change_pct >= 0 ? '+' : ''}{post.change_pct.toFixed(2)}%
                </div>
              </div>
            )}
          </div>
        </div>

        <ModelBreakdown post={post} />
        <Narrative sentences={post.narrative.days} />
      </section>

      {/* All-time record */}
      <section aria-label="The running record">
        <h2 style={H2_STYLE}>The record so far</h2>
        <div className="card" style={{ padding: '18px 22px' }}>
          <p style={{ ...P_STYLE, margin: 0 }}>
            All-time: <strong>{post.alltime.hits} of {post.alltime.resolved}</strong> graded calls correct
            {post.alltime.accuracy_pct != null && <> (<strong>{post.alltime.accuracy_pct}%</strong>)</>}.
            {post.portfolio && (
              <>{' '}The <Link href="/portfolio" style={{ color: 'var(--accent-primary)' }}>paper portfolio</Link>{' '}
              stands at <strong>${post.portfolio.value_usd.toLocaleString()}</strong>{' '}
              ({post.portfolio.return_pct >= 0 ? '+' : ''}{post.portfolio.return_pct}%),
              against {post.portfolio.hold_return_pct >= 0 ? '+' : ''}{post.portfolio.hold_return_pct}% for
              simply holding.</>
            )}
          </p>
        </div>
      </section>

      {/* Research note (if present) */}
      {post.narrative.trend?.length > 0 && (
        <section aria-label="Analysis">
          <h2 style={H2_STYLE}>What the models saw</h2>
          <Narrative sentences={post.narrative.trend} />
        </section>
      )}
    </>
  );
}

/** The weekly recap layout (unchanged from before). */
function WeeklyPostBody({ post }: { post: BlogPost }) {
  return (
    <>
      <section aria-label="The week's record">
        <Narrative sentences={post.narrative.intro} />

        <h2 style={H2_STYLE}>Every call this week, graded</h2>
        <CallTable post={post} />
        <p style={{ ...P_STYLE, fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
          Grading rule: a call is judged on the realised price move over the following{' '}
          {post.scoring.horizon_hours ?? 24} hours. BUY needs a rise beyond ±{post.scoring.flat_band_pct ?? 1}%,
          SELL a fall beyond it, HOLD anything inside the band — a rule anyone can verify on any chart.
        </p>
        <Narrative sentences={post.narrative.days} />
        <Narrative sentences={post.narrative.trend} />
      </section>

      <section aria-label="The running record">
        <h2 style={H2_STYLE}>The record so far</h2>
        <div className="card" style={{ padding: '18px 22px' }}>
          <p style={{ ...P_STYLE, margin: 0 }}>
            All-time: <strong>{post.alltime.hits} of {post.alltime.resolved}</strong> graded calls correct
            {post.alltime.accuracy_pct != null && <> (<strong>{post.alltime.accuracy_pct}%</strong>)</>}.
            {post.portfolio && (
              <>{' '}The <Link href="/portfolio" style={{ color: 'var(--accent-primary)' }}>paper portfolio</Link>{' '}
              — a virtual $10,000 following every call with fees — stands at{' '}
              <strong>${post.portfolio.value_usd.toLocaleString()}</strong>{' '}
              ({post.portfolio.return_pct >= 0 ? '+' : ''}{post.portfolio.return_pct}%),
              against {post.portfolio.hold_return_pct >= 0 ? '+' : ''}{post.portfolio.hold_return_pct}% for
              simply holding — a gap of {post.portfolio.vs_hold_pct >= 0 ? '+' : ''}{post.portfolio.vs_hold_pct}%
              after ${post.portfolio.fees_paid_usd.toLocaleString()} in fees.</>
            )}
          </p>
        </div>
      </section>

      <section aria-label="Inside the research">
        <h2 style={H2_STYLE}>Inside the research: {post.research.title}</h2>
        <ul style={{ margin: '0 0 14px', paddingLeft: 20 }}>
          {post.research.bullets.map((b) => (
            <li key={b} style={{ ...P_STYLE, marginBottom: 6 }}>{b}</li>
          ))}
        </ul>
        <Narrative sentences={post.research.paragraphs} />
      </section>
    </>
  );
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const url = `https://quantaura.tech/blog/${post.slug}`;
  const isDaily = post.post_type === 'daily';

  return (
    <>
      <ArticleJsonLd post={post} />
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Blog', url: 'https://quantaura.tech/blog' },
        { name: isDaily ? `Daily Call — ${post.date_range}` : `Week ${post.iso_week}, ${post.iso_year}`, url },
      ]} />

      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ marginBottom: 26 }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 12.5, marginBottom: 14 }}>
            <Link href="/blog" style={{ color: 'var(--accent-primary)' }}>← All posts</Link>
          </nav>
          {/* Post type badge */}
          <div style={{ marginBottom: 10 }}>
            <span style={{
              display: 'inline-block',
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
              background: isDaily ? 'var(--accent-primary)22' : 'var(--accent-secondary, #7c5cfc)22',
              color: isDaily ? 'var(--accent-primary)' : 'var(--accent-secondary, #a78bfa)',
              border: `1px solid ${isDaily ? 'var(--accent-primary)44' : 'var(--accent-secondary, #7c5cfc)44'}`,
            }}>
              {isDaily ? 'Daily Call' : 'Weekly Recap'}
            </span>
          </div>
          <h1 style={{ fontSize: 27, lineHeight: 1.3, margin: '0 0 12px' }}>{post.title}</h1>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-muted)' }}>
            <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            <span>{post.date_range}</span>
            <span>Generated from the committed prediction log</span>
          </div>
        </header>

        {/* Dispatch to the correct layout based on post type */}
        {isDaily ? <DailyPostBody post={post} /> : <WeeklyPostBody post={post} />}

        {post.video_url && (
          <section aria-label="Watch the recap">
            <h2 style={H2_STYLE}>{isDaily ? 'Watch today\'s video' : 'Watch this week\'s recap'}</h2>
            <p style={P_STYLE}>
              The same {isDaily ? 'call' : 'review'} as a video:{' '}
              <a href={post.video_url} target="_blank" rel="noopener noreferrer"
                 style={{ color: 'var(--accent-primary)' }}>
                {post.title} on YouTube
              </a>.
            </p>
          </section>
        )}

        <footer style={{ marginTop: 36, paddingTop: 18, borderTop: '1px solid var(--border-card)' }}>
          <p style={{ ...P_STYLE, fontSize: 12.5, color: 'var(--text-muted)' }}>
            This post was generated automatically from the committed prediction log — the numbers were
            written down before their outcomes were knowable and are never edited. Daily calls for all
            ten symbols live on <Link href="/predictions" style={{ color: 'var(--accent-primary)' }}>Predictions</Link>;
            the model&apos;s methodology is on <Link href="/models" style={{ color: 'var(--accent-primary)' }}>Models</Link>.
            Automated research — not financial advice.
          </p>
          {/* Blog posts are the surface search traffic lands on, and they render
              outside the landing page's footer — so the channels are linked here
              too, or an organic reader has no way to find them. */}
          <p style={{ ...P_STYLE, fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
            The same daily call goes out on{' '}
            <a href={SOCIAL.youtube} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>YouTube</a>,{' '}
            <a href={SOCIAL.x} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>X</a>{' '}and a{' '}
            <a href={SOCIAL.telegramChannel} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>free Telegram channel</a>.
          </p>
        </footer>
      </article>
    </>
  );
}
