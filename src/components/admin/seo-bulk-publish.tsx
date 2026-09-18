'use client';

import { useActionState } from 'react';
import {
  setSeoPagesPublishedByTypeAction,
  type PageActionState,
} from '@/app/admin/pagini/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import type { SeoPageType } from '@/lib/seo-pages';

const EMPTY: PageActionState = {};

/**
 * Publishing a whole type at once.
 *
 * Forty-two county pages published one at a time is how a person ends up
 * publishing forty-one. The count comes back from the RPC and is stated,
 * because "gata" after a bulk action is how nobody finds out.
 */
export function SeoBulkPublish({ type, drafts }: { type: SeoPageType; drafts: number }) {
  const [state, action, pending] = useActionState(setSeoPagesPublishedByTypeAction, EMPTY);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="published" value="true" />
        <button
          type="submit"
          disabled={pending || drafts === 0}
          className={buttonClasses('secondary', 'sm')}
        >
          {drafts === 0 ? 'Toate sunt publicate' : `Publică toate (${drafts})`}
        </button>
      </form>
      <FormError>{state.error}</FormError>
      {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
    </div>
  );
}
