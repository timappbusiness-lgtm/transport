'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DraftRestored, DraftStatus } from '@/components/continuity/draft-status';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { Labelled, MEMENTO_CONTROL } from '@/components/memento/vehicle-form';
import { saveStarterAction, type StarterAnswer, type StarterPayload } from '@/app/memento-expirari/actions';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { withNext } from '@/lib/auth/next-path';
import { STEP_PARAM, parseStep, reachableStep, withStep, type StepDefinition } from '@/lib/continuity/steps';
import { useDraft } from '@/lib/continuity/use-draft';
import { failureMessage } from '@/lib/uploads/use-upload-queue';
import { isIsoDay, isPlate, MEMENTO_KIND_LABELS, MEMENTO_MAIN_KINDS, normalisePlate, type MementoKind } from '@/lib/memento';
import { newUploadId } from '@/lib/uploads/paths';
import { cn } from '@/lib/utils';

type Step = 'vehicul' | 'documente' | 'cont';

export const STARTER_STEPS: StepDefinition<Step> = {
  steps: ['vehicul', 'documente', 'cont'],
  slugs: { vehicul: 'vehicul', documente: 'documente', cont: 'cont' },
};

const c = mementoCopy.landing;
const f = mementoCopy.fields;
const EXTRA_KINDS: readonly MementoKind[] = ['trusa_medicala', 'extinctor', 'revizie', 'altceva'];

function emptyPayload(): StarterPayload {
  return { vehicleId: '', plate: '', make: '', model: '', dates: {}, dueKm: '', customName: '' };
}

/** A stored draft, or null when it is not one: every field is checked on the way in. */
export function parseStarter(value: unknown): StarterPayload | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const str = (key: string, max: number) => (typeof v[key] === 'string' ? (v[key] as string).slice(0, max) : '');
  const dates: Record<string, string> = {};
  if (v.dates && typeof v.dates === 'object' && !Array.isArray(v.dates)) {
    for (const [kind, date] of Object.entries(v.dates as Record<string, unknown>)) {
      if ((MEMENTO_KIND_LABELS as Record<string, string>)[kind] !== undefined && typeof date === 'string' && isIsoDay(date)) {
        dates[kind] = date;
      }
    }
  }
  return {
    vehicleId: str('vehicleId', 36),
    plate: str('plate', 16),
    make: str('make', 40),
    model: str('model', 40),
    dates,
    dueKm: str('dueKm', 9),
    customName: str('customName', 60),
  };
}

function datesCount(payload: StarterPayload): number {
  return Object.keys(payload.dates).length + (payload.dueKm.trim() !== '' && !payload.dates.revizie ? 1 : 0);
}

/**
 * „Memento expirări auto", started without an account.
 *
 * Three steps in the address — the car, the dates, the account — and a
 * draft kept in the browser from the first letter, so the trip to the
 * sign-up page and back (and a refresh, and a closed tab) finds it all
 * where it was. The account is asked for last, as on the request form:
 * a person who has typed their plate and four dates has a reason to make
 * one. Signed in, the last step is a single button.
 */
export function MementoStarter({
  signedIn,
  save = saveStarterAction,
}: {
  signedIn: boolean;
  save?: (payload: StarterPayload) => Promise<StarterAnswer>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();
  const [payload, setPayload] = useState<StarterPayload>(emptyPayload);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = useDraft<StarterPayload>({
    form: 'memento',
    parse: parseStarter,
    signedIn,
    onRestore: (found) => setPayload(found.payload),
  });

  const requested = parseStep(searchParams.get(STEP_PARAM), STARTER_STEPS) ?? 'vehicul';
  const step = draft.ready
    ? reachableStep(requested, STARTER_STEPS.steps, (s) => (s === 'vehicul' ? isPlate(payload.plate) : true))
    : requested;

  function update(change: Partial<StarterPayload>) {
    // The id is the device's, chosen with the first letter and kept in the
    // draft: saved twice, after the trip through sign-up, it is one vehicle.
    const next = { ...payload, ...change, vehicleId: payload.vehicleId || newUploadId() };
    setPayload(next);
    setError(null);
    draft.save(next, STARTER_STEPS.slugs[step]);
  }

  function setDate(kind: MementoKind, value: string) {
    const dates = { ...payload.dates };
    if (value === '') delete dates[kind];
    else dates[kind] = value;
    update({ dates });
  }

  function go(next: Step) {
    window.history.pushState(null, '', `${pathname}${withStep(window.location.search, next, STARTER_STEPS)}`);
    draft.save(payload, STARTER_STEPS.slugs[next]);
    window.scrollTo({ top: 0 });
  }

  function onVehicleNext() {
    if (!isPlate(payload.plate)) {
      setError(c.needPlate);
      return;
    }
    go('documente');
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        const answer = await save(payload);
        if (answer.ok) {
          draft.clear();
          router.push(answer.redirectTo);
        } else {
          setError(answer.error);
        }
      } catch (caught) {
        setError(failureMessage(caught).message);
      }
    });
  }

  const returnTo = `${ROUTES.memento}?${STEP_PARAM}=${STARTER_STEPS.slugs.cont}`;
  const index = STARTER_STEPS.steps.indexOf(step);

  return (
    <div className="flex flex-col gap-6" data-memento-starter data-step={step}>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-label uppercase tracking-[0.08em]" aria-label="Pași">
        {STARTER_STEPS.steps.map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined} className={i === index ? 'text-foreground' : 'text-muted'}>
            {i + 1}. {c.steps[s]}
          </li>
        ))}
      </ol>

      {draft.restored !== null && step === 'vehicul' ? (
        <DraftRestored
          savedAt={draft.restored.savedAt}
          onStartOver={() => {
            draft.clear();
            setPayload({ ...emptyPayload(), vehicleId: newUploadId() });
          }}
        />
      ) : null}

      {step === 'vehicul' ? (
        <section className="flex flex-col gap-4" data-starter-step="vehicul">
          <h2 className="text-h3">{c.vehicleTitle}</h2>
          <Labelled label={f.plate} htmlFor={`${id}-plate`} error={error ?? undefined}>
            <input
              id={`${id}-plate`}
              value={payload.plate}
              onChange={(event) => update({ plate: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onVehicleNext();
                }
              }}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder={f.platePlaceholder}
              className={cn(MEMENTO_CONTROL, 'font-mono uppercase', error ? 'border-danger' : 'border-border-strong')}
              data-starter-plate
            />
          </Labelled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label={f.make} htmlFor={`${id}-make`} optional>
              <input
                id={`${id}-make`}
                value={payload.make}
                maxLength={40}
                onChange={(event) => update({ make: event.target.value })}
                className={cn(MEMENTO_CONTROL, 'border-border-strong')}
              />
            </Labelled>
            <Labelled label={f.model} htmlFor={`${id}-model`} optional>
              <input
                id={`${id}-model`}
                value={payload.model}
                maxLength={40}
                onChange={(event) => update({ model: event.target.value })}
                className={cn(MEMENTO_CONTROL, 'border-border-strong')}
              />
            </Labelled>
          </div>
          <div>
            <button type="button" onClick={onVehicleNext} className={buttonClasses('ink', 'md')} data-starter-next>
              {c.next}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'documente' ? (
        <section className="flex flex-col gap-4" data-starter-step="documente">
          <div>
            <h2 className="text-h3">{c.datesTitle}</h2>
            <p className="mt-1 text-body text-muted">
              <span className="font-mono">{normalisePlate(payload.plate)}</span> · {c.datesLede}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MEMENTO_MAIN_KINDS.map((kind) => (
              <Labelled key={kind} label={`${MEMENTO_KIND_LABELS[kind]} · ${f.expires.toLowerCase()}`} htmlFor={`${id}-${kind}`}>
                <input
                  id={`${id}-${kind}`}
                  type="date"
                  value={payload.dates[kind] ?? ''}
                  onChange={(event) => setDate(kind, event.target.value)}
                  className={cn(MEMENTO_CONTROL, 'border-border-strong')}
                  data-starter-date={kind}
                />
              </Labelled>
            ))}
          </div>
          <details className="rounded-input border border-border px-3.5 py-2.5">
            <summary className="cursor-pointer text-body">{f.more}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {EXTRA_KINDS.filter((kind) => kind !== 'altceva').map((kind) => (
                <Labelled key={kind} label={`${MEMENTO_KIND_LABELS[kind]} · ${f.expires.toLowerCase()}`} htmlFor={`${id}-${kind}`}>
                  <input
                    id={`${id}-${kind}`}
                    type="date"
                    value={payload.dates[kind] ?? ''}
                    onChange={(event) => setDate(kind, event.target.value)}
                    className={cn(MEMENTO_CONTROL, 'border-border-strong')}
                  />
                </Labelled>
              ))}
              <Labelled label={`${MEMENTO_KIND_LABELS.revizie} · ${f.dueKm.toLowerCase()}`} htmlFor={`${id}-km`}>
                <input
                  id={`${id}-km`}
                  inputMode="numeric"
                  value={payload.dueKm}
                  onChange={(event) => update({ dueKm: event.target.value.replace(/[^\d]/g, '') })}
                  className={cn(MEMENTO_CONTROL, 'border-border-strong')}
                />
              </Labelled>
              <Labelled label={f.customName} htmlFor={`${id}-other-name`}>
                <input
                  id={`${id}-other-name`}
                  value={payload.customName}
                  maxLength={60}
                  placeholder={f.customNamePlaceholder}
                  onChange={(event) => update({ customName: event.target.value })}
                  className={cn(MEMENTO_CONTROL, 'border-border-strong')}
                />
              </Labelled>
              <Labelled label={`${MEMENTO_KIND_LABELS.altceva} · ${f.expires.toLowerCase()}`} htmlFor={`${id}-other`}>
                <input
                  id={`${id}-other`}
                  type="date"
                  value={payload.dates.altceva ?? ''}
                  onChange={(event) => setDate('altceva', event.target.value)}
                  className={cn(MEMENTO_CONTROL, 'border-border-strong')}
                />
              </Labelled>
            </div>
          </details>
          <p className="text-small text-muted">{c.rovinieta}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => go('cont')} className={buttonClasses('ink', 'md')} data-starter-next>
              {datesCount(payload) === 0 ? c.skipDates : c.next}
            </button>
            <button type="button" onClick={() => go('vehicul')} className="text-body text-muted underline underline-offset-4">
              {c.back}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'cont' ? (
        <section className="flex flex-col gap-4" data-starter-step="cont">
          <p className="rounded-input border border-border bg-ground-alt px-3.5 py-2.5 text-body" data-starter-summary>
            {c.summary(normalisePlate(payload.plate), datesCount(payload))}
            {Object.entries(payload.dates).length > 0
              ? `: ${Object.entries(payload.dates)
                  .map(([kind, date]) => `${MEMENTO_KIND_LABELS[kind as MementoKind]} ${date.split('-').reverse().join('.')}`)
                  .join(', ')}`
              : ''}
          </p>
          {signedIn ? (
            <div className="flex flex-col gap-3" data-account-step="done">
              <h2 className="text-h3">{c.signedInTitle}</h2>
              <p className="text-body text-muted">{c.signedInBody}</p>
              <div>
                <button type="button" onClick={onSave} disabled={pending} className={buttonClasses('ink', 'md')} data-starter-save>
                  {pending ? c.saving : c.save}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-card border border-border p-5" data-account-step="needed">
              <h2 className="text-h3">{c.accountTitle}</h2>
              <p className="max-w-[54ch] text-body">{c.accountBody}</p>
              <div className="flex flex-wrap gap-3">
                <Link href={withNext(ROUTES.signUpIndividual, returnTo)} className={buttonClasses('ink', 'md')} data-starter-signup>
                  {c.signUp}
                </Link>
                <Link href={withNext(ROUTES.signIn, returnTo)} className={buttonClasses('secondary', 'md')}>
                  {c.signIn}
                </Link>
              </div>
            </div>
          )}
          <FormError>{error ?? undefined}</FormError>
          <div>
            <button type="button" onClick={() => go('documente')} className="text-body text-muted underline underline-offset-4">
              {c.back}
            </button>
          </div>
        </section>
      ) : null}

      <DraftStatus status={draft.status} />
    </div>
  );
}
