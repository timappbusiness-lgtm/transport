import Image from 'next/image';
import { Fragment } from 'react';
import {
  CONSUMER_REDRESS,
  REDRESS_LABEL,
  redressName,
  type RedressEntry,
} from '@/config/consumer-redress';

/**
 * The SOL and SAL badges, in the layout of ANPC's official pictograms.
 *
 * A rounded box with a blue border on white, the official wording in blue
 * capitals, a solid blue „DETALII" pill under it; SAL also carries the
 * authority on its left, behind a vertical rule. The colours are ANPC's,
 * not ours (`--color-anpc-blue`, `--color-anpc-paper`): these have to look
 * like the authority's badges, so they follow no accent, surface or theme,
 * and this file is the only one allowed to use them.
 *
 * Until the official files are downloaded (`entry.badge`), the SAL badge
 * prints „ANPC" where the pictogram has the coat of arms: a drawn copy of
 * the arms would be an imitation of an official mark.
 *
 * Each badge is one link. Its name is the wording and the authority; the
 * printed text inside is hidden from assistive technology so it is not
 * read twice, and „DETALII" is part of the drawing, not a second control.
 */
export function AnpcBadges() {
  return (
    <section
      aria-label={REDRESS_LABEL}
      data-consumer-redress=""
      className="grid auto-rows-fr grid-cols-1 justify-start gap-3 sm:grid-cols-[repeat(2,17.5rem)]"
    >
      {CONSUMER_REDRESS.map((entry) =>
        entry.key === 'sal' ? <SalBadge key={entry.key} entry={entry} /> : <SolBadge key={entry.key} entry={entry} />,
      )}
    </section>
  );
}

/** Soluționarea online a litigiilor: the wording and the pill. */
export function SolBadge({ entry }: { entry: RedressEntry }) {
  return (
    <BadgeLink entry={entry}>
      <Wording label={entry.label} />
    </BadgeLink>
  );
}

/** Soluționarea alternativă a litigiilor: the authority, a rule, the wording. */
export function SalBadge({ entry }: { entry: RedressEntry }) {
  return (
    <BadgeLink entry={entry}>
      {entry.withAuthority ? (
        <span className="flex shrink-0 items-center border-r-2 border-anpc-blue px-3 font-display text-h3 font-bold tracking-wide">
          ANPC
        </span>
      ) : null}
      <Wording label={entry.label} />
    </BadgeLink>
  );
}

function BadgeLink({ entry, children }: { entry: RedressEntry; children: React.ReactNode }) {
  return (
    <a
      href={entry.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${redressName(entry)} (se deschide într-o filă nouă)`}
      data-redress={entry.key}
      className="flex min-h-16 w-[17.5rem] max-w-full min-w-0 items-stretch rounded-input border-2 border-anpc-blue bg-anpc-paper text-anpc-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      {entry.badge ? (
        // The official file, once it is in public/: decorative, because
        // the link already says what it is.
        <Image
          src={entry.badge.src}
          width={entry.badge.width}
          height={entry.badge.height}
          alt=""
          unoptimized
          className="m-auto h-auto max-w-full"
        />
      ) : (
        <span aria-hidden="true" className="flex min-w-0 flex-1 items-stretch">
          {children}
        </span>
      )}
    </a>
  );
}

/**
 * The wording on two lines where the official badge breaks it: the kind
 * of resolution, then „a litigiilor".
 */
function Wording({ label }: { label: string }) {
  const split = /^(.*)\s(a litigiilor)$/i.exec(label);
  const lines = split ? [split[1]!, split[2]!] : [label];
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-2 text-center">
      <span className="text-label font-bold uppercase leading-tight tracking-normal [overflow-wrap:anywhere]">
        {lines.map((line, i) => (
          // A space between the two lines, so the text reads as one
          // sentence when copied or searched, not „online" + „a litigiilor".
          <Fragment key={line}>
            {i > 0 ? ' ' : null}
            <span className="block">{line}</span>
          </Fragment>
        ))}
      </span>
      <span className="rounded-pill bg-anpc-blue px-3 py-0.5 text-label font-bold uppercase text-anpc-paper">
        Detalii
      </span>
    </span>
  );
}
