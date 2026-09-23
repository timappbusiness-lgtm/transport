import { cn } from '@/lib/utils';

/**
 * A grid of checkboxes with one name, which is how an array column is
 * posted: `formData.getAll(name)` gives the ticked codes and nothing else.
 *
 * Two columns on a phone rather than one. Forty-two counties in a single
 * column is a scroll of half a minute, and a county list is read by
 * scanning rather than reading, so the shorter column wins.
 */
export function CheckboxGrid({
  name,
  options,
  selected,
  columns = 2,
}: {
  name: string;
  options: readonly { code: string; label: string; hint?: string | null }[];
  selected: readonly string[];
  columns?: 2 | 3;
}) {
  const chosen = new Set(selected.map((code) => code.toUpperCase()));

  return (
    <ul
      className={cn(
        'grid gap-x-4 gap-y-2.5',
        columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-2',
      )}
    >
      {options.map((option) => (
        <li key={option.code}>
          <label className="flex items-start gap-2.5 text-body">
            <input
              type="checkbox"
              name={name}
              value={option.code}
              defaultChecked={chosen.has(option.code.toUpperCase())}
              className="mt-0.5 size-4 shrink-0 accent-foreground"
            />
            <span className="min-w-0">
              {option.label}
              {option.hint ? (
                <span className="mt-0.5 block text-small text-muted">{option.hint}</span>
              ) : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
