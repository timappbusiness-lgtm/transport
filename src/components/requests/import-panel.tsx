'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { extractFromLinkAction, extractFromPhotoAction } from '@/app/cerere/import-actions';
import { buttonClasses } from '@/components/ui/button';
import { importCopy } from '@/content/import-anunt';
import {
  ACCEPTED_IMAGE_TYPES,
  looksLikeListingUrl,
  refusalFor,
  type ExtractionResult,
} from '@/lib/listing-import';
import { cn } from '@/lib/utils';

/**
 * Filling the vehicle step from a listing.
 *
 * Two shapes this had to stay clear of.
 *
 * The first is a panel that replaces the form. It does not: it sits above
 * the fields, and the fields are complete and usable with it collapsed,
 * ignored or broken. Every refusal sentence ends by saying so, because a
 * person who thinks the import is the only way in leaves when it fails.
 *
 * The second is a panel that hides what it did. Each field it filled
 * carries a chip, the block carries the line that says to check them, and
 * a field the model was unsure about is left empty and counted rather
 * than filled with a guess. Somebody who trusts a prefilled year they did
 * not read finds out it was wrong when a carrier arrives for a different
 * car.
 */

export interface ImportPanelProps {
  /** Applies what survived, and returns how many fields it wrote. */
  onExtracted: (fields: Record<string, string>) => number;
  /** Remembers the photo the person may choose to attach. */
  onImageFound: (url: string | null) => void;
  signedIn: boolean;
}

type Tab = 'link' | 'photo';

export function ImportPanel({ onExtracted, onImageFound, signedIn }: ImportPanelProps) {
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const c = importCopy;

  function handle(result: ExtractionResult): void {
    if (!result.ok) {
      setError(refusalFor(result.reason).message);
      setNotice(null);
      return;
    }

    const written = onExtracted(result.fields ?? {});
    onImageFound(result.image_url ?? null);
    setRemaining(typeof result.remaining === 'number' ? result.remaining : null);
    setError(null);

    if (written === 0) {
      setNotice(c.nothing);
      return;
    }

    const dropped = result.dropped?.length ?? 0;
    setNotice(dropped === 0 ? null : dropped === 1 ? c.dropped.one : c.dropped.many(dropped));
  }

  function submitLink(): void {
    if (!looksLikeListingUrl(url)) {
      setError(refusalFor('bad_request').message);
      return;
    }
    startTransition(async () => {
      handle(await extractFromLinkAction(url));
    });
  }

  function submitPhoto(): void {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError(refusalFor('bad_request').message);
      return;
    }
    const data = new FormData();
    data.set('photo', file);
    startTransition(async () => {
      handle(await extractFromPhotoAction(data));
    });
  }

  const tabClasses = (active: boolean): string =>
    cn(
      'rounded-input px-3.5 py-2 text-body',
      active
        ? 'bg-surface font-medium text-foreground shadow-card'
        : 'text-muted hover:text-foreground',
    );

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-ground-alt p-4">
      <div>
        <p className="text-body font-medium">{c.title}</p>
        <p className="mt-1 max-w-[56ch] text-body text-muted">{c.lede}</p>
      </div>

      <div
        role="tablist"
        aria-label={c.title}
        className="flex w-fit gap-1 rounded-input bg-ground p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'link'}
          onClick={() => setTab('link')}
          className={tabClasses(tab === 'link')}
        >
          {c.tabs.link}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'photo'}
          onClick={() => setTab('photo')}
          className={tabClasses(tab === 'photo')}
        >
          {c.tabs.photo}
        </button>
      </div>

      {tab === 'link' ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-url`} className="text-body">
            {c.link.label}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={c.link.placeholder}
              className="w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
            />
            <button
              type="button"
              onClick={submitLink}
              disabled={pending}
              className={cn(buttonClasses('secondary'), 'shrink-0')}
            >
              {pending ? c.link.working : c.link.submit}
            </button>
          </div>
          <p className="text-small text-muted">{c.link.hint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-photo`} className="text-body">
            {c.photo.label}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`${id}-photo`}
              ref={fileInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="w-full rounded-input border border-border-strong bg-surface px-3.5 py-2 text-body file:mr-3 file:rounded-input file:border-0 file:bg-ground file:px-3 file:py-1.5 file:text-body"
            />
            <button
              type="button"
              onClick={submitPhoto}
              disabled={pending}
              className={cn(buttonClasses('secondary'), 'shrink-0')}
            >
              {pending ? c.photo.working : c.photo.submit}
            </button>
          </div>
          <p className="text-small text-muted">{c.photo.hint}</p>
        </div>
      )}

      {error !== null ? (
        <p
          role="alert"
          className="rounded-input border border-danger/45 bg-danger/8 px-3.5 py-2.5 text-body"
        >
          {error}
        </p>
      ) : null}

      {notice !== null ? (
        <p role="status" className="text-body text-muted">
          {notice}
        </p>
      ) : null}

      {remaining !== null ? (
        <p className="text-small text-muted">
          {remaining === 1 ? c.remaining.last : c.remaining.some(remaining)}
        </p>
      ) : null}

      {!signedIn ? <p className="text-small text-muted">{c.attach.needsAccount}</p> : null}

      <p className="text-small text-muted">{c.manual}</p>
    </div>
  );
}

/** The chip on a field somebody else filled. */
export function AutoChip() {
  return (
    <span
      title={importCopy.autoChipTitle}
      // The design has no brand accent on purpose, so the chip is made of
      // weight and a border rather than a colour nothing else uses.
      className="ml-2 rounded-full border border-warning/45 bg-warning/10 px-2 py-0.5 text-small font-medium uppercase tracking-wide text-foreground"
    >
      {importCopy.autoChip}
    </span>
  );
}

/**
 * The line above the fields once anything was filled automatically.
 *
 * Its wording is fixed by the brief and pinned by a test. It is the
 * difference between a form that helped and a form that quietly asserted
 * things about somebody's car.
 */
export function ImportDisclaimer() {
  return (
    <p
      role="status"
      className="rounded-input border border-warning/45 bg-warning/10 px-3.5 py-2.5 text-body"
    >
      {importCopy.disclaimer}
    </p>
  );
}
