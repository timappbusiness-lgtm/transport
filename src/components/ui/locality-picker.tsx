'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  reportMissingLocalityAction,
  searchLocalitiesAction,
} from '@/app/localitati-actions';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { localitiesCopy } from '@/content/localitati';
import {
  GROUP_LABELS,
  SEARCH_DEBOUNCE_MS,
  SUGGESTION_LIMIT,
  groupSuggestions,
  shouldSearch,
  subtitleOf,
  type Locality,
} from '@/lib/localities';
import { cn } from '@/lib/utils';

/**
 * The locality field: type a few letters, pick a place.
 *
 * Everything that decides *which* places is in Postgres — diacritics,
 * typos, aliases, the ranking. This draws what comes back and handles
 * the keyboard.
 *
 * Free text is still allowed, and deliberately. A person from a village
 * the gazetteer does not have must still be able to publish; what they
 * get is „Nu găsim localitatea?", which stores what they typed and
 * raises a flag for the team rather than leaving them stuck on a field
 * that refuses them.
 */
const CONTROL =
  'w-full rounded-input border border-border bg-surface px-3 py-2 text-body ' +
  'outline-none focus-visible:border-border-strong focus-visible:outline-2 ' +
  'focus-visible:outline-offset-[-2px] focus-visible:outline-foreground';

export interface LocalityValue {
  city: string;
  country: string;
}

export function LocalityPicker({
  id,
  value,
  onChange,
  near = null,
  placeholder,
  describedBy,
}: {
  id: string;
  value: LocalityValue;
  onChange: (value: LocalityValue) => void;
  /** The origin, once it is chosen: nearby destinations rank higher. */
  near?: { lat: number; lng: number } | null;
  placeholder?: string;
  describedBy?: string;
}) {
  const [items, setItems] = useState<readonly Locality[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [reported, setReported] = useState(false);
  /** True once a search has answered, so „not found" is never premature. */
  const [answered, setAnswered] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /**
   * The input is the form's field, not a box beside it.
   *
   * Every keystroke goes straight to `onChange`, so what somebody typed
   * is what the request carries even if they never open the list. That
   * is not a nicety: the gazetteer has 2.750 localities and Romania has
   * thirteen thousand, so the person collecting a car from a village is
   * the normal case, not the edge one. The first version of this held
   * the text locally and only told the form when a suggestion was
   * chosen — which meant that with no suggestion there was no value, and
   * the form refused to leave the first step.
   *
   * The suggestions refine the field; they are never the only way to
   * fill it.
   */
  const query = value.city;
  const justChose = useRef(false);

  /**
   * One request per pause, not one per keystroke.
   *
   * The timer is cleared on every change and on unmount, and a reply
   * that arrives after a newer request was sent is dropped: without the
   * `cancelled` flag, a slow answer for „tim" can land after the answer
   * for „timiș" and replace a good list with a stale one.
   */
  useEffect(() => {
    if (!shouldSearch(query)) return;
    // Choosing a suggestion fills the field, which would otherwise look
    // like typing and reopen the list under the answer.
    if (justChose.current) {
      justChose.current = false;
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchLocalitiesAction(query, near).then((found) => {
        if (cancelled) return;
        setItems(found.slice(0, SUGGESTION_LIMIT));
        setOpen(found.length > 0);
        setActive(-1);
        setAnswered(true);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, near]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const choose = useCallback(
    (locality: Locality) => {
      justChose.current = true;
      onChange({ city: locality.name, country: locality.country });
      setOpen(false);
      setActive(-1);
    },
    [onChange],
  );

  // Derived, not cleared: the effect only ever fills `items`. Emptying
  // it from inside the effect was a second render for a list nobody was
  // going to see.
  const flat = shouldSearch(query) ? items : [];

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || flat.length === 0) {
      if (event.key === 'ArrowDown' && flat.length > 0) setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((at) => (at + step + flat.length) % flat.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActive(flat.length - 1);
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const picked = flat[active];
      if (picked) choose(picked);
    }
  }

  const groups = groupSuggestions([...flat]);
  // Only after a search has actually answered. Before that — and on a
  // build with no database, where the action returns nothing — offering
  // „nu găsim localitatea" to somebody who has typed two letters is a
  // refusal they have not earned.
  const noResults = shouldSearch(query) && answered && flat.length === 0;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Icon
          as={uiIcon('search')}
          size="sm"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          id={id}
          value={query}
          onChange={(event) => onChange({ city: event.target.value, country: value.country })}
          onKeyDown={onKeyDown}
          onFocus={() => flat.length > 0 && setOpen(true)}
          placeholder={placeholder ?? localitiesCopy.placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={describedBy}
          className={cn(CONTROL, 'pl-9')}
        />
      </div>

      {open && groups.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={localitiesCopy.listLabel}
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-float"
        >
          {groups.map((section) => (
            <li key={section.group}>
              {/* Two headings, România and Internațional, because the
                  two answer different questions and a flat list of
                  fifteen mixes them. */}
              <p
                aria-hidden="true"
                className="px-3 pb-1 pt-2 font-mono text-label uppercase tracking-[0.12em] text-muted"
              >
                {GROUP_LABELS[section.group]}
              </p>
              <ul role="group" aria-label={GROUP_LABELS[section.group]}>
                {section.items.map((locality) => {
                  const index = flat.indexOf(locality);
                  return (
                    <li key={locality.id}>
                      <button
                        type="button"
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(locality)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-body',
                          index === active ? 'bg-ground-alt' : 'hover:bg-ground-alt',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{locality.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {subtitleOf(locality)}
                          </span>
                        </span>
                        {/* The country as a code, not a flag emoji: no
                            emoji in this interface, and a two-letter
                            badge is readable by everything. */}
                        <span className="flex-none rounded-input border border-border px-1.5 py-0.5 font-mono text-label text-muted">
                          {locality.country}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      {noResults ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-small text-muted">
          <Icon as={uiIcon('place')} size="sm" />
          {reported ? (
            localitiesCopy.reportedThanks
          ) : (
            <>
              {localitiesCopy.notFound}{' '}
              <button
                type="button"
                onClick={() => {
                  // The typed text is already the field's value; this
                  // only tells the team the gazetteer is missing one.
                  void reportMissingLocalityAction(query.trim(), value.country).then(
                    (result) => setReported(result.ok),
                  );
                  setReported(true);
                }}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {localitiesCopy.reportAction}
              </button>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
