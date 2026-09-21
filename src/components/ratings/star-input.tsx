'use client';

import { useId, useState } from 'react';
import { SCORE_LABELS, scoreLabel } from '@/lib/ratings';
import { cn } from '@/lib/utils';

const VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Cinci stele care sunt de fapt cinci butoane radio.
 *
 * Nu o listă de `<button>`-uri cu un `<input type="hidden">` alături:
 * un grup de radio are deja navigare cu săgeți, are deja o stare
 * selectată pe care o anunță cititoarele de ecran, și se trimite singur
 * în formular. Ce se schimbă este doar cum arată.
 *
 * Steaua este ascunsă de la citit (`aria-hidden`), iar eticheta fiecărui
 * buton este cuvântul — „Bine", nu „4". Cine nu distinge galbenul de gri
 * citește același lucru ca toți ceilalți, iar sub grup rămâne cuvântul
 * notei alese, vizibil, pentru cine se uită.
 */
export function StarInput({
  name,
  label,
  hint,
  defaultValue = null,
  required = false,
  size = 'lg',
  error,
  onPick,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: number | null;
  required?: boolean;
  size?: 'sm' | 'lg';
  error?: string;
  /** For a parent that needs the value too, such as a live preview. */
  onPick?: (score: number) => void;
}) {
  const [value, setValue] = useState<number | null>(defaultValue);
  const id = useId();
  const star = size === 'lg' ? 'text-[2rem]' : 'text-[1.25rem]';

  return (
    <fieldset className="border-0 p-0" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="text-[0.9375rem] font-medium">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {VALUES.map((n) => {
          const selected = value !== null && n <= value;
          return (
            <label
              key={n}
              className={cn(
                'cursor-pointer rounded-input px-1 leading-none transition-colors',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                star,
                selected ? 'text-warning' : 'text-border-strong hover:text-muted',
              )}
            >
              <input
                type="radio"
                name={name}
                value={n}
                required={required}
                checked={value === n}
                onChange={() => {
                  setValue(n);
                  onPick?.(n);
                }}
                className="sr-only"
              />
              <span aria-hidden="true">{selected ? '★' : '☆'}</span>
              <span className="sr-only">{`${n} — ${scoreLabel(n)}`}</span>
            </label>
          );
        })}

        <span
          className="ml-2 min-w-[7rem] text-[0.8125rem] text-muted"
          aria-live="polite"
        >
          {value === null ? '' : SCORE_LABELS[value]}
        </span>
      </div>

      {error ? <p className="mt-1 text-[0.8125rem] text-danger">{error}</p> : null}
    </fieldset>
  );
}

/** Stelele fără formular, pentru afișare. Tot cu cuvântul alături. */
export function Stars({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span aria-hidden="true" className="text-warning">
        {'★'.repeat(score)}
        <span className="text-border-strong">{'☆'.repeat(5 - score)}</span>
      </span>
      <span className="text-[0.8125rem] text-muted">{scoreLabel(score)}</span>
    </span>
  );
}
