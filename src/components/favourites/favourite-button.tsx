'use client';

import {
  addFavouriteAction,
  removeFavouriteAction,
  type FavouriteState,
} from '@/app/cont/favoriti/actions';
import { FormError } from '@/components/auth/form';
import { favouritesCopy } from '@/content/favoriti';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: FavouriteState = {};
const c = favouritesCopy;

/**
 * „Adaugă la favoriți", de oriunde apare o firmă.
 *
 * Aceeași componentă pe profilul public, pe o ofertă primită și pe o
 * comandă încheiată — trei locuri în care întrebarea „cu ăștia mai
 * lucrez?" chiar apare.
 */
export function FavouriteButton({
  carrierCompanyId,
  isFavourite,
}: {
  carrierCompanyId: string;
  isFavourite: boolean;
}) {
  const [state, action, pending] = useKeptActionState(
    isFavourite ? removeFavouriteAction : addFavouriteAction,
    EMPTY,
  );

  return (
    <KeepingForm action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="carrier_company_id" value={carrierCompanyId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={isFavourite}
        className="inline-flex items-center gap-1.5 text-small text-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        <span aria-hidden="true">{isFavourite ? '★' : '☆'}</span>
        {state.notice ?? (isFavourite ? c.added : c.add)}
      </button>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
