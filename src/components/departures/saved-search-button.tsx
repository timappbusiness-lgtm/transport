'use client';

import { saveSearchAction, type SavedSearchState } from '@/app/trasee/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { departuresCopy } from '@/content/departures';
import { filtersToQuery, type DepartureFilters } from '@/lib/departure-filters';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: SavedSearchState = {};

/**
 * "Anunță-mă când apare un traseu."
 *
 * Signed out the action redirects to sign-in carrying this search in `next`,
 * so the filters are still there afterwards. The label says which of the two
 * is about to happen rather than pretending they are the same.
 */
export function SavedSearchButton({
  filters,
  signedIn,
}: {
  filters: DepartureFilters;
  signedIn: boolean;
}) {
  const [state, action] = useKeptActionState(saveSearchAction, EMPTY);
  const c = departuresCopy.empty;

  return (
    <KeepingForm action={action} className="flex flex-col gap-3">
      <input type="hidden" name="query" value={filtersToQuery(filters)} />
      <button type="submit" className={buttonClasses('secondary', 'md')}>
        {signedIn ? c.alert : c.alertSignedOut}
      </button>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
    </KeepingForm>
  );
}
