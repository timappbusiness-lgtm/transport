import { Icon } from '@/components/ui/icon';
import type { FilterChip } from '@/lib/filter-disclosure';
import { UI_ICONS } from '@/lib/icons';

/**
 * What the closed „Mai multe filtre" panel is filtering, said outside it.
 *
 * One chip per active advanced filter, each a link to the same address
 * without it, then „Șterge filtrele". Plain links rendered on the server:
 * removing a filter is a navigation, it works without JavaScript, and
 * the results under it follow because they are the address.
 */
export function FilterChips({
  chips,
  clearHref,
  clearLabel,
  heading,
  removeLabel,
}: {
  chips: readonly FilterChip[];
  clearHref: string;
  /** „Șterge filtrele". */
  clearLabel: string;
  /** For screen readers: „Filtre active". */
  heading: string;
  /** For screen readers, before each chip's label: „Scoate filtrul". */
  removeLabel: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div data-filter-chips="">
      <p className="sr-only">{heading}</p>
      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <li key={chip.id} className="min-w-0">
            <a
              href={chip.href}
              data-chip={chip.id}
              aria-label={`${removeLabel}: ${chip.label}`}
              className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-pill border border-border-strong bg-surface py-1 pl-3 pr-2 text-small hover:border-foreground"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{chip.label}</span>
              <Icon as={UI_ICONS.close} size="sm" tone="muted" />
            </a>
          </li>
        ))}
        <li>
          <a
            href={clearHref}
            data-chip-clear=""
            className="inline-flex min-h-7 items-center text-small text-muted underline underline-offset-4 hover:text-foreground"
          >
            {clearLabel}
          </a>
        </li>
      </ul>
    </div>
  );
}
