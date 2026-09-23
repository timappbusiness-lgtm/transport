'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A radio button drawn as a card: the category, the vehicle's state, the
 * kind of service.
 *
 * Still a native radio underneath — arrow keys move within the group,
 * Space selects, a screen reader announces „1 of 10" — and only the look
 * is the card. The input's name is the card's title alone (through
 * `aria-labelledby`), and the sentence under it is its description, so
 * „Expres" is called „Expres" and the explanation is read after it.
 *
 * Chosen: the accent's edge and its subtle ground, and a filled dot. Not
 * chosen: a hairline card that lifts under the pointer. The focus ring is
 * drawn on the card, because the input it belongs to is invisible.
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  aside,
  art,
  layout = 'row',
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  description?: React.ReactNode;
  /** A second line under the description: the price effect, a weight. */
  aside?: React.ReactNode;
  /** A drawing or an icon, at the card's leading edge. */
  art?: React.ReactNode;
  /** `stack` puts the drawing above the words, for a grid of small cards. */
  layout?: 'row' | 'stack';
  className?: string | undefined;
}) {
  const id = useId();
  return (
    <label
      data-choice={value}
      data-checked={checked ? 'true' : undefined}
      className={cn(
        'group relative flex cursor-pointer gap-3 rounded-card border p-4 text-left',
        'transition-[border-color,background-color,transform] duration-(--duration-quick) ease-(--ease-soft)',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-foreground',
        'motion-safe:active:scale-[0.99]',
        layout === 'stack' ? 'flex-col items-start' : 'items-start',
        checked
          ? 'border-accent bg-accent-subtle shadow-card'
          : 'border-border bg-surface hover:border-accent-border hover:bg-background',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        aria-labelledby={`${id}-title`}
        aria-describedby={description || aside ? `${id}-desc` : undefined}
        className="sr-only"
      />
      {art}
      <span className="min-w-0 flex-1">
        <span id={`${id}-title`} className="block text-body font-semibold text-foreground">
          {title}
        </span>
        {description || aside ? (
          <span id={`${id}-desc`} className="mt-1 block text-small text-muted">
            {description}
            {aside ? <span className="mt-1.5 block">{aside}</span> : null}
          </span>
        ) : null}
      </span>
      {/* The dot says „chosen" by more than colour: filled or empty. */}
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 flex-none items-center justify-center rounded-full border-2',
          layout === 'stack' ? 'absolute right-3 top-3' : 'mt-0.5',
          checked ? 'border-accent' : 'border-border-strong',
        )}
      >
        {checked ? <span className="size-2.5 rounded-full bg-accent" /> : null}
      </span>
    </label>
  );
}
