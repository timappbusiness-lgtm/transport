import type { FaqItem } from './seo-pages';

/**
 * The structured data a landing page carries.
 *
 * Built from the same rows the page renders, never from a second copy —
 * a FAQPage block listing questions the page does not show is the one
 * structured-data mistake that gets a site penalised rather than ignored.
 *
 * Returned as objects and serialised by the component, so the shapes can
 * be asserted in a test without parsing a string.
 */

export interface JsonLd {
  '@context': 'https://schema.org';
  '@type': string;
  [key: string]: unknown;
}

export function faqJsonLd(items: readonly FaqItem[]): JsonLd | null {
  // No questions, no block. An empty FAQPage is worse than none: it tells
  // a crawler the page has an FAQ and then does not have one.
  if (items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function breadcrumbJsonLd(
  trail: readonly { label: string; href: string | null }[],
  siteUrl: string,
): JsonLd | null {
  if (trail.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.label,
      // The last step has no href: it is the page you are on, and a
      // self-link in a breadcrumb is noise in the markup and in the eye.
      ...(step.href === null ? {} : { item: absolute(step.href, siteUrl) }),
    })),
  };
}

function absolute(href: string, siteUrl: string): string {
  return href.startsWith('http') ? href : `${siteUrl.replace(/\/$/, '')}${href}`;
}
