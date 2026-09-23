'use client';

import { useId, useState, useTransition, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  setCompanyLogoAction,
  updatePublicProfileAction,
  type ActionState,
} from '@/app/cont/actions';
import { FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { companyRoute } from '@/config/routes';
import { accountCopy } from '@/content/account';
import type { Company } from '@/lib/auth/account';
import {
  ACCEPTED_LOGO_TYPES,
  MAX_LOGO_BYTES,
  MAX_PUBLIC_DESCRIPTION,
  logoStoragePath,
} from '@/lib/directory';
import { createClient } from '@/lib/supabase/client';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { useUnsavedGuard } from '@/lib/continuity/use-unsaved-guard';
import { FAILURE_MESSAGES, failureKind } from '@/lib/continuity/network';
import { announceSessionExpired } from '@/lib/continuity/session-store';

const EMPTY: ActionState = {};
const c = accountCopy.publicProfile;

/**
 * Opting the firm into the public directory.
 *
 * The checkbox is the whole of the consent: nothing about the company is
 * published until it is ticked, and unticking it removes the profile
 * immediately — the view the directory reads has the flag in its WHERE, so
 * there is no cache to wait for and no second switch to remember.
 *
 * What the page says about the profile's state is read from the company
 * row, not guessed: a firm that has opted in but is not yet verified is
 * told so, rather than left wondering why it cannot find itself.
 */
export function PublicProfileForm({ company, logoUrl }: { company: Company; logoUrl: string | null }) {
  const [state, action] = useKeptActionState(updatePublicProfileAction, EMPTY);
  const guardRef = useRef<HTMLFormElement>(null);
  // Leaving with changes nobody saved asks once; a save takes it away.
  useUnsavedGuard(guardRef, state);
  const descriptionId = useId();

  const isVerified = company.verification_status === 'verified';
  const isLive = company.public_profile_enabled && isVerified && !company.is_suspended;

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-body text-muted">{c.lede}</p>

      <KeepingForm ref={guardRef} action={action} className="flex flex-col gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <FormNotice>{state.notice}</FormNotice>

        <label className="flex items-start gap-3 text-body">
          <input
            type="checkbox"
            name="publicProfileEnabled"
            defaultChecked={company.public_profile_enabled}
            className="mt-0.5 size-4 accent-foreground"
          />
          <span>
            {c.enable}
            <span className="mt-1 block text-small text-muted">{c.enableHint}</span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={descriptionId} className="text-body font-medium">
            {c.description}
          </label>
          <textarea
            id={descriptionId}
            name="publicDescription"
            rows={3}
            maxLength={MAX_PUBLIC_DESCRIPTION}
            defaultValue={state.values?.publicDescription ?? company.public_description ?? ''}
            className="w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
          />
          <p className="text-small text-muted">{c.descriptionHint}</p>
          <FormError>{state.fieldErrors?.publicDescription}</FormError>
        </div>

        <SubmitButton className="sm:w-auto sm:px-8 sm:self-start">
          {accountCopy.profile.save}
        </SubmitButton>
      </KeepingForm>

      <LogoField company={company} logoUrl={logoUrl} />

      {company.public_profile_enabled ? (
        <p className="text-body text-muted">
          {company.is_suspended ? (
            c.suspended
          ) : !isVerified ? (
            c.pending
          ) : isLive && company.slug ? (
            <Link
              href={companyRoute(company.slug)}
              className="link-accent"
            >
              {c.live}
            </Link>
          ) : (
            c.hiddenByStaff
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The logo goes straight from the browser into the company's own folder in
 * the `company-logos` bucket, so the file never passes through a server
 * action's body limit. The type and size are checked here for the message,
 * and by the bucket for the rule.
 */
function LogoField({ company, logoUrl }: { company: Company; logoUrl: string | null }) {
  const router = useRouter();
  const inputId = useId();
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  // The file whose upload failed, kept so „Încearcă din nou" sends it
  // again: the picker is emptied on every choice (so the same file can be
  // chosen twice), and a failure used to leave nothing to retry with.
  const [failed, setFailed] = useState<File | null>(null);

  function upload(file: File) {
    if (!(ACCEPTED_LOGO_TYPES as readonly string[]).includes(file.type) || file.size > MAX_LOGO_BYTES) {
      setState({ error: c.logoHint });
      return;
    }

    startTransition(async () => {
      setState({});
      setFailed(null);
      const path = logoStoragePath(company.id, file.type);
      const { error } = await createClient()
        .storage.from('company-logos')
        .upload(path, file, { contentType: file.type, upsert: true });

      if (error) {
        setState({ error: 'Fișierul nu a putut fi încărcat. A rămas ales — încearcă din nou.' });
        setFailed(file);
        return;
      }

      try {
        const result = await setCompanyLogoAction(path);
        setState(result);
        if (result.error !== undefined) setFailed(file);
      } catch (thrown) {
        const kind = failureKind(thrown);
        if (kind === null) throw thrown;
        if (kind === 'session') announceSessionExpired();
        setState({ error: FAILURE_MESSAGES[kind] });
        setFailed(file);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <p className="text-body font-medium">{c.logo}</p>
      <FormError>{state.error}</FormError>
      {failed !== null && !pending ? (
        <div>
          <button type="button" onClick={() => upload(failed)} className={buttonClasses('secondary', 'sm')}>
            Încearcă din nou
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          // Not next/image: a storage URL capped at 1 MB, drawn at 56px.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={c.logoAlt}
            width={56}
            height={56}
            className="size-14 rounded-full border border-border object-cover"
          />
        ) : null}

        <label htmlFor={inputId} className={buttonClasses('secondary', 'sm')}>
          {pending ? '…' : c.logoUpload}
        </label>
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED_LOGO_TYPES.join(',')}
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload(file);
          }}
        />

        {company.logo_path ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setState(await setCompanyLogoAction(null));
                router.refresh();
              })
            }
            className="text-body text-muted underline underline-offset-4 hover:text-foreground"
          >
            {c.logoRemove}
          </button>
        ) : null}
      </div>

      <p className="text-small text-muted">{c.logoHint}</p>
    </div>
  );
}
