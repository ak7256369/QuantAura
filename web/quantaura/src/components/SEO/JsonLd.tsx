import { SAME_AS } from '@/lib/social';

export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function FAQJsonLd({ faqs }: { faqs: { question: string; answer: string }[] }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function ArticleJsonLd({ post }: {
  post: {
    title: string; meta_description: string; slug: string;
    published_at: string; updated_at: string;
  };
}) {
  const url = `https://quantaura.tech/blog/${post.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: {
      "@type": "Organization",
      name: "QuantAura",
      url: "https://quantaura.tech",
    },
    publisher: {
      "@type": "Organization",
      name: "QuantAura",
      url: "https://quantaura.tech",
      sameAs: SAME_AS,
      logo: {
        "@type": "ImageObject",
        url: "https://quantaura.tech/logo.png",
      },
    },
    image: ["https://quantaura.tech/opengraph-image.png"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function WebsiteJsonLd() {
  // NO potentialAction/SearchAction here. It previously declared
  //   https://quantaura.tech/predictions?q={search_term_string}
  // but the site has no search endpoint, so Google crawled the literal
  // template URL — it showed up in Search Console under "Alternate page with
  // proper canonical tag" as a phantom page. Only re-add a SearchAction if a
  // real query handler exists at that path.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://quantaura.tech/#website",
    name: "QuantAura",
    url: "https://quantaura.tech",
    description: "AI-Powered Crypto Intelligence — ensemble deep learning models for cryptocurrency trading signals.",
    // Ties the site to the Organization node (OrganizationJsonLd) so crawlers
    // read one brand entity rather than two unrelated ones.
    publisher: { "@id": "https://quantaura.tech/#organization" },
    // Declares the YouTube / X / Telegram accounts as the same entity as this
    // site. Without it each surface looks to a crawler like an unrelated brand.
    sameAs: SAME_AS,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function OrganizationJsonLd() {
  // Only fields that are verifiable facts today. Deliberately omits foundingDate
  // and a contactPoint/{search} route — those were unverified in the fact-audit
  // and must not be asserted as structured data until confirmed.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://quantaura.tech/#organization",
    name: "QuantAura",
    url: "https://quantaura.tech",
    logo: {
      "@type": "ImageObject",
      url: "https://quantaura.tech/logo.png",
    },
    description: "AI-powered cryptocurrency intelligence — an ensemble of deep-learning models (LSTM, XGBoost, Transformer, KAN) producing publicly-graded crypto trading signals.",
    sameAs: SAME_AS,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "QuantAura",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: "https://quantaura.tech",
    description: "AI-driven cryptocurrency trading signals powered by ensemble deep learning models (LSTM, XGBoost, Transformer, KAN) with real-time market analysis.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
