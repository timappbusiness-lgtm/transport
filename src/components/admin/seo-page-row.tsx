'use client';

import Link from 'next/link';
import {
  setSeoPagePublishedAction,
  type PageActionState,
} from '@/app/admin/pagini/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { pageHref, pageSubject, type SeoPage } from '@/lib/seo-pages';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: PageActionState = {};

/**
 * One page in the list, with the one button that matters.
 *
 * Publishing is the moment a page becomes visible to search engines, so
 * the button says which way it goes rather than toggling something
 * labelled "stare". A row that reads "Publică" and then silently
 * unpublishes is how a landing page disappears without anybody noticing.
 */
export function SeoPageRow({ page }: { page: SeoPage }) {
  const [state, action, pending] = useKeptActionState(setSeoPagePublishedAction, EMPTY);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body">{pageSubject(page)}</p>
        <p className="truncate font-mono text-label text-muted">{pageHref(page)}</p>
      </div>

      <StatusBadge tone={page.isPublished ? 'success' : 'neutral'}>
        {page.isPublished ? 'Publicată' : 'Ciornă'}
      </StatusBadge>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${ROUTES.adminPages}/${page.slug}`}
          className={buttonClasses('secondary', 'sm')}
        >
          Editează
        </Link>

        <Link
          href={
            page.isPublished
              ? pageHref(page)
              : `${ROUTES.adminPages}/${page.slug}/previzualizare`
          }
          className="text-small text-muted underline underline-offset-4 decoration-border-strong hover:text-foreground"
        >
          {page.isPublished ? 'Vezi' : 'Previzualizează'}
        </Link>

        <KeepingForm action={action}>
          <input type="hidden" name="slug" value={page.slug} />
          <input type="hidden" name="published" value={page.isPublished ? 'false' : 'true'} />
          <button
            type="submit"
            disabled={pending}
            className={buttonClasses(page.isPublished ? 'secondary' : 'primary', 'sm')}
          >
            {page.isPublished ? 'Retrage' : 'Publică'}
          </button>
        </KeepingForm>
      </div>

      {state.error ? (
        <div className="w-full">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </li>
  );
}
