// Server-side blog data access. These run inside the Next server (ISR), never
// in the browser — the pages that call them are server components, so every
// post arrives as fully rendered HTML. That is the entire SEO strategy:
// crawlable articles, not a client-side fetch a crawler may never execute.

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// One revalidate window for every blog fetch. Posts change once a week; an
// hour of staleness is invisible, and the cache keeps the GitHub relay cold.
export const BLOG_REVALIDATE_SECONDS = 3600;

export interface BlogPostSummary {
  slug: string;
  title: string;
  meta_description: string;
  published_at: string;
  updated_at: string;
  iso_year: number;
  iso_week: number;
  week_resolved: number;
  week_hits: number;
  week_accuracy_pct: number | null;
  /** 'weekly' for the Sunday recap, 'daily' for daily prediction posts. */
  post_type?: 'weekly' | 'daily';
}

export interface BlogPost extends Omit<BlogPostSummary, 'week_resolved' | 'week_hits' | 'week_accuracy_pct'> {
  date_range: string;
  week: {
    resolved: number; hits: number; misses: number; accuracy_pct: number | null;
    days: {
      weekday: string; date: string; signal: string;
      confidence_pct: number | null; gated: boolean;
      change_pct: number | null; correct: boolean;
    }[];
  };
  alltime: { resolved: number | null; hits: number | null; misses: number | null; accuracy_pct: number | null };
  portfolio: {
    value_usd: number; return_pct: number; hold_return_pct: number;
    vs_hold_pct: number; fees_paid_usd: number; trades: number; position: string;
  } | null;
  narrative: { intro: string[]; days: string[]; trend: string[] };
  research: { title: string; bullets: string[]; paragraphs: string[] };
  scoring: { horizon_hours: number | null; flat_band_pct: number | null };
  video_url: string | null;

  // Daily-post-only fields (undefined on weekly posts)
  /** The AI signal for this day: BUY, HOLD, or SELL. */
  signal?: string;
  /** The ensemble confidence percentage. */
  confidence_pct?: number | null;
  /** Whether the confidence gate suppressed the raw signal. */
  gated?: boolean;
  /** Percentage price change over the scoring window (null if unresolved). */
  change_pct?: number | null;
  /** Per-model votes, e.g. { lstm: 'BUY', transformer: 'HOLD', ... } */
  per_model?: Record<string, string>;
  /** Model weights, e.g. { lstm: 0.3, ... } */
  weights?: Record<string, number>;
  /** Fear & Greed index value and label. */
  fear_greed?: { value: number; classification: string } | null;
}

async function fetchJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    // API down at render time → the page shows its empty state; ISR retries
    // on the next revalidation rather than surfacing an error page.
    return null;
  }
}

export async function getPosts(): Promise<BlogPostSummary[]> {
  const data = await fetchJson('/api/blog');
  if (!data || data.pending || !Array.isArray(data.posts)) return [];
  return data.posts as BlogPostSummary[];
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  // Defence in depth: the API validates too, but never forward junk.
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const data = await fetchJson(`/api/blog/${slug}`);
  if (!data || data.pending || !data.slug) return null;
  return data as BlogPost;
}
