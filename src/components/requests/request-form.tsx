'use client';

import { useActionState, useEffect, useId, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { attachListingPhotoAction } from '@/app/cerere/import-actions';
import { publishRequestAction, type PublishRequestState } from '@/app/cerere/actions';
import { FormError } from '@/components/auth/form';
import { PushPermissionCard } from '@/components/push/permission-card';
import { AutoChip, ImportDisclaimer, ImportPanel } from '@/components/requests/import-panel';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CITY_GROUPS } from '@/lib/cities';
import { createDraftStore } from '@/lib/draft-store';
import { importCopy } from '@/content/import-anunt';
import { applyExtraction, type ImportedField } from '@/lib/listing-import';
import { CARGO_CATEGORY_LABELS, FILTERABLE_CATEGORIES } from '@/lib/departures';
import {
  MAX_DAMAGE_NOTES,
  MAX_DESCRIPTION,
  REQUEST_STEPS,
  serialiseDraft,
  validateStep,
  type RequestDraft,
  type RequestField,
  type RequestStep,
} from '@/lib/request-form';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';
import { cn } from '@/lib/utils';
import type { FieldErrors } from '@/lib/validation/auth';

const EMPTY: PublishRequestState = {};
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-[0.9375rem]';

export interface RequestFormProps {
  /** The prefilled draft, from the price calculator or empty. */
  initial: RequestDraft;
  /** True when the link carried anything, so a stored draft does not win. */
  hasPrefill: boolean;
  /** Today as `YYYY-MM-DD`, from the server: React refuses a clock in render. */
  today: string;
  signedIn: boolean;
  /** Where sign-in should come back to, already safe. */
  returnTo: string;
}

function Labelled({
  label,
  htmlFor,
  hint,
  error,
  auto = false,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Filled from a listing rather than typed, so the label says so. */
  auto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {auto ? <AutoChip /> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#1C262B]"
      />
      {label}
    </label>
  );
}

/**
 * Publishing a request, in four steps.
 *
 * Open to a visitor with no account: the account is asked for at the last
 * step and not before, because a sign-up wall in front of an empty form is
 * how a marketplace never gets its first request. What is typed is kept in
 * `sessionStorage`, so the trip through sign-up brings it back.
 *
 * Every rule here has a twin in `create_cargo_request`. When the two could
 * disagree the database wins, and its sentence is shown as it is.
 */
export function RequestForm({ initial, hasPrefill, today, signedIn, returnTo }: RequestFormProps) {
  const [state, action, pending] = useActionState(publishRequestAction, EMPTY);
  // The draft lives in sessionStorage, not in React: it has to survive the
  // trip through sign-up. See src/lib/draft-store.ts.
  const [store] = useState(() => createDraftStore(initial, hasPrefill));
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [step, setStep] = useState<RequestStep>('ruta');
  const [errors, setErrors] = useState<FieldErrors<RequestField>>({});
  // Which fields a listing filled, so each one can say so. Cleared per
  // field the moment somebody edits it: a chip on a value they typed
  // themselves is a lie about where it came from.
  const [auto, setAuto] = useState<Set<ImportedField>>(new Set());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [attachPhoto, setAttachPhoto] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const id = useId();
  const c = requestsCopy.form;

  // Published, or written down as a draft the database will not put on the
  // board yet. Either way it is somewhere safer than a browser tab now.
  useEffect(() => {
    if (state.requestId !== undefined) store.clear();
  }, [state.requestId, store]);

  function set<K extends RequestField>(field: K, value: RequestDraft[K]): void {
    store.set({ ...draft, [field]: value });
    setAuto((current) => {
      if (!current.has(field as ImportedField)) return current;
      const next = new Set(current);
      next.delete(field as ImportedField);
      return next;
    });
  }

  /**
   * What the import panel hands back.
   *
   * Everything goes through `applyExtraction`, which drops anything the
   * form itself would have refused — so a wrong year never reaches a box
   * somebody has to notice and delete. The count it returns is what the
   * panel turns into "nothing to fill here".
   */
  function onExtracted(fields: Record<string, string>): number {
    const applied = applyExtraction(draft, fields, today);
    store.set(applied.draft);
    setAuto(new Set(applied.filled));
    return applied.filled.length;
  }

  /**
   * The photo the listing offered, remembered but not taken.
   *
   * Nothing is downloaded here. The box below starts unticked and the
   * fetch happens when somebody ticks it, because a photo copied into our
   * bucket without being asked is a copy we had no reason to make.
   */
  function onImageFound(url: string | null): void {
    setPhotoUrl(url);
    setAttachPhoto(false);
    setPhotoPath(null);
    setPhotoNote(null);
  }

  function onAttachChange(checked: boolean): void {
    setAttachPhoto(checked);
    if (!checked || photoUrl === null || photoPath !== null) {
      if (!checked) setPhotoNote(null);
      return;
    }
    void attachListingPhotoAction(photoUrl).then((result) => {
      if (result.ok && result.path !== undefined) {
        setPhotoPath(result.path);
        setPhotoNote(importCopy.attach.attached);
        return;
      }
      // The request is worth more than the photo, so a failure here
      // unticks the box and says so rather than blocking publication.
      setAttachPhoto(false);
      setPhotoNote(importCopy.attach.failed);
    });
  }

  function goTo(next: RequestStep): void {
    setErrors({});
    setStep(next);
  }

  function onNext(): void {
    const found = validateStep(draft, step, today);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const index = REQUEST_STEPS.indexOf(step);
    const next = REQUEST_STEPS[index + 1];
    if (next) goTo(next);
  }

  function onBack(): void {
    const index = REQUEST_STEPS.indexOf(step);
    const previous = REQUEST_STEPS[index - 1];
    if (previous) goTo(previous);
  }

  if (state.requestId !== undefined) {
    return <Result state={state} />;
  }

  const fieldError = (field: RequestField): string | undefined =>
    errors[field] ?? state.fieldErrors?.[field];

  const index = REQUEST_STEPS.indexOf(step);
  const isLast = index === REQUEST_STEPS.length - 1;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="draft" value={serialiseDraft(draft)} />
      {photoPath !== null && attachPhoto ? (
        <input type="hidden" name="photo_path" value={photoPath} />
      ) : null}

      <Steps current={step} onSelect={goTo} />

      {step === 'ruta' ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-[1.0625rem]">{c.route.title}</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled
              label={c.route.fromCity}
              htmlFor={`${id}-from`}
              hint={c.route.cityHint}
              error={fieldError('fromCity')}
            >
              <div className="flex gap-2">
                <select
                  aria-label={c.route.fromCountry}
                  value={draft.fromCountry}
                  onChange={(event) => set('fromCountry', event.target.value)}
                  className={cn(CONTROL, 'w-28')}
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.code}
                    </option>
                  ))}
                </select>
                <input
                  id={`${id}-from`}
                  list={`${id}-cities`}
                  value={draft.fromCity}
                  onChange={(event) => set('fromCity', event.target.value)}
                  placeholder="München"
                  className={CONTROL}
                />
              </div>
            </Labelled>

            <Labelled
              label={c.route.toCity}
              htmlFor={`${id}-to`}
              error={fieldError('toCity')}
            >
              <div className="flex gap-2">
                <select
                  aria-label={c.route.toCountry}
                  value={draft.toCountry}
                  onChange={(event) => set('toCountry', event.target.value)}
                  className={cn(CONTROL, 'w-28')}
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.code}
                    </option>
                  ))}
                </select>
                <input
                  id={`${id}-to`}
                  list={`${id}-cities`}
                  value={draft.toCity}
                  onChange={(event) => set('toCity', event.target.value)}
                  placeholder="Cluj-Napoca"
                  className={CONTROL}
                />
              </div>
            </Labelled>
          </div>

          {/* Suggestions, not a closed list: most cars are collected from
              somewhere smaller than a county seat. */}
          <datalist id={`${id}-cities`}>
            {CITY_GROUPS.flatMap((group) => group.cities).map((city) => (
              <option key={`${city.name}-${city.country}`} value={city.name} />
            ))}
          </datalist>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled
              label={c.route.loadingFrom}
              htmlFor={`${id}-from-date`}
              error={fieldError('loadingFrom')}
            >
              <input
                id={`${id}-from-date`}
                type="date"
                min={today}
                value={draft.loadingFrom}
                onChange={(event) => set('loadingFrom', event.target.value)}
                className={CONTROL}
              />
            </Labelled>
            <Labelled
              label={c.route.loadingTo}
              htmlFor={`${id}-to-date`}
              hint={c.route.windowHint}
              error={fieldError('loadingTo')}
            >
              <input
                id={`${id}-to-date`}
                type="date"
                min={draft.loadingFrom === '' ? today : draft.loadingFrom}
                value={draft.loadingTo}
                onChange={(event) => set('loadingTo', event.target.value)}
                className={CONTROL}
              />
            </Labelled>
          </div>
        </fieldset>
      ) : null}

      {step === 'vehicul' ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-[1.0625rem]">{c.vehicle.title}</legend>

          <ImportPanel
            onExtracted={onExtracted}
            onImageFound={onImageFound}
            signedIn={signedIn}
          />

          {auto.size > 0 ? <ImportDisclaimer /> : null}

          {photoUrl !== null && signedIn ? (
            <div className="flex flex-col gap-1.5 rounded-card border border-border bg-ground-alt p-4">
              <Check
                label={importCopy.attach.label}
                checked={attachPhoto}
                onChange={onAttachChange}
              />
              <p className="pl-7 text-xs text-muted">{importCopy.attach.hint}</p>
              {photoNote !== null ? (
                <p role="status" className="pl-7 text-xs text-muted">
                  {photoNote}
                </p>
              ) : null}
            </div>
          ) : null}

          <Labelled
            label={c.vehicle.category}
            htmlFor={`${id}-category`}
            error={fieldError('category')}
            auto={auto.has('category')}
          >
            <select
              id={`${id}-category`}
              value={draft.category}
              onChange={(event) =>
                set('category', event.target.value as RequestDraft['category'])
              }
              className={CONTROL}
            >
              {FILTERABLE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CARGO_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Labelled>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label={c.vehicle.make} htmlFor={`${id}-make`} error={fieldError('make')} auto={auto.has('make')}>
              <input
                id={`${id}-make`}
                value={draft.make}
                onChange={(event) => set('make', event.target.value)}
                placeholder={c.vehicle.makePlaceholder}
                className={CONTROL}
              />
            </Labelled>
            <Labelled label={c.vehicle.model} htmlFor={`${id}-model`} error={fieldError('model')} auto={auto.has('model')}>
              <input
                id={`${id}-model`}
                value={draft.model}
                onChange={(event) => set('model', event.target.value)}
                placeholder={c.vehicle.modelPlaceholder}
                className={CONTROL}
              />
            </Labelled>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label={c.vehicle.year} htmlFor={`${id}-year`} error={fieldError('year')} auto={auto.has('year')}>
              <input
                id={`${id}-year`}
                inputMode="numeric"
                value={draft.year}
                onChange={(event) => set('year', event.target.value)}
                placeholder="2018"
                className={CONTROL}
              />
            </Labelled>
            <Labelled
              label={c.vehicle.weight}
              htmlFor={`${id}-weight`}
              hint={c.vehicle.weightHint}
              error={fieldError('weightKg')}
              auto={auto.has('weightKg')}
            >
              <input
                id={`${id}-weight`}
                inputMode="numeric"
                value={draft.weightKg}
                onChange={(event) => set('weightKg', event.target.value)}
                className={CONTROL}
              />
            </Labelled>
          </div>
        </fieldset>
      ) : null}

      {step === 'stare' ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-[1.0625rem]">{c.condition.title}</legend>
          <p className="max-w-[54ch] text-sm text-muted">{c.condition.lede}</p>

          <div className="flex flex-col gap-3 rounded-card border border-border bg-ground-alt p-4">
            <Check
              label={c.condition.isRunning}
              checked={draft.isRunning}
              onChange={(value) => set('isRunning', value)}
            />
            <Check
              label={c.condition.wheelsTurn}
              checked={draft.wheelsTurn}
              onChange={(value) => set('wheelsTurn', value)}
            />
            <Check
              label={c.condition.steeringWorks}
              checked={draft.steeringWorks}
              onChange={(value) => set('steeringWorks', value)}
            />
            <Check
              label={c.condition.hasKeys}
              checked={draft.hasKeys}
              onChange={(value) => set('hasKeys', value)}
            />
            {/* Derived in the database from the three above and never
                entered, so this only reports what they already say. */}
            {!draft.isRunning || !draft.wheelsTurn || !draft.steeringWorks ? (
              <p className="text-sm text-muted">{c.condition.winch}</p>
            ) : null}
          </div>

          <Check
            label={c.condition.isDamaged}
            checked={draft.isDamaged}
            onChange={(value) => set('isDamaged', value)}
          />
          {draft.isDamaged ? (
            <Labelled
              label={c.condition.damageNotes}
              htmlFor={`${id}-damage`}
              hint={c.condition.damageHint}
              error={fieldError('damageNotes')}
            >
              <textarea
                id={`${id}-damage`}
                rows={3}
                maxLength={MAX_DAMAGE_NOTES}
                value={draft.damageNotes}
                onChange={(event) => set('damageNotes', event.target.value)}
                className={CONTROL}
              />
            </Labelled>
          ) : null}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{c.condition.service}</legend>
            {(
              [
                ['pe_sens', c.condition.serviceStandard, c.condition.serviceStandardNote],
                ['expres', c.condition.serviceExpress, c.condition.serviceExpressNote],
              ] as const
            ).map(([value, label, note]) => (
              <label key={value} className="flex gap-2.5 text-sm">
                <input
                  type="radio"
                  name="service"
                  value={value}
                  checked={draft.serviceType === value}
                  onChange={() => set('serviceType', value)}
                  className="mt-0.5 size-4 accent-[#1C262B]"
                />
                <span>
                  {label}
                  <span className="block text-xs text-muted">{note}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </fieldset>
      ) : null}

      {step === 'contact' ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-[1.0625rem]">{c.contact.title}</legend>
          <p className="max-w-[54ch] text-sm text-muted">{c.contact.lede}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label={c.contact.name} htmlFor={`${id}-name`}>
              <input
                id={`${id}-name`}
                value={draft.contactName}
                onChange={(event) => set('contactName', event.target.value)}
                autoComplete="name"
                className={CONTROL}
              />
            </Labelled>
            <Labelled
              label={c.contact.phone}
              htmlFor={`${id}-phone`}
              hint={c.contact.phoneHint}
              error={fieldError('contactPhone')}
            >
              <input
                id={`${id}-phone`}
                type="tel"
                value={draft.contactPhone}
                onChange={(event) => set('contactPhone', event.target.value)}
                autoComplete="tel"
                placeholder="+40722000111"
                className={CONTROL}
              />
            </Labelled>
          </div>

          <Labelled
            label={c.contact.email}
            htmlFor={`${id}-email`}
            error={fieldError('contactEmail')}
          >
            <input
              id={`${id}-email`}
              type="email"
              value={draft.contactEmail}
              onChange={(event) => set('contactEmail', event.target.value)}
              autoComplete="email"
              className={CONTROL}
            />
          </Labelled>

          <Labelled
            label={c.contact.description}
            htmlFor={`${id}-description`}
            hint={c.contact.descriptionHint}
            error={fieldError('description')}
          >
            <textarea
              id={`${id}-description`}
              rows={4}
              maxLength={MAX_DESCRIPTION}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
              className={CONTROL}
            />
          </Labelled>
        </fieldset>
      ) : null}

      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.needsAccount || (isLast && !signedIn) ? <AccountPanel returnTo={returnTo} /> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {index > 0 ? (
          <button type="button" onClick={onBack} className={buttonClasses('secondary', 'md')}>
            {c.back}
          </button>
        ) : null}

        {isLast ? (
          signedIn ? (
            <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
              {pending ? c.submitting : c.submit}
            </button>
          ) : null
        ) : (
          <button type="button" onClick={onNext} className={buttonClasses('primary', 'md')}>
            {c.next}
          </button>
        )}

        <span className="text-xs text-muted">
          {c.stepOf(index + 1, REQUEST_STEPS.length)}
        </span>
      </div>
    </form>
  );
}

/** The four steps, clickable backwards only: forward runs the checks. */
function Steps({
  current,
  onSelect,
}: {
  current: RequestStep;
  onSelect: (step: RequestStep) => void;
}) {
  const c = requestsCopy.form;
  const index = REQUEST_STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={c.title}>
      {REQUEST_STEPS.map((step, position) => {
        const done = position < index;
        const active = step === current;
        return (
          <li key={step}>
            <button
              type="button"
              onClick={() => (done ? onSelect(step) : undefined)}
              disabled={!done && !active}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'rounded-pill border px-3.5 py-1.5 text-[0.8125rem]',
                active
                  ? 'border-foreground bg-foreground text-white'
                  : done
                    ? 'border-border-strong text-foreground'
                    : 'border-border text-muted',
              )}
            >
              {c.steps[step]}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function AccountPanel({ returnTo }: { returnTo: string }) {
  const c = requestsCopy.form.account;
  const next = `?next=${encodeURIComponent(returnTo)}`;
  return (
    <section className="rounded-card border border-border-strong bg-ground-alt p-5">
      <h2 className="text-[1.0625rem]">{c.title}</h2>
      <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`${ROUTES.signUpIndividual}${next}`}
          className={buttonClasses('primary', 'md')}
        >
          {c.signUp}
        </Link>
        <Link href={`${ROUTES.signIn}${next}`} className={buttonClasses('secondary', 'md')}>
          {c.signIn}
        </Link>
      </div>
    </section>
  );
}

/**
 * What happened. Two outcomes, and the second is the interesting one: the
 * request is written down but not on the board, and the database has said
 * in Romanian what is left to do.
 */
function Result({ state }: { state: PublishRequestState }) {
  const c = requestsCopy.form.saved;
  const published = state.status === 'active';
  return (
    <section className="rounded-card border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-[1.25rem]">{published ? c.published : c.title}</h2>
      {published ? (
        <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.publishedBody}</p>
      ) : (
        <p className="mt-2 max-w-[54ch] text-sm">{state.publishError}</p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.accountRequests} className={buttonClasses('primary', 'md')}>
          {c.seeRequests}
        </Link>
        <Link href={ROUTES.requests} className={buttonClasses('secondary', 'md')}>
          {c.seeBoard}
        </Link>
      </div>

      {/* The moment notifications become obviously useful: the request is
          on the board and the next thing that happens to it happens
          without the person looking. Nowhere else in this form asks. */}
      <PushPermissionCard audience="client" trigger={published} />
    </section>
  );
}
