'use client';

import { useFormStatus } from 'react-dom';
import { buttonClasses } from '@/components/ui/button';
import { firmaCopy } from '@/content/firma';

/**
 * The save button, stuck to the bottom of the viewport on a phone.
 *
 * These tabs are long — forty-two counties, thirteen categories, ten
 * pieces of kit — and a save button that lives under all of them is a save
 * button people scroll past without pressing. On a wide screen there is
 * nothing to stick to, so it goes back to being an ordinary button at the
 * end of the form.
 */
export function SaveBar() {
  const { pending } = useFormStatus();

  return (
    <div data-save-bar className="sticky bottom-[var(--bottom-bar,0px)] z-10 -mx-4 mt-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClasses('primary', 'md')} w-full sm:w-auto sm:px-8`}
      >
        {pending ? firmaCopy.saving : firmaCopy.save}
      </button>
    </div>
  );
}
