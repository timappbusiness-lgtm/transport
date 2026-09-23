import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { SampleTag, SectionHead, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { trustCopy } from '@/content/siguranta';
import { iconForContent } from '@/lib/icons';

const c = trustCopy.section;

/**
 * Six things the platform does, and one card showing what they look like.
 *
 * Every item describes a rule the database enforces — the review that gates
 * offers, the nightly expiry sweep, the contact allowance. Two claims a
 * competitor's version of this block would carry are missing because
 * nothing enforces them yet; see the note in `src/content/siguranta.ts`.
 *
 * The card is fictional and says so. It is here because "we track expiry
 * dates" is abstract until you have seen the row that says a policy runs
 * out in twelve days.
 */
export function Trust() {
  return (
    <section id="siguranta" className="bg-background">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={iconForContent('document')} strong={c.strong} soft={c.soft} />

        <ol className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {c.items.map((item, index) => (
            <li key={item.title} className="min-w-0">
              <p className="font-mono text-label tabular-nums text-muted">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-2 text-h3 font-normal">{item.title}</h3>
              <p className="mt-2 max-w-[42ch] text-body leading-relaxed text-muted">
                {item.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-12 max-w-[30rem]">
          <ExampleCard />
          <p className="mt-4 text-body">
            <Link
              href={ROUTES.verification}
              className="link-accent"
            >
              {c.example.link}
            </Link>
          </p>
        </div>
      </Container>
    </section>
  );
}

function ExampleCard() {
  const e = c.example;
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3 font-normal">{e.title}</h3>
          <p className="mt-0.5 truncate font-mono text-label text-muted">{e.company}</p>
        </div>
        <SampleTag />
      </div>

      <dl className="mt-4 flex flex-col">
        {e.rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border py-2.5 last:border-b-0"
          >
            <dt className="min-w-0 flex-1 text-small">{row.label}</dt>
            {/* Both the date and the chip live in the `dd`: a `div` inside
                a `dl` may hold `dt` and `dd` and nothing else, and the
                chip used to sit beside them as a third child. axe calls
                it `definition-list`; it cost four accessibility points. */}
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-small tabular-nums text-muted">{row.value}</span>
              {/* The word carries the meaning; the colour only repeats it. */}
              <StatusBadge tone={row.tone}>{row.state}</StatusBadge>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 font-mono text-label text-muted">{e.footer}</p>
    </div>
  );
}
