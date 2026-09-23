'use client';

import { useActionState, useId, useState, useTransition } from 'react';
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
  const [state, action] = useActionState(updatePublicProfileAction, EMPTY);
  const descriptionId = useId();

  const isVerified = company.verification_status === 'verified';
  const isLive = company.public_profile_enabled && isVerified && !company.is_suspended;

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-sm text-muted">{c.lede}</p>

      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <FormNotice>{state.notice}</FormNotice>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="publicProfileEnabled"
            defaultChecked={company.public_profile_enabled}
            className="mt-0.5 size-4 accent-foreground"
          />
          <span>
            {c.enable}
            <span className="mt-1 block text-xs text-muted">{c.enableHint}</span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={descriptionId} className="text-sm font-medium">
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
          <p className="text-xs text-muted">{c.descriptionHint}</p>
          <FormError>{state.fieldErrors?.publicDescription}</FormError>
        </div>

        <SubmitButton className="sm:w-auto sm:px-8 sm:self-start">
          {accountCopy.profile.save}
        </SubmitButton>
      </form>

      <LogoField company={company} logoUrl={logoUrl} />

      {company.public_profile_enabled ? (
        <p className="text-sm text-muted">
          {company.is_suspended ? (
            c.suspended
          ) : !isVerified ? (
            c.pending
          ) : isLive && company.slug ? (
            <Link
              href={companyRoute(company.slug)}
              className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
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

  function upload(file: File) {
    if (!(ACCEPTED_LOGO_TYPES as readonly string[]).includes(file.type) || file.size > MAX_LOGO_BYTES) {
      setState({ error: c.logoHint });
      return;
    }

    startTransition(async () => {
      setState({});
      const path = logoStoragePath(company.id, file.type);
      const { error } = await createClient()
        .storage.from('company-logos')
        .upload(path, file, { contentType: file.type, upsert: true });

      if (error) {
        setState({ error: 'Fișierul nu a putut fi încărcat. Încearcă din nou.' });
        return;
      }

      setState(await setCompanyLogoAction(path));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <p className="text-sm font-medium">{c.logo}</p>
      <FormError>{state.error}</FormError>

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
            className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
          >
            {c.logoRemove}
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted">{c.logoHint}</p>
    </div>
  );
}
