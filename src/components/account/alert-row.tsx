'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  deleteSearchAction,
  updateSearchAction,
  type AlertState,
} from '@/app/cont/alerte/actions';
import { buttonClasses } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { ROUTES, requestRoute } from '@/config/routes';
import { alertsCopy } from '@/content/alerte';
import {
  FREQUENCY_LABELS,
  describeFilters,
  type SavedSearch,
  type SearchActivity,
} from '@/lib/saved-searches';
import type { SearchMatch } from '@/lib/saved-searches-source';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: AlertState = {};
const c = alertsCopy.list;

function when(value: string | null): string {
  if (value === null) return c.never;
  return new Date(value).toLocaleDateString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * One saved search, with what it has found.
 *
 * The reasons are shown rather than summarised, because they are the
 * thing that makes a carrier trust the next e-mail: „ruta, tipul,
 * ocolul" is checkable, and „se potrivește" is not.
 */
export function AlertRow({
  search,
  activity,
  matches,
}: {
  search: SavedSearch;
  activity: SearchActivity | undefined;
  matches: SearchMatch[];
}) {
  const [updateState, update, updating] = useKeptActionState(updateSearchAction, EMPTY);
  const [deleteState, remove, deleting] = useKeptActionState(deleteSearchAction, EMPTY);
  const [renaming, setRenaming] = useState(false);
  const [open, setOpen] = useState(false);

  const criteria = describeFilters(search.filters);

  return (
    <li
      className={cn(
        'rounded-card border bg-surface p-5',
        search.is_active ? 'border-border' : 'border-dashed border-border-strong',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {renaming ? (
            <KeepingForm action={update} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={search.id} />
              <label className="sr-only" htmlFor={`name-${search.id}`}>
                {c.rename}
              </label>
              <input
                id={`name-${search.id}`}
                name="name"
                defaultValue={search.name}
                className="rounded-input border border-border-strong bg-surface px-3 py-1.5 text-body"
              />
              <button type="submit" disabled={updating} className={buttonClasses('secondary', 'sm')}>
                {c.save}
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="text-body text-muted underline underline-offset-4"
              >
                Renunță
              </button>
            </KeepingForm>
          ) : (
            <h2 className="text-h3">{search.name}</h2>
          )}

          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {criteria.length === 0 ? (
              <span className="text-body text-muted">Toate cererile de pe panou</span>
            ) : (
              criteria.map((part) => (
                <span
                  key={part}
                  className="rounded-full border border-border px-2 py-0.5 text-small text-muted"
                >
                  {part}
                </span>
              ))
            )}
          </p>
        </div>

        <StatusBadge tone={search.is_active ? 'success' : 'neutral'}>
          {search.is_active ? c.active : c.paused}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid gap-3 text-body sm:grid-cols-3">
        <div>
          <dt className="text-small text-muted">{c.frequency}</dt>
          <dd className="mt-0.5">{FREQUENCY_LABELS[search.frequency]}</dd>
        </div>
        <div>
          <dt className="text-small text-muted">{c.channel}</dt>
          <dd className="mt-0.5">{search.notify_email ? c.channelEmail : c.channelNone}</dd>
        </div>
        <div>
          <dt className="text-small text-muted">{c.matches7d}</dt>
          <dd className="mt-0.5 tabular-nums">
            {activity?.matches ?? 0}
            <span className="text-muted"> · {c.lastMatch.toLowerCase()} {when(activity?.last_match_at ?? null)}</span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <KeepingForm action={update}>
          <input type="hidden" name="id" value={search.id} />
          <input type="hidden" name="is_active" value={search.is_active ? 'no' : 'yes'} />
          <button type="submit" disabled={updating} className={buttonClasses('secondary', 'sm')}>
            {search.is_active ? c.pause : c.resume}
          </button>
        </KeepingForm>

        <KeepingForm action={update}>
          <input type="hidden" name="id" value={search.id} />
          <input
            type="hidden"
            name="frequency"
            value={search.frequency === 'immediate' ? 'daily' : 'immediate'}
          />
          <button type="submit" disabled={updating} className={buttonClasses('secondary', 'sm')}>
            {search.frequency === 'immediate' ? 'Treci pe zilnic' : 'Treci pe imediat'}
          </button>
        </KeepingForm>

        {!renaming ? (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.rename}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={buttonClasses('secondary', 'sm')}
        >
          {c.matchesTitle}
        </button>

        <KeepingForm
          action={remove}
          onSubmit={(event) => {
            if (!window.confirm(c.deleteConfirm)) event.preventDefault();
          }}
          className="ml-auto"
        >
          <input type="hidden" name="id" value={search.id} />
          <button
            type="submit"
            disabled={deleting}
            className="text-body text-danger underline underline-offset-4"
          >
            {c.delete}
          </button>
        </KeepingForm>
      </div>

      {open ? (
        <div className="mt-4 rounded-card border border-border bg-ground-alt p-4">
          <h3 className="text-body font-medium">{c.matchesTitle}</h3>
          {matches.length === 0 ? (
            <p className="mt-2 text-body text-muted">{c.matchesEmpty}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {matches.map((match) => (
                <li key={match.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                  <Link
                    href={requestRoute(match.cargo_listing_id)}
                    className="text-body link-accent"
                  >
                    {match.title ?? 'Cerere de transport'}
                  </Link>
                  <p className="mt-0.5 text-small text-muted">{when(match.created_at)}</p>
                  {match.reasons.length > 0 ? (
                    <>
                      <p className="mt-2 text-small text-muted">{c.why}</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {match.reasons.map((reason) => (
                          <li key={reason} className="text-small">
                            · {reason}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {updateState.error !== undefined || deleteState.error !== undefined ? (
        <p role="alert" className="mt-3 text-body text-danger">
          {updateState.error ?? deleteState.error}
        </p>
      ) : null}
      {updateState.notice !== undefined ? (
        <p role="status" className="mt-3 text-body text-muted">
          {updateState.notice}
        </p>
      ) : null}
      {updateState.quotaReached === true ? (
        <p className="mt-2 text-body">
          <Link href={ROUTES.plans} className="link-accent">
            {alertsCopy.quota.action}
          </Link>
        </p>
      ) : null}
    </li>
  );
}
