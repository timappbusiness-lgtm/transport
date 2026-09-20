import type { Metadata } from 'next';
import Link from 'next/link';
import { EyebrowPill, Headline, Lede, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { contactCopy } from '@/content/contact';
import {
  OPERATOR,
  TO_BE_FILLED,
  has,
  missingLegalFields,
  operatorField,
} from '@/config/company';

export const metadata: Metadata = {
  title: contactCopy.meta.title,
  description: contactCopy.meta.description,
  alternates: { canonical: ROUTES.contact },
};

const c = contactCopy;

/**
 * A real page, from the one place the operator's identity lives.
 *
 * Nothing here is invented. Where `src/config/company.ts` has a blank —
 * which it does until Edi fills it in — the page prints „[de completat]"
 * and says so at the top, rather than inventing an address or hiding the
 * row. A contact page that looks complete while the e-mail is a
 * placeholder is worse than one that admits what is missing: somebody
 * writes to it and nobody ever reads it.
 */
export default function Page() {
  const missing = missingLegalFields();
  const mailto = (address: string) => (address === '' ? null : `mailto:${address}`);

  return (
    <div className="mx-auto w-full max-w-[52rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <Headline as="h1" strong={c.hero.title} className="mt-5" />
        <Lede className="mt-4">{c.hero.lede}</Lede>
      </header>

      {missing.length > 0 ? (
        <section className="mt-8 rounded-card border border-warning/45 bg-warning/8 p-5">
          <p>
            <StatusBadge tone="warning">{c.missing.title}</StatusBadge>
          </p>
          <p className="mt-3 max-w-[62ch] text-sm">{c.missing.body}</p>
        </section>
      ) : null}

      <section aria-labelledby="canale" className="mt-8">
        <h2 id="canale" className="text-[1.125rem]">
          {c.channels.title}
        </h2>
        <dl className="mt-4 flex flex-col gap-4">
          <Channel
            label={c.channels.platform.label}
            hint={c.channels.platform.hint}
            value={operatorField('email')}
            href={mailto(OPERATOR.email)}
          />
          <Channel
            label={c.channels.privacy.label}
            hint={c.channels.privacy.hint}
            value={operatorField('privacyEmail')}
            href={mailto(OPERATOR.privacyEmail)}
          />
          {has('phone') ? (
            <Channel
              label={c.channels.phone.label}
              hint={c.channels.phone.hint}
              value={OPERATOR.phone}
              href={`tel:${OPERATOR.phone.replace(/\s/g, '')}`}
            />
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="raspuns" className="mt-8 rounded-card border border-border bg-surface p-5">
        <h2 id="raspuns" className="text-[1.0625rem]">
          {c.response.title}
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.response.body}</p>
      </section>

      <section aria-labelledby="operator" className="mt-8">
        <h2 id="operator" className="text-[1.125rem]">
          {c.operator.title}
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.operator.lede}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Detail label={c.operator.legalName} value={operatorField('legalName')} />
          <Detail label={c.operator.cui} value={operatorField('cui')} />
          <Detail label={c.operator.regCom} value={operatorField('regCom')} />
          <Detail label={c.operator.address} value={operatorField('address')} />
        </dl>
      </section>

      <section aria-labelledby="singur" className="mt-8">
        <h2 id="singur" className="text-[1.125rem]">
          {c.selfService.title}
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          <SelfServe
            href={ROUTES.faq}
            label={c.selfService.items[0].label}
            hint={c.selfService.items[0].hint}
          />
          <SelfServe
            href={ROUTES.accountPersonalData}
            label={c.selfService.items[1].label}
            hint={c.selfService.items[1].hint}
          />
          <SelfServe
            href={ROUTES.verification}
            label={c.selfService.items[2].label}
            hint={c.selfService.items[2].hint}
          />
        </ul>
      </section>
    </div>
  );
}

function Channel({
  label,
  hint,
  value,
  href,
}: {
  label: string;
  hint: string;
  value: string;
  href: string | null;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-xs uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1.5">
        {href === null ? (
          <span className="text-muted">{value}</span>
        ) : (
          <a href={href} className="underline underline-offset-4">
            {value}
          </a>
        )}
        <p className="mt-1 max-w-[54ch] text-sm text-muted">{hint}</p>
      </dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-xs uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className={value === TO_BE_FILLED ? 'mt-1.5 text-muted' : 'mt-1.5'}>{value}</dd>
    </div>
  );
}

function SelfServe({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <Link href={href} className="underline underline-offset-4">
        {label}
      </Link>
      <p className="mt-1 max-w-[54ch] text-sm text-muted">{hint}</p>
    </li>
  );
}
