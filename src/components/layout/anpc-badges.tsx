import Image from 'next/image';
import { CONSUMER_REDRESS, REDRESS_LABEL } from '@/config/consumer-redress';

/**
 * The SAL and SOL badges: ANPC's own artwork, as Annex 2 prints it.
 *
 * The image is the badge. This file only sizes it — 250 pixels wide side
 * by side from `sm`, the full width up to 300 on a phone — and never
 * crops, stretches or recolours it: the height follows the file's own
 * ratio. The files are twice the size they are shown at, so they stay
 * sharp on a phone's screen.
 *
 * Each badge is one link; the image's alt text is its name, and the note
 * that it opens a new tab is its description, so the name stays exactly
 * the wording on the badge.
 */
const NEW_TAB_NOTE = 'anpc-badge-new-tab';

export function AnpcBadges() {
  return (
    <section
      aria-label={REDRESS_LABEL}
      data-consumer-redress=""
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-2.5"
    >
      <span id={NEW_TAB_NOTE} hidden>
        Se deschide într-o filă nouă.
      </span>
      {CONSUMER_REDRESS.map((entry) => (
        <a
          key={entry.key}
          href={entry.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-describedby={NEW_TAB_NOTE}
          data-redress={entry.key}
          className="block w-full max-w-[300px] rounded-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:w-[250px]"
        >
          <Image
            src={entry.image.src}
            width={entry.image.width / 2}
            height={entry.image.height / 2}
            alt={entry.name}
            unoptimized
            className="block h-auto w-full"
          />
        </a>
      ))}
    </section>
  );
}
