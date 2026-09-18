import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — QuantAura',
  description: 'How QuantAura collects, uses, and protects your data.',
};

// Required by the YouTube API Services audit (a public privacy policy URL is a
// hard requirement), and good hygiene regardless. Plain content, no client JS.
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24 prose-invert">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-[var(--text-secondary)] mb-10">Last updated: 6 August 2026</p>

      <section className="space-y-6 text-[var(--text-secondary)] leading-relaxed">
        <p>
          QuantAura (&quot;we&quot;, &quot;our&quot;) is a machine-learning research project that
          publishes cryptocurrency market analysis at quantaura.tech and on our
          YouTube channel. This policy explains what data we collect and how we
          use it.
        </p>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">Information we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-[var(--text-primary)]">Account data.</strong> If you register, we store your
            email address and a hashed password. We never store passwords in
            plain text.
          </li>
          <li>
            <strong className="text-[var(--text-primary)]">Usage data.</strong> Standard server logs (IP address,
            browser type, pages visited) used for security and to keep the
            service running.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">What we do not do</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>We do not sell or share your personal data with third parties.</li>
          <li>We do not serve third-party advertising.</li>
          <li>
            We do not collect data from viewers of our YouTube content. Our
            automated publishing system only uploads videos to our own channel;
            it does not read, store, or process any YouTube user data,
            comments, or viewer information.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">YouTube API Services</h2>
        <p>
          Our publishing system uses YouTube API Services to upload videos to
          our own channel. That use is governed by the{' '}
          <a className="text-[var(--accent)] underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
            YouTube Terms of Service
          </a>{' '}
          and the{' '}
          <a className="text-[var(--accent)] underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google Privacy Policy
          </a>
          . The system accesses only our own channel via OAuth credentials we
          control, and stores no data about any other YouTube user.
        </p>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">Data retention and deletion</h2>
        <p>
          Account data is kept while your account exists. To delete your
          account and its data, or to ask anything about this policy, contact{' '}
          <a className="text-[var(--accent)] underline" href="mailto:khan@quantaura.tech">khan@quantaura.tech</a>.
        </p>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">Not financial advice</h2>
        <p>
          Everything QuantAura publishes — on this site and on YouTube — is
          automated research output, not financial advice. The model&apos;s
          historical accuracy is published openly, including its losses.
        </p>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">Changes</h2>
        <p>
          We will post any changes to this policy on this page with an updated
          date.
        </p>
      </section>
    </div>
  );
}
