'use client';

import { useEffect, useRef, useState } from 'react';
import { DraftRestored, DraftStatus } from '@/components/continuity/draft-status';
import { useFormDraft } from '@/lib/continuity/use-form-draft';
import { createCompanyAction, lookupCuiAction, type ActionState } from '@/app/cont/actions';
import { FormError, SubmitButton } from '@/components/auth/form';
import { COMPANY_TYPE_LABELS } from '@/content/account';
import { inscriereCopy } from '@/content/inscriere';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { failureKind } from '@/lib/continuity/network';
import { announceSessionExpired } from '@/lib/continuity/session-store';
import {
  anafWarning,
  cuiDigits,
  cuiInputState,
  type AnafCompany,
  type AnafFilledField,
  type LookupResult,
} from '@/lib/company-lookup';
import { cn } from '@/lib/utils';

const EMPTY: ActionState = {};
const TYPES = ['transport', 'expeditie', 'both'] as const;
const c = inscriereCopy.company;

const CONTROL = 'w-full rounded-input border bg-surface px-3.5 py-2.5 text-body placeholder:text-muted/70';

type Lookup =
  | { state: 'idle' }
  | { state: 'looking'; cui: string }
  | { state: 'done'; result: LookupResult };

/** How long the CUI has to stay still before ANAF is asked. */
const SETTLE_MS = 350;

/**
 * The firm, in about two minutes.
 *
 * The CUI fills the rest in: as soon as its control digit agrees, ANAF is
 * asked — no „Caută" button — and the name, county and town arrive
 * marked „Date preluate de la ANAF". Every one of them stays editable;
 * editing one takes its mark away, because it is then the person's.
 * ANAF's answer is kept on the firm anyway (`keep_details`), which is
 * what staff compare against.
 *
 * Nothing about a failed lookup is silent: a typo, a CUI ANAF does not
 * know and ANAF being down each say what happened and leave the fields
 * open to be filled in by hand. An inactive or struck-off firm is said
 * plainly — the database is what refuses to verify it.
 */
export function CompanyCreateForm({
  defaultType,
  defaults,
  next,
  pentru,
}: {
  defaultType: string;
  defaults: { phone: string; email: string };
  next: string | null;
  pentru: string | null;
}) {
  const [create, createAction] = useKeptActionState(createCompanyAction, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  const [cui, setCui] = useState(create.values?.cui ?? '');
  const [fields, setFields] = useState<Record<AnafFilledField, string>>({
    legalName: create.values?.legalName ?? '',
    county: create.values?.county ?? '',
    city: create.values?.city ?? '',
  });
  const [fromAnaf, setFromAnaf] = useState<ReadonlySet<AnafFilledField>>(new Set());
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [attempt, setAttempt] = useState(0);

  // The firm's details are kept on every change, on the account too: a
  // carrier who stops here to find the CUI, or finishes on the phone,
  // does not type them again. Cleared by the redirect once the firm
  // exists (`?gata=firma`).
  const draft = useFormDraft(formRef, {
    form: 'firma',
    signedIn: true,
    exclude: ['next', 'pentru'],
    onRestore: (values) => {
      const read = (name: string) => (typeof values[name] === 'string' ? (values[name] as string) : '');
      setCui(read('cui'));
      setFields({ legalName: read('legalName'), county: read('county'), city: read('city') });
    },
  });

  const inputState = cuiInputState(cui);
  const digits = cuiDigits(cui);
  const looked = lookup.state === 'done' ? lookup.result.cui : lookup.state === 'looking' ? lookup.cui : null;

  // Ask ANAF once the CUI is complete and has stayed still for a moment.
  useEffect(() => {
    if (inputState !== 'ready' || (looked === digits && attempt === 0)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLookup({ state: 'looking', cui: digits });
      setAttempt(0);
      try {
        const result = await lookupCuiAction(digits);
        if (cancelled) return;
        setLookup({ state: 'done', result });
        if (result.status === 'found') {
          const updates = anafUpdates(result.company);
          setFields((current) => ({ ...current, ...updates }));
          setFromAnaf(new Set(Object.keys(updates) as AnafFilledField[]));
          // The draft listens for typing; a fill is not typing, so say it.
          requestAnimationFrame(() => formRef.current?.dispatchEvent(new Event('input', { bubbles: true })));
        }
      } catch (error) {
        if (cancelled) return;
        // A dropped connection or an expired session: say ANAF could not
        // be asked, and keep the form usable by hand.
        if (failureKind(error) === 'session') announceSessionExpired();
        setLookup({ state: 'done', result: { status: 'unavailable', cui: digits } });
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // The lookup depends on the CUI and the retries alone: `looked` is
    // read to skip a CUI already asked about, not to ask again when it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, inputState, attempt]);

  function edit(name: AnafFilledField, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    if (fromAnaf.has(name)) {
      const rest = new Set(fromAnaf);
      rest.delete(name);
      setFromAnaf(rest);
    }
  }

  const result = lookup.state === 'done' && lookup.result.cui === digits ? lookup.result : null;
  const found = result?.status === 'found' ? result.company : null;
  const warning = found ? anafWarning(found) : null;

  return (
    <KeepingForm ref={formRef} action={createAction} className="flex flex-col gap-5" noValidate>
      {draft.restored !== null ? (
        <DraftRestored savedAt={draft.restored.savedAt} onStartOver={draft.startOver} />
      ) : null}
      <FormError>{create.error}</FormError>
      {next !== null ? <input type="hidden" name="next" value={next} /> : null}
      {pentru !== null ? <input type="hidden" name="pentru" value={pentru} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="firma-cui" className="text-body font-medium">
          {c.cuiLabel}
        </label>
        <input
          id="firma-cui"
          name="cui"
          inputMode="numeric"
          autoComplete="off"
          placeholder="RO14399840"
          value={cui}
          onChange={(event) => setCui(event.target.value)}
          aria-invalid={create.fieldErrors?.cui || inputState === 'typo' ? true : undefined}
          aria-describedby="firma-cui-status"
          className={cn(
            CONTROL,
            'font-mono',
            create.fieldErrors?.cui || inputState === 'typo' ? 'border-danger' : 'border-border-strong',
          )}
        />
        <div id="firma-cui-status" aria-live="polite" data-anaf-state={lookupState(inputState, lookup, result)}>
          <LookupLine inputState={inputState} looking={lookup.state === 'looking'} result={result} />
          {result?.status === 'unavailable' ? (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-1 text-small link-accent"
            >
              {c.retry}
            </button>
          ) : null}
        </div>
        {create.fieldErrors?.cui ? <p className="text-small text-danger">{create.fieldErrors.cui}</p> : null}
      </div>

      {warning !== null ? (
        <p role="alert" data-anaf-warning={warning} className="rounded-input border border-warning/45 bg-warning/10 px-3.5 py-2.5 text-body">
          {warning === 'struck_off' ? c.struckOff : c.inactive}
        </p>
      ) : null}

      {found ? <AnafSummary company={found} /> : null}

      <AnafField
        name="legalName"
        label={c.legalName}
        value={fields.legalName}
        fromAnaf={fromAnaf.has('legalName')}
        error={create.fieldErrors?.legalName}
        onChange={(value) => edit('legalName', value)}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body font-medium">{c.type}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2.5 rounded-input border border-border-strong px-3.5 py-3 text-body has-[:checked]:border-accent has-[:checked]:bg-accent-subtle"
            >
              <input
                type="radio"
                name="companyType"
                value={type}
                defaultChecked={(create.values?.companyType ?? defaultType) === type}
                className="size-4 accent-foreground"
              />
              {COMPANY_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
        {create.fieldErrors?.companyType ? (
          <p className="text-small text-danger">{create.fieldErrors.companyType}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <AnafField
          name="county"
          label={c.county}
          value={fields.county}
          fromAnaf={fromAnaf.has('county')}
          optional
          onChange={(value) => edit('county', value)}
        />
        <AnafField
          name="city"
          label={c.city}
          value={fields.city}
          fromAnaf={fromAnaf.has('city')}
          optional
          onChange={(value) => edit('city', value)}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body font-medium">{c.contact}</legend>
        <p className="-mt-1 text-small text-muted">{c.contactHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlainField name="contactPhone" label={c.phone} type="tel" defaultValue={create.values?.contactPhone ?? defaults.phone} />
          <PlainField name="contactEmail" label={c.email} type="email" defaultValue={create.values?.contactEmail ?? defaults.email} />
        </div>
      </fieldset>

      <SubmitButton>{c.save}</SubmitButton>
      <DraftStatus status={draft.status} />
    </KeepingForm>
  );
}

/** The fields a found firm fills, and nothing ANAF left empty. */
function anafUpdates(company: AnafCompany): Partial<Record<AnafFilledField, string>> {
  const updates: Partial<Record<AnafFilledField, string>> = {};
  if (company.legalName !== '') updates.legalName = company.legalName;
  if (company.county) updates.county = company.county;
  if (company.city) updates.city = company.city;
  return updates;
}

/** For tests and for the page's own styling hooks: which state the lookup is in. */
function lookupState(input: string, lookup: Lookup, result: LookupResult | null): string {
  if (lookup.state === 'looking') return 'looking';
  if (result !== null) return result.status;
  return input;
}

function LookupLine({
  inputState,
  looking,
  result,
}: {
  inputState: string;
  looking: boolean;
  result: LookupResult | null;
}) {
  if (looking) return <p className="text-small text-muted">{c.looking}</p>;
  if (inputState === 'typo') return <p className="text-small text-danger">{c.typo}</p>;
  if (result === null) return <p className="text-small text-muted">{c.cuiHint}</p>;
  switch (result.status) {
    case 'found':
      return <p className="text-small text-foreground">{c.found(result.company.legalName)}</p>;
    case 'not_found':
      return <p className="text-small text-foreground">{c.notFound}</p>;
    case 'invalid':
      return <p className="text-small text-danger">{c.typo}</p>;
    default:
      return <p className="text-small text-foreground">{c.unavailable}</p>;
  }
}

/** What ANAF said that is not a form field: kept for the record, shown for trust. */
function AnafSummary({ company }: { company: AnafCompany }) {
  return (
    <div data-anaf-summary className="rounded-card border border-border bg-ground-alt px-4 py-3 text-small">
      <p className="font-medium text-foreground">{c.fromAnaf}</p>
      <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-muted sm:grid-cols-[auto_1fr]">
        {company.regCom ? (
          <>
            <dt>{c.regCom}</dt>
            <dd className="text-foreground">{company.regCom}</dd>
          </>
        ) : null}
        <dt>{c.vat}</dt>
        <dd className="text-foreground">{company.vatPayer ? c.vatPayer : c.vatNonPayer}</dd>
        {company.address ? (
          <>
            <dt>{c.seat}</dt>
            <dd className="text-foreground">{company.address}</dd>
          </>
        ) : null}
      </dl>
      <p className="mt-2 text-muted">{c.fromAnafNote}</p>
    </div>
  );
}

function AnafField({
  name,
  label,
  value,
  fromAnaf,
  optional = false,
  error,
  onChange,
}: {
  name: AnafFilledField;
  label: string;
  value: string;
  fromAnaf: boolean;
  optional?: boolean;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = `firma-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-body font-medium">
        {label}
        {optional ? <span className="text-small font-normal text-muted">{c.optional}</span> : null}
        {fromAnaf ? (
          <span data-from-anaf className="rounded-pill bg-accent-subtle px-2 py-0.5 text-small font-medium text-accent">
            {c.fromAnaf}
          </span>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, error ? 'border-danger' : 'border-border-strong')}
      />
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </div>
  );
}

function PlainField({
  name,
  label,
  type,
  defaultValue,
}: {
  name: string;
  label: string;
  type: 'tel' | 'email';
  defaultValue: string;
}) {
  const id = `firma-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium">
        {label} <span className="text-small font-normal text-muted">{c.optional}</span>
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={type}
        defaultValue={defaultValue}
        className={cn(CONTROL, 'border-border-strong')}
      />
    </div>
  );
}
