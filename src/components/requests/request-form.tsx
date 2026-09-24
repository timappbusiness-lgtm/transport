'use client';

import { successCopy } from '@/content/success';
import { SuccessMoment } from '@/components/ui/success-moment';
import { CategoryTile } from '@/components/ui/category-art';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { attachListingPhotoAction, previewRequestPhotosAction } from '@/app/cerere/import-actions';
import { clearDraftAction, saveDraftAction } from '@/app/draft-actions';
import { DraftRestored, DraftStatus } from '@/components/continuity/draft-status';
import { KeepingForm } from '@/components/ui/keeping-form';
import { Bone } from '@/components/ui/skeleton';
import { safeNextPath, withNext } from '@/lib/auth/next-path';
import type { DraftEnvelope } from '@/lib/continuity/drafts';
import { STEP_PARAM, parseStep, withStep } from '@/lib/continuity/steps';
import type { DraftSaveStatus } from '@/lib/continuity/use-draft';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { PhotoPanel, PhotoPanelLocked, type ChosenPhoto } from '@/components/requests/photo-panel';
import { MAX_PHOTOS } from '@/lib/photo-upload';
import { DURATION_OPTIONS, STEP_FIELDS, estimatedKm, validateDraft } from '@/lib/request-form';
import { publishRequestAction, type PublishRequestState } from '@/app/cerere/actions';
import { FormError } from '@/components/auth/form';
import { PushPermissionCard } from '@/components/push/permission-card';
import { AutoChip, ImportDisclaimer, ImportPanel } from '@/components/requests/import-panel';
import { CarrierCount } from '@/components/requests/carrier-count';
import { CarrierPreview } from '@/components/requests/carrier-preview';
import { ChoiceCard } from '@/components/requests/publish/choice-card';
import { RoutePreview } from '@/components/requests/publish/route-preview';
import { PublishStepper } from '@/components/requests/publish/stepper';
import { buttonClasses } from '@/components/ui/button';
import { CountryTag } from '@/components/ui/primitives';
import { LocalityPicker, type LocalityValue } from '@/components/ui/locality-picker';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { browserStorage, createDraftStore, type StoredRequest } from '@/lib/draft-store';
import { importCopy } from '@/content/import-anunt';
import { applyExtraction, type ImportedField } from '@/lib/listing-import';
import { CARGO_CATEGORY_LABELS, formatWindow } from '@/lib/departures';
import {
  OFFERED_CATEGORIES,
  categoryMeta,
  needsDescription,
  suggestsClosedTransport,
  weightHintKg,
} from '@/lib/vehicle-categories';
import {
  MAX_DAMAGE_NOTES,
  MAX_DESCRIPTION,
  REQUEST_STEPS,
  REQUEST_STEP_DEFINITION,
  emptyDraft,
  reachableRequestStep,
  serialiseDraft,
  stepHasInput,
  validateStep,
  type RequestDraft,
  type RequestField,
  type RequestStep,
} from '@/lib/request-form';
import { formatKm } from '@/lib/requests';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';
import { cn } from '@/lib/utils';
import type { FieldErrors } from '@/lib/validation/auth';

const EMPTY: PublishRequestState = {};

/**
 * Every text control on the form. A strong edge (3:1, WCAG 1.4.11), the
 * danger edge when the field has a message, and the same hover and focus
 * as every other control on the site.
 */
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body aria-[invalid=true]:border-danger';

type Point = { lat: number; lng: number };

/** How long typing has to pause before the account copy is written. */
const SERVER_SAVE_DELAY_MS = 1500;

/**
 * The account's copy of the request draft: written when the typing
 * pauses, removed when the request is sent or the person starts over.
 * Signed out, it does nothing — the browser copy is the whole draft then.
 */
function accountDraftWriter(signedIn: boolean, onSaved: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(stored: StoredRequest, step: string | null) {
      if (!signedIn) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        saveDraftAction('cerere', '', step, stored)
          .then((ok) => {
            if (ok) onSaved();
          })
          .catch(() => {
            /* the browser copy is there; the next change tries again */
          });
      }, SERVER_SAVE_DELAY_MS);
    },
    clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (signedIn) clearDraftAction('cerere', '').catch(() => {});
    },
  };
}

function subscribeNothing() {
  return () => {};
}

export interface RequestFormProps {
  /** The prefilled draft, from the price calculator or empty. */
  initial: RequestDraft;
  /** True when the link carried anything, so a stored draft does not win. */
  hasPrefill: boolean;
  /** Today as `YYYY-MM-DD`, from the server: React refuses a clock in render. */
  today: string;
  signedIn: boolean;
  /** The account's copy of the draft, for a signed-in person; null otherwise. */
  serverDraft: DraftEnvelope<StoredRequest> | null;
  /**
   * The telephone on the account, which every sign-up now asks for: the
   * contact step starts with it rather than asking for it again.
   */
  accountPhone?: string | null;
}

/** „roțile se învârt, direcția merge, are cheile, fără avarii, 1.200 kg" */
function conditionLine(draft: RequestDraft): string {
  const words = requestsCopy.form.vehicle.conditionShort;
  const parts: string[] = [
    words.wheelsTurn[draft.wheelsTurn ? 0 : 1],
    words.steeringWorks[draft.steeringWorks ? 0 : 1],
    words.hasKeys[draft.hasKeys ? 0 : 1],
    words.isDamaged[draft.isDamaged ? 0 : 1],
  ];
  if (draft.weightKg.trim() !== '') parts.push(`${draft.weightKg.trim()} kg`);
  return parts.join(', ');
}

/**
 * What a step does not need to publish, one click away.
 *
 * It opens by itself when it holds something — a value, an error, a link
 * that carried one — and then stays open: a box that shut itself while
 * somebody cleared the field inside it would be a box that moves under
 * the cursor.
 */
function Optional({
  name,
  summary,
  when,
  children,
}: {
  name: string;
  summary: string;
  when: boolean;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(when);
  if (when && !opened) setOpened(true);
  return (
    <details open={opened} data-optional={name} className="rounded-card border border-border bg-background p-4">
      <summary className="cursor-pointer text-body font-medium">{summary}</summary>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}

/**
 * A field's label, the control, its hint and — once it has one — the
 * sentence that says what to change. The message is a calm line in ink
 * with a danger mark beside it, not a red wall, and it is tied to the
 * control by `aria-describedby`.
 */
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
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body font-medium">
        {label}
        {auto ? <AutoChip /> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-small text-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldMessage id={`${htmlFor}-error`}>{error}</FieldMessage> : null}
    </div>
  );
}

function FieldMessage({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} data-field-error aria-live="polite" className="flex items-start gap-2 text-small text-foreground">
      <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-danger" />
      <span>{children}</span>
    </p>
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
    <label className="flex items-center gap-2.5 text-body">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-foreground"
      />
      {label}
    </label>
  );
}

/** A group inside a step: a small heading and what belongs under it. */
function Group({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 id={id} className="font-mono text-label uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Publishing a request, in four named steps: Traseu, Vehicul, Serviciu,
 * Contact.
 *
 * Open to a visitor with no account: the account is asked for at the last
 * step and not before, because a sign-up wall in front of an empty form is
 * how a marketplace never gets its first request. What is typed is kept in
 * `sessionStorage`, so the trip through sign-up brings it back.
 *
 * A field says what is wrong when somebody leaves it, not all at once at
 * the end. Every rule is `validateDraft`, unchanged; every one of them
 * has a twin in `create_cargo_request`, and when the two could disagree
 * the database wins and its sentence is shown as it is.
 */
export function RequestForm({ initial, hasPrefill, today, signedIn, serverDraft, accountPhone = null }: RequestFormProps) {
  const [state, action, pending] = useKeptActionState(publishRequestAction, EMPTY);
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle');
  // The draft lives outside React — in localStorage, and on the account
  // once there is one: it has to survive a refresh, a closed tab and the
  // trip through sign-up. See src/lib/draft-store.ts.
  const [{ store, accountCopy }] = useState(() => {
    const copy = accountDraftWriter(signedIn, () => setSaveStatus('saved-account'));
    return {
      accountCopy: copy,
      store: createDraftStore({
        initial,
        ignoreStored: hasPrefill,
        storage: browserStorage('local'),
        legacy: browserStorage('session'),
        server: serverDraft,
        onPersist: (stored, slug) => {
          setSaveStatus('saved');
          copy.schedule(stored, slug);
        },
      }),
    };
  });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const photoPaths = useSyncExternalStore(store.subscribe, store.getPhotos, store.getServerPhotos);
  // False on the server and in the hydration render, true after: the
  // browser's copy of the draft is only readable from then on.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);

  // The step is in the address — `?pas=vehicul` — so a refresh, the back
  // button, a shared link and a return from sign-in all land on it. The
  // address is not trusted: a step whose earlier steps are not complete is
  // shown as the first one that is not.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = parseStep(searchParams.get(STEP_PARAM), REQUEST_STEP_DEFINITION) ?? 'ruta';
  // Checked on arrival — the first render with the browser's draft, and
  // every time the address names a different step (a link, back, forward)
  // — and not again while the person types: emptying a field in the
  // summary on the last step is an edit, not a reason to be thrown back
  // to step one.
  const [errors, setErrors] = useState<FieldErrors<RequestField>>({});
  /** The fields somebody has left at least once: those may say what is wrong. */
  const [touched, setTouched] = useState<Set<RequestField>>(new Set());
  /** A block of the summary opened for editing in place, on the last step. */
  const [editing, setEditing] = useState<RequestStep | null>(null);
  const [stuck, setStuck] = useState(0);
  const [arrival, setArrival] = useState<{ requested: RequestStep; step: RequestStep } | null>(null);
  if (hydrated && arrival?.requested !== requested) {
    const reachable = reachableRequestStep(draft, requested, today);
    setArrival({ requested, step: reachable });
    // Sent back to a step the person had filled in: it says, at once,
    // what is missing there. Set here, with the step, rather than in an
    // effect afterwards — the address is corrected in that effect, the
    // correction is a new render, and a message scheduled for later was
    // cancelled by it before it could appear.
    if (reachable !== requested && stepHasInput(draft, reachable)) {
      const found = validateStep(draft, reachable, today);
      const fields = Object.keys(found) as RequestField[];
      setErrors(found);
      setTouched(new Set(fields));
      setStuck(fields.length);
    }
  }
  const step: RequestStep =
    hydrated && arrival?.requested === requested ? arrival.step : requested;
  // Which fields a listing filled, so each one can say so. Cleared per
  // field the moment somebody edits it: a chip on a value they typed
  // themselves is a lie about where it came from.
  const [auto, setAuto] = useState<Set<ImportedField>>(new Set());
  // Where the two places are, when they were picked from the list. For
  // the drawing and the distance only; never sent.
  const [points, setPoints] = useState<{ from: Point | null; to: Point | null }>({
    from: null,
    to: null,
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // The person's own photographs, already in our bucket under their own
  // folder. The paths are kept with the draft, so a refresh does not
  // throw away an upload; the form submits them and the action re-checks
  // that each one is theirs before it reaches the database. The previews
  // are this page's own: a `blob:` for a photo added here, a signed link
  // for one a draft brought back.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [attachPhoto, setAttachPhoto] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [restoredDismissed, setRestoredDismissed] = useState(false);
  const id = useId();
  const c = requestsCopy.form;
  const photos: ChosenPhoto[] = photoPaths.map((path) => ({
    path,
    preview: previews[path] ?? '',
    fromImport: path === photoPath,
  }));
  const restored = hydrated && !restoredDismissed ? store.getRestored() : null;

  // Published, or written down as a draft the database will not put on the
  // board yet. Either way it is somewhere safer than a browser tab now.
  useEffect(() => {
    if (state.requestId === undefined) return;
    accountCopy.clear();
    store.clear();
  }, [state.requestId, store, accountCopy]);

  // The address asked for a step the draft cannot reach yet: it is
  // corrected in place — no new history entry — to the step shown.
  useEffect(() => {
    if (!hydrated) return;
    store.setStep(REQUEST_STEP_DEFINITION.slugs[step]);
    if (step === requested) return;
    window.history.replaceState(null, '', `${pathname}${withStep(window.location.search, step, REQUEST_STEP_DEFINITION)}`);
  }, [hydrated, step, requested, pathname, store]);

  // Typed on this device before signing in — or newer here than on the
  // account: from now on it follows the account to the other device.
  useEffect(() => {
    if (!hydrated || !signedIn) return;
    const found = store.getRestored();
    if (found === null || (serverDraft !== null && found.savedAt <= serverDraft.savedAt)) return;
    accountCopy.schedule(found.payload, found.step);
  }, [hydrated, signedIn, store, serverDraft, accountCopy]);

  // The account's telephone, once, when the draft has none: everybody
  // signing up gives one now, and asking for it twice is the one thing
  // this form must not do.
  useEffect(() => {
    if (!hydrated || !signedIn || accountPhone === null || accountPhone.trim() === '') return;
    const current = store.getSnapshot();
    if (current.contactPhone.trim() !== '') return;
    store.set({ ...current, contactPhone: accountPhone });
  }, [hydrated, signedIn, accountPhone, store]);

  // A link from the price calculator seeds the draft once. From then on
  // the draft is the truth, so the choices come off the address: a
  // refresh, or the way back from sign-in, must not seed it again over
  // what the person changed since.
  useEffect(() => {
    if (!hydrated || !hasPrefill) return;
    store.set(store.getSnapshot());
    const kept = new URLSearchParams();
    const current = new URLSearchParams(window.location.search).get(STEP_PARAM);
    if (current !== null) kept.set(STEP_PARAM, current);
    const query = kept.toString();
    window.history.replaceState(null, '', `${pathname}${query === '' ? '' : `?${query}`}`);
  }, [hydrated, hasPrefill, pathname, store]);

  // Photos a draft brought back have no preview on this page yet.
  const missingPreviews = photoPaths.filter((path) => previews[path] === undefined).join('|');
  useEffect(() => {
    if (!signedIn || missingPreviews === '') return;
    let cancelled = false;
    previewRequestPhotosAction(missingPreviews.split('|'))
      .then((found) => {
        if (!cancelled) setPreviews((current) => ({ ...found, ...current }));
      })
      .catch(() => {
        /* the photos are still attached; only the thumbnail is missing */
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, missingPreviews]);

  // Read from the store each time, not from this render: an upload of
  // four photos adds them one by one, and each has to see the last.
  function addPhoto(photo: ChosenPhoto) {
    if (photo.preview !== '') setPreviews((current) => ({ ...current, [photo.path]: photo.preview }));
    const current = store.getPhotos();
    if (current.length < MAX_PHOTOS && !current.includes(photo.path)) {
      store.setPhotos([...current, photo.path]);
    }
  }

  function removePhoto(photo: ChosenPhoto) {
    store.setPhotos(store.getPhotos().filter((path) => path !== photo.path));
  }

  function startOver() {
    store.reset(emptyDraft());
    accountCopy.clear();
    setRestoredDismissed(true);
    setSaveStatus('idle');
    setErrors({});
    setTouched(new Set());
    setStuck(0);
    goTo('ruta');
  }
  // The server refused a field: go to the step that shows it, rather than
  // leaving a message on a screen nobody is looking at.
  const serverErrors = state.fieldErrors;
  useEffect(() => {
    if (serverErrors === undefined) return;
    const fields = Object.keys(serverErrors) as RequestField[];
    const first = REQUEST_STEPS.find((s) => STEP_FIELDS[s].some((f) => fields.includes(f)));
    if (first !== undefined && first !== 'contact') {
      // Deferred a frame: this answers a server response, and the step
      // it moves to is state the response itself does not carry.
      const frame = requestAnimationFrame(() => {
        window.history.pushState(null, '', `${pathname}${withStep(window.location.search, first, REQUEST_STEP_DEFINITION)}`);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [serverErrors, pathname]);

  function set<K extends RequestField>(field: K, value: RequestDraft[K]): void {
    setMany({ [field]: value } as Partial<RequestDraft>, [field]);
  }

  /**
   * Several fields in one write.
   *
   * `set` spreads the `draft` captured by this render, so calling it
   * twice in one handler makes the second overwrite the first — the city
   * disappeared the moment the locality picker started setting the city
   * and the country together, and the form refused to leave step one
   * with „Scrie orașul de plecare" over a field somebody had just
   * filled. Anything that changes more than one field goes through here.
   *
   * A field that is already showing a message is checked again as it is
   * typed into, so the message goes away the moment it is right instead
   * of staying until the next blur.
   */
  function setMany(fields: Partial<RequestDraft>, changed: readonly RequestField[]): void {
    const next = { ...draft, ...fields };
    store.set(next);
    setAuto((current) => {
      if (!changed.some((field) => current.has(field as ImportedField))) return current;
      const copy = new Set(current);
      for (const field of changed) copy.delete(field as ImportedField);
      return copy;
    });
    if (changed.some((field) => errors[field] !== undefined)) {
      const all = validateDraft(next, today);
      setErrors((current) => {
        const copy = { ...current };
        for (const field of changed) {
          if (all[field] === undefined) delete copy[field];
          else copy[field] = all[field];
        }
        return copy;
      });
    }
  }

  /** Leaving a field: from now on it may say what is wrong with it. */
  function left(...fields: RequestField[]): void {
    const all = validateDraft(draft, today);
    setTouched((current) => new Set([...current, ...fields]));
    setErrors((current) => {
      const copy = { ...current };
      for (const field of fields) {
        if (all[field] === undefined) delete copy[field];
        else copy[field] = all[field];
      }
      return copy;
    });
  }

  /** Blur, but only when focus leaves the whole group — a country select and its city are one field. */
  function onLeaveGroup(...fields: RequestField[]) {
    return (event: React.FocusEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      left(...fields);
    };
  }

  /** What a control needs to be tied to its message and to report leaving. */
  function fieldProps(field: RequestField, controlId: string, hint = false) {
    const error = fieldError(field);
    const describedBy = [hint ? `${controlId}-hint` : null, error ? `${controlId}-error` : null]
      .filter(Boolean)
      .join(' ');
    return {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy === '' ? undefined : describedBy,
      onBlur: () => left(field),
    } as const;
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

  /**
   * The imported photo joins the six, rather than sitting beside them.
   *
   * It used to be a hidden field of its own, which meant a request could
   * carry the photo somebody else took and none of the ones its owner
   * did. Now it is one of the list — labelled „din anunț" so nobody
   * mistakes it for their own — and removable like the rest.
   */
  function onAttachChange(checked: boolean): void {
    setAttachPhoto(checked);

    if (!checked) {
      setPhotoNote(null);
      if (photoPath !== null) {
        store.setPhotos(store.getPhotos().filter((path) => path !== photoPath));
      }
      return;
    }
    if (photoUrl === null || photoPath !== null) return;

    void attachListingPhotoAction(photoUrl).then((result) => {
      if (result.ok && result.path !== undefined) {
        const path = result.path;
        setPhotoPath(path);
        setPhotoNote(importCopy.attach.attached);
        const current = store.getPhotos();
        if (current.length < MAX_PHOTOS && !current.includes(path)) {
          setPreviews((all) => ({ ...all, [path]: photoUrl }));
          store.setPhotos([...current, path]);
        }
        return;
      }
      // The request is worth more than the photo, so a failure here
      // unticks the box and says so rather than blocking publication.
      setAttachPhoto(false);
      setPhotoNote(importCopy.attach.failed);
    });
  }

  /**
   * A new history entry per step, so the browser's back and forward move
   * between steps. The draft is outside React and the step is in the
   * address, so nothing typed is lost either way.
   */
  function goTo(next: RequestStep): void {
    setErrors({});
    setStuck(0);
    setEditing(null);
    if (next !== step) {
      window.history.pushState(null, '', `${pathname}${withStep(window.location.search, next, REQUEST_STEP_DEFINITION)}`);
    }
    // Back to the top of the step, where its heading says what it asks —
    // a jump, not a glide. The glide moved „Continuă" under the thumb for
    // half a second: a second tap in that time landed on the form beside
    // it and did nothing, on the one screen where a tap that does nothing
    // reads as „the site is broken". Only when the top is above the
    // screen: a step change that is already in view does not move.
    const top = formRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) formRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  /**
   * The checks for a step, run together. The first field with something
   * to change takes the focus, and one line beside the buttons says how
   * many things are left — no list of red at the bottom of the form.
   */
  function check(which: RequestStep): boolean {
    const found = validateStep(draft, which, today);
    const fields = Object.keys(found) as RequestField[];
    if (fields.length === 0) return true;
    setErrors((current) => ({ ...current, ...found }));
    setTouched((current) => new Set([...current, ...fields]));
    setStuck(fields.length);
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    });
    return false;
  }

  function onNext(): void {
    if (!check(step)) return;
    const next = REQUEST_STEPS[REQUEST_STEPS.indexOf(step) + 1];
    if (next) goTo(next);
  }

  function onBack(): void {
    const previous = REQUEST_STEPS[REQUEST_STEPS.indexOf(step) - 1];
    if (previous) goTo(previous);
  }

  function onPlace(which: 'from' | 'to', picked: LocalityValue): void {
    setMany(
      which === 'from'
        ? { fromCity: picked.city, fromCountry: picked.country }
        : { toCity: picked.city, toCountry: picked.country },
      which === 'from' ? ['fromCity', 'fromCountry'] : ['toCity', 'toCountry'],
    );
    setPoints((current) => ({ ...current, [which]: picked.point ?? null }));
  }

  if (state.requestId !== undefined) {
    return <Result state={state} draft={draft} />;
  }

  function fieldError(field: RequestField): string | undefined {
    return (touched.has(field) ? errors[field] : undefined) ?? errors[field] ?? state.fieldErrors?.[field];
  }

  const index = REQUEST_STEPS.indexOf(step);
  const isLast = index === REQUEST_STEPS.length - 1;
  const km = estimatedKm(points.from, points.to);
  const head = c.stepHeads[step];

  // ---------------------------------------------------------------- steps

  function routeFields() {
    return (
      <div className="flex flex-col gap-6">
        <Group title={c.route.places}>
          <div className="grid gap-4 md:grid-cols-2">
            {(['from', 'to'] as const).map((which) => {
              const cityField = which === 'from' ? 'fromCity' : 'toCity';
              const countryField = which === 'from' ? 'fromCountry' : 'toCountry';
              const controlId = `${id}-${which}`;
              return (
                <div key={which} onBlur={onLeaveGroup(cityField, countryField)}>
                  <Labelled
                    label={which === 'from' ? c.route.fromCity : c.route.toCity}
                    htmlFor={controlId}
                    hint={which === 'from' ? c.route.cityHint : undefined}
                    error={fieldError(cityField) ?? fieldError(countryField)}
                  >
                    <div className="flex gap-2">
                      <select
                        aria-label={which === 'from' ? c.route.fromCountry : c.route.toCountry}
                        value={draft[countryField]}
                        onChange={(event) => set(countryField, event.target.value)}
                        className={cn(CONTROL, 'w-24 flex-none')}
                      >
                        {COUNTRY_OPTIONS.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.code}
                          </option>
                        ))}
                      </select>
                      <div className="min-w-0 flex-1">
                        <LocalityPicker
                          id={controlId}
                          value={{ city: draft[cityField], country: draft[countryField] }}
                          onChange={(picked) => onPlace(which, picked)}
                          near={which === 'to' ? points.from : null}
                          placeholder={which === 'from' ? 'München' : 'Cluj-Napoca'}
                          invalid={fieldError(cityField) !== undefined}
                          describedBy={
                            [which === 'from' ? `${controlId}-hint` : null, fieldError(cityField) ? `${controlId}-error` : null]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                        />
                      </div>
                    </div>
                  </Labelled>
                </div>
              );
            })}
          </div>

          <RoutePreview
            fromCity={draft.fromCity}
            fromCountry={draft.fromCountry}
            toCity={draft.toCity}
            toCountry={draft.toCountry}
            km={km}
          />
        </Group>

        <Group title={c.route.dates}>
          <div className="grid gap-4 md:grid-cols-2">
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
                {...fieldProps('loadingFrom', `${id}-from-date`)}
              />
            </Labelled>
          </div>
          <Optional
            name="interval"
            summary={c.route.windowToggle}
            when={draft.loadingTo !== '' || fieldError('loadingTo') !== undefined}
          >
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
                {...fieldProps('loadingTo', `${id}-to-date`, true)}
              />
            </Labelled>
          </Optional>
        </Group>
      </div>
    );
  }

  function vehicleFields(inline = false) {
    const legendId = `${id}-category-legend`;
    return (
      <div className="flex flex-col gap-6">
        {inline ? null : (
          <>
            <ImportPanel onExtracted={onExtracted} onImageFound={onImageFound} signedIn={signedIn} />
            {auto.size > 0 ? <ImportDisclaimer /> : null}
          </>
        )}

        <Group title={c.vehicle.category} id={legendId}>
          <p className="-mt-1 text-small text-muted">
            {c.vehicle.categoryHint}
            {auto.has('category') ? <AutoChip /> : null}
          </p>
          {/* Ten cards, not a dropdown: the drawing finds „the caravan"
              before the word does, and the weight under it is the first
              thing a carrier will ask. Native radios underneath. */}
          <div
            role="radiogroup"
            aria-labelledby={legendId}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
          >
            {OFFERED_CATEGORIES.map((category) => (
              <ChoiceCard
                key={category}
                name={`${id}-category`}
                value={category}
                checked={draft.category === category}
                onChange={(value) => set('category', value as RequestDraft['category'])}
                title={CARGO_CATEGORY_LABELS[category]}
                description={categoryMeta(category)?.weightHint}
                layout="stack"
                className="p-3"
                art={<CategoryTile category={category} size="card" />}
              />
            ))}
          </div>
          {fieldError('category') ? (
            <FieldMessage id={`${id}-category-error`}>{fieldError('category')}</FieldMessage>
          ) : null}

          {/* A suggestion, not a rule. The request goes out either way;
              what changes is that carriers with a closed platform are
              ranked first, and that the person is told the option
              exists before they find out from an offer. */}
          {suggestsClosedTransport(draft.category) ? (
            <p className="rounded-card border border-border bg-ground-alt px-4 py-3 text-small text-muted">
              {c.vehicle.closedSuggestion}
            </p>
          ) : null}

          {/* „Altceva" is the one category nothing can be deduced from,
              so it asks. The same rule is a trigger in Postgres: this is
              the courtesy, that is the boundary. */}
          {needsDescription(draft.category) ? (
            <Labelled
              label={c.vehicle.otherDescription}
              htmlFor={`${id}-other`}
              hint={c.vehicle.otherDescriptionHint}
              error={fieldError('description')}
            >
              <textarea
                id={`${id}-other`}
                rows={3}
                value={draft.description}
                onChange={(event) => set('description', event.target.value)}
                placeholder={c.vehicle.otherDescriptionPlaceholder}
                className={CONTROL}
                {...fieldProps('description', `${id}-other`, true)}
              />
            </Labelled>
          ) : null}
        </Group>

        <Group title={c.vehicle.details}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label={c.vehicle.make} htmlFor={`${id}-make`} error={fieldError('make')} auto={auto.has('make')}>
              <input
                id={`${id}-make`}
                value={draft.make}
                onChange={(event) => set('make', event.target.value)}
                placeholder={c.vehicle.makePlaceholder}
                className={CONTROL}
                {...fieldProps('make', `${id}-make`)}
              />
            </Labelled>
            <Labelled label={c.vehicle.model} htmlFor={`${id}-model`} error={fieldError('model')} auto={auto.has('model')}>
              <input
                id={`${id}-model`}
                value={draft.model}
                onChange={(event) => set('model', event.target.value)}
                placeholder={c.vehicle.modelPlaceholder}
                className={CONTROL}
                {...fieldProps('model', `${id}-model`)}
              />
            </Labelled>
            <Labelled label={c.vehicle.year} htmlFor={`${id}-year`} error={fieldError('year')} auto={auto.has('year')}>
              <input
                id={`${id}-year`}
                inputMode="numeric"
                value={draft.year}
                onChange={(event) => set('year', event.target.value)}
                placeholder="2018"
                className={CONTROL}
                {...fieldProps('year', `${id}-year`)}
              />
            </Labelled>
          </div>
        </Group>

        <Group title={c.vehicle.conditionTitle}>
          <p className="-mt-1 max-w-[60ch] text-small text-muted">{c.condition.lede}</p>
          <div role="radiogroup" aria-label={c.vehicle.conditionTitle} className="grid gap-2.5 sm:grid-cols-2">
            <ChoiceCard
              name={`${id}-running`}
              value="yes"
              checked={draft.isRunning}
              onChange={() => set('isRunning', true)}
              title={c.condition.isRunning}
              description={c.vehicle.running.yesNote}
            />
            <ChoiceCard
              name={`${id}-running`}
              value="no"
              checked={!draft.isRunning}
              onChange={() => set('isRunning', false)}
              title={c.vehicle.running.no}
              description={c.vehicle.running.noNote}
            />
          </div>

          {/* Derived in the database from the three answers and never
              entered, so this only reports what they already say. */}
          {!draft.isRunning || !draft.wheelsTurn || !draft.steeringWorks ? (
            <p className="text-small text-muted">{c.condition.winch}</p>
          ) : null}

          {/* What is not needed to publish, one click away: the answers
              already given are written on the summary line, and the box
              opens by itself when one of them is not the usual one. */}
          <Optional
            name="masina"
            summary={c.vehicle.moreSummary(conditionLine(draft))}
            when={
              draft.weightKg !== '' ||
              !draft.wheelsTurn ||
              !draft.steeringWorks ||
              !draft.hasKeys ||
              draft.isDamaged ||
              auto.has('weightKg') ||
              fieldError('weightKg') !== undefined ||
              fieldError('damageNotes') !== undefined
            }
          >
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-1 text-body font-medium">{c.vehicle.more}</legend>
              <Check label={c.condition.wheelsTurn} checked={draft.wheelsTurn} onChange={(value) => set('wheelsTurn', value)} />
              <Check
                label={c.condition.steeringWorks}
                checked={draft.steeringWorks}
                onChange={(value) => set('steeringWorks', value)}
              />
              <Check label={c.condition.hasKeys} checked={draft.hasKeys} onChange={(value) => set('hasKeys', value)} />
              <Check label={c.condition.isDamaged} checked={draft.isDamaged} onChange={(value) => set('isDamaged', value)} />
            </fieldset>

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
                  {...fieldProps('damageNotes', `${id}-damage`, true)}
                />
              </Labelled>
            ) : null}

            <Labelled
              label={c.vehicle.weight}
              htmlFor={`${id}-weight`}
              /* The hint follows the category: „de obicei între 120 și
                 350 kg" is worth more under Motocicletă than one
                 sentence that has to be true of a motorbike and a
                 minibus at once. */
              hint={`${c.vehicle.weightHint} ${categoryMeta(draft.category)?.weightHint ?? ''}`.trim()}
              error={fieldError('weightKg')}
              auto={auto.has('weightKg')}
            >
              <input
                id={`${id}-weight`}
                inputMode="numeric"
                value={draft.weightKg}
                /* A placeholder, never a value: a number nobody typed is
                   a number nobody checks, and the carrier loads the axle
                   against it. */
                placeholder={String(weightHintKg(draft.category) ?? '')}
                onChange={(event) => set('weightKg', event.target.value)}
                className={CONTROL}
                {...fieldProps('weightKg', `${id}-weight`, true)}
              />
            </Labelled>
          </Optional>
        </Group>

        <Group title={c.vehicle.photosTitle}>
          {/* The client's own photographs. Before this, the only picture a
              request could carry was whatever the import found in the
              source listing — so the one case where a photograph decides
              the price, a damaged car somebody is selling privately, was
              the case that could not have one. */}
          {signedIn ? (
            <PhotoPanel photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
          ) : (
            <PhotoPanelLocked />
          )}

          {photoUrl !== null && signedIn ? (
            <div className="flex flex-col gap-1.5 rounded-card border border-border bg-ground-alt p-4">
              <Check label={importCopy.attach.label} checked={attachPhoto} onChange={onAttachChange} />
              <p className="pl-7 text-small text-muted">{importCopy.attach.hint}</p>
              {photoNote !== null ? (
                <p role="status" className="pl-7 text-small text-muted">
                  {photoNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </Group>
      </div>
    );
  }

  function serviceFields() {
    const sc = c.service;
    return (
      <div className="flex flex-col gap-6">
        <Group title={sc.label}>
          {/* Two cards side by side, so the difference is read across
              them: what each means, then what it does to the price. */}
          <div role="radiogroup" aria-label={sc.label} className="grid gap-3 sm:grid-cols-2">
            {(['pe_sens', 'expres'] as const).map((value) => {
              const card = value === 'pe_sens' ? sc.standard : sc.expres;
              return (
                <ChoiceCard
                  key={value}
                  name={`${id}-service`}
                  value={value}
                  checked={draft.serviceType === value}
                  onChange={() => set('serviceType', value)}
                  title={card.title}
                  description={card.means}
                  aside={
                    <span className="font-medium text-foreground">
                      {sc.pricePrefix} {card.price}
                    </span>
                  }
                  className="p-5"
                />
              );
            })}
          </div>
        </Group>

        {/* How long it stays up. Fourteen days used to be a number in a
            database trigger: twelve wasted days for a car collected on
            Saturday, and far too short for a caravan moving in spring.
            We write before it expires, not after. */}
        <Group title={c.duration.label}>
          <Labelled label={c.duration.label} htmlFor={`${id}-duration`} hint={c.duration.hint} error={fieldError('durationDays')}>
            <select
              id={`${id}-duration`}
              value={draft.durationDays}
              onChange={(event) => set('durationDays', event.target.value)}
              className={cn(CONTROL, 'sm:max-w-xs')}
              {...fieldProps('durationDays', `${id}-duration`, true)}
            >
              {DURATION_OPTIONS.map((days) => (
                <option key={days} value={String(days)}>
                  {c.duration.option(days)}
                </option>
              ))}
            </select>
          </Labelled>
        </Group>

        {/* Unde apare cererea. Implicit pe bursă, pentru că acolo
            ajungi la cei mai mulți; cine vrea altfel alege anume.
            „Privată" nu este o bifă de confort — schimbă cine poate
            vedea rândul, în RLS. */}
        <Group title={requestsCopy.visibility.label}>
          <div role="radiogroup" aria-label={requestsCopy.visibility.label} className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              name={`${id}-visibility`}
              value="public"
              checked={!draft.isPrivate}
              onChange={() => set('isPrivate', false)}
              title={requestsCopy.visibility.public}
              description={requestsCopy.visibility.publicHint}
            />
            <ChoiceCard
              name={`${id}-visibility`}
              value="private"
              checked={draft.isPrivate}
              onChange={() => set('isPrivate', true)}
              title={requestsCopy.visibility.private}
              description={requestsCopy.visibility.privateHint}
            />
          </div>
        </Group>
      </div>
    );
  }

  function contactFields() {
    const descriptionField = (
      <Labelled
        label={c.contact.description}
        htmlFor={`${id}-description`}
        hint={c.contact.descriptionHint}
        error={needsDescription(draft.category) ? undefined : fieldError('description')}
      >
        <textarea
          id={`${id}-description`}
          rows={3}
          maxLength={MAX_DESCRIPTION}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
          className={CONTROL}
          {...fieldProps('description', `${id}-description`, true)}
        />
      </Labelled>
    );
    const descriptionOpen =
      (draft.description !== '' && !needsDescription(draft.category)) ||
      (!needsDescription(draft.category) && fieldError('description') !== undefined);

    return (
      <div className="flex flex-col gap-6">
        {signedIn ? (
          <>
            <Labelled
              label={c.contact.phone}
              htmlFor={`${id}-phone`}
              hint={
                accountPhone !== null && draft.contactPhone === accountPhone
                  ? c.contact.phoneFromAccount
                  : c.contact.phoneHint
              }
              error={fieldError('contactPhone')}
            >
              <input
                id={`${id}-phone`}
                type="tel"
                value={draft.contactPhone}
                onChange={(event) => set('contactPhone', event.target.value)}
                autoComplete="tel"
                placeholder="+40722000111"
                className={cn(CONTROL, 'sm:max-w-[20rem]')}
                {...fieldProps('contactPhone', `${id}-phone`, true)}
              />
            </Labelled>

            {/* The name and the e-mail are the account's unless somebody
                else hands the car over: the database falls back to the
                account's own when these are empty. */}
            <Optional
              name="contact"
              summary={c.contact.more}
              when={
                draft.contactName !== '' ||
                draft.contactEmail !== '' ||
                descriptionOpen ||
                fieldError('contactName') !== undefined ||
                fieldError('contactEmail') !== undefined
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Labelled label={c.contact.name} htmlFor={`${id}-name`} hint={c.contact.nameHint} error={fieldError('contactName')}>
                  <input
                    id={`${id}-name`}
                    value={draft.contactName}
                    onChange={(event) => set('contactName', event.target.value)}
                    autoComplete="name"
                    className={CONTROL}
                    {...fieldProps('contactName', `${id}-name`, true)}
                  />
                </Labelled>
                <Labelled label={c.contact.email} htmlFor={`${id}-email`} error={fieldError('contactEmail')}>
                  <input
                    id={`${id}-email`}
                    type="email"
                    value={draft.contactEmail}
                    onChange={(event) => set('contactEmail', event.target.value)}
                    autoComplete="email"
                    className={CONTROL}
                    {...fieldProps('contactEmail', `${id}-email`)}
                  />
                </Labelled>
              </div>
              {needsDescription(draft.category) ? null : descriptionField}
            </Optional>
          </>
        ) : (
          <>
            {/* Nobody types a name, a number and an address here and then
                again on the account form a click later: they are asked
                once, there, and the request takes them from the account. */}
            <p data-contact-from-account className="max-w-[60ch] text-body text-muted">
              {c.contact.fromAccount}
            </p>
            {needsDescription(draft.category) ? null : (
              <Optional name="contact" summary={c.contact.moreSignedOut} when={descriptionOpen}>
                {descriptionField}
              </Optional>
            )}
          </>
        )}

        {/* Last step, on purpose: by here the route and the dates are
            settled, so the number answers the question somebody is
            actually asking before they commit — "is anybody going to
            see this". */}
        <CarrierPreview draft={draft} signedIn={signedIn} />

        <Summary
          draft={draft}
          km={km}
          photos={photos.length}
          editing={editing}
          onEdit={(block) => setEditing(block)}
          onDone={(block) => {
            if (check(block)) setEditing(null);
          }}
          render={(block) =>
            block === 'ruta' ? routeFields() : block === 'vehicul' ? vehicleFields(true) : serviceFields()
          }
        />
      </div>
    );
  }

  // ----------------------------------------------------------------- form

  // Where sign-in and sign-up come back to: this page, on this step. The
  // calculator's choices are already in the draft by now, off the address.
  const query = searchParams.toString();
  const returnTo = safeNextPath(`${pathname}${query === '' ? '' : `?${query}`}`, ROUTES.newRequest);
  // Before the browser's copy of the draft is read, a step past the first
  // would be drawn empty and then filled a moment later — or drawn at all
  // when the draft cannot reach it. A placeholder holds its place instead.
  const waiting = !hydrated && requested !== 'ruta' && serverDraft === null;

  return (
    <KeepingForm ref={formRef} action={action} className="flex scroll-mt-28 flex-col gap-7" noValidate>
      <input type="hidden" name="draft" value={serialiseDraft(draft)} />
      {/* The photos travel with the form from wherever the person is.
          They used to be drawn inside the photo panel, which exists only
          on the vehicle step — so on the last step, where the form is
          sent, there were none, and every photo added was dropped. */}
      <PhotoPaths photos={photos} />

      <PublishStepper current={step} onSelect={goTo} />

      {restored !== null ? (
        <DraftRestored savedAt={restored.savedAt} onStartOver={startOver} />
      ) : null}

      <header data-step-head={step}>
        <h2 className="text-h2">{head.title}</h2>
        <p className="mt-2 max-w-[60ch] text-body text-muted">{head.why}</p>
      </header>

      {waiting ? (
        <div data-step-waiting className="flex flex-col gap-4">
          <p className="sr-only">{c.restoring}</p>
          <Bone className="h-11 w-full" />
          <Bone className="h-11 w-full" />
          <Bone className="h-24 w-full" />
        </div>
      ) : (
        <>
          {step === 'ruta' ? routeFields() : null}
          {step === 'vehicul' ? vehicleFields() : null}
          {step === 'serviciu' ? serviceFields() : null}
          {step === 'contact' ? contactFields() : null}
        </>
      )}

      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.needsAccount || (isLast && !signedIn) ? <AccountPanel returnTo={returnTo} /> : null}
      {isLast && signedIn && !state.needsAccount ? <AccountDone /> : null}

      {/* The two buttons are always in reach: on a phone they ride along
          the bottom of the screen, on a wide one they sit under the step. */}
      <div
        data-action-bar
        className="sticky bottom-0 z-20 -mx-5 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:backdrop-blur-none"
      >
        {stuck > 0 ? (
          <p aria-live="polite" className="w-full text-small text-foreground">
            {c.fixBefore(stuck)}
          </p>
        ) : null}
        {index > 0 ? (
          <button type="button" onClick={onBack} className={cn(buttonClasses('secondary', 'md'), 'flex-none')}>
            {c.back}
          </button>
        ) : null}

        {isLast ? (
          signedIn ? (
            <button type="submit" disabled={pending} className={cn(buttonClasses('primary', 'md'), 'flex-1 sm:flex-none')}>
              {pending ? c.submitting : c.submit}
            </button>
          ) : null
        ) : (
          <button type="button" onClick={onNext} className={cn(buttonClasses('primary', 'md'), 'flex-1 sm:flex-none')}>
            {c.next}
          </button>
        )}

        <span className="hidden text-small text-muted sm:inline">{c.stepOf(index + 1, REQUEST_STEPS.length)}</span>
        <span className="ml-auto">
          <DraftStatus status={saveStatus} />
        </span>
      </div>
    </KeepingForm>
  );
}

/** The chosen photos, as the hidden fields the publish action reads. */
export function PhotoPaths({ photos }: { photos: readonly ChosenPhoto[] }) {
  return (
    <>
      {photos.map((photo) => (
        <input key={photo.path} type="hidden" name="photo_paths" value={photo.path} />
      ))}
    </>
  );
}

/**
 * Everything above, on the last step, each block editable where it is.
 *
 * „Modifică" opens the block's own fields inside it — the same fields,
 * with the same checks — and „Gata" runs those checks and closes it. The
 * person never leaves the step they are about to finish.
 */
function Summary({
  draft,
  km,
  photos,
  editing,
  onEdit,
  onDone,
  render,
}: {
  draft: RequestDraft;
  km: number | null;
  photos: number;
  editing: RequestStep | null;
  onEdit: (block: RequestStep) => void;
  onDone: (block: RequestStep) => void;
  render: (block: 'ruta' | 'vehicul' | 'serviciu') => React.ReactNode;
}) {
  const c = requestsCopy.form;
  const s = c.summary;
  const window = formatWindow(draft.loadingFrom, draft.loadingTo === '' ? null : draft.loadingTo);
  const vehicle = [draft.make, draft.model, draft.year].filter((part) => part.trim() !== '').join(' ');

  const blocks: { key: 'ruta' | 'vehicul' | 'serviciu'; title: string; body: React.ReactNode }[] = [
    {
      key: 'ruta',
      title: s.route,
      body: (
        <>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold">
            {draft.fromCity || '—'} <CountryTag cc={draft.fromCountry} />
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            {draft.toCity || '—'} <CountryTag cc={draft.toCountry} />
          </span>
          <span className="mt-1 block text-small text-muted">
            {s.from} {window}
            {draft.loadingTo === '' ? `, ${s.noEnd}` : ''}
            {km !== null ? ` · ${formatKm(km)}` : ''}
          </span>
        </>
      ),
    },
    {
      key: 'vehicul',
      title: s.vehicle,
      body: (
        <span className="flex items-center gap-3">
          <CategoryTile category={draft.category} size="sm" />
          <span className="min-w-0">
            <span className="block text-body font-semibold">
              {CARGO_CATEGORY_LABELS[draft.category]}
              {vehicle !== '' ? ` · ${vehicle}` : ''}
            </span>
            <span className="block text-small text-muted">
              {draft.isRunning ? s.running : s.notRunning}
              {draft.isDamaged ? `, ${s.damaged}` : ''}
              {photos > 0 ? ` · ${s.photos(photos)}` : ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'serviciu',
      title: s.service,
      body: (
        <>
          <span className="block text-body font-semibold">
            {draft.serviceType === 'expres' ? c.service.expres.title : c.service.standard.title}
          </span>
          <span className="block text-small text-muted">
            {c.duration.option(Number(draft.durationDays))} · {draft.isPrivate ? s.privateLabel : s.publicLabel}
          </span>
        </>
      ),
    },
  ];

  return (
    <section data-summary className="rounded-card border border-border bg-background p-4 sm:p-5">
      <h3 className="text-h3">{s.title}</h3>
      <p className="mt-1 text-small text-muted">{s.lede}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {blocks.map((block) => {
          const open = editing === block.key;
          return (
            <li
              key={block.key}
              data-summary-block={block.key}
              className="rounded-input border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">{block.title}</p>
                  {open ? null : <div className="mt-1.5">{block.body}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => (open ? onDone(block.key) : onEdit(block.key))}
                  aria-expanded={open}
                  className={cn(buttonClasses(open ? 'primary' : 'secondary', 'sm'), 'flex-none')}
                >
                  {open ? s.done : s.edit}
                  <span className="sr-only"> {block.title}</span>
                </button>
              </div>
              {open ? <div className="mt-4">{render(block.key)}</div> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AccountPanel({ returnTo }: { returnTo: string }) {
  const c = requestsCopy.form.account;
  return (
    <section data-account-step="needed" className="rounded-card border border-accent-border bg-accent-subtle p-5">
      <h2 className="text-h3">{c.title}</h2>
      <p className="mt-2 max-w-[54ch] text-body text-foreground">{c.body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={withNext(ROUTES.signUpIndividual, returnTo)} className={buttonClasses('primary', 'md')}>
          {c.signUp}
        </Link>
        <Link href={withNext(ROUTES.signIn, returnTo)} className={buttonClasses('secondary', 'md')}>
          {c.signIn}
        </Link>
      </div>
    </section>
  );
}

/**
 * The account step, done. Somebody who came back from signing in or
 * signing up lands on this step with this line where the account panel
 * was, rather than wondering whether it worked.
 */
function AccountDone() {
  const c = requestsCopy.form.account;
  return (
    <p
      data-account-step="done"
      className="flex items-start gap-2.5 rounded-input border border-accent-border bg-accent-subtle px-3.5 py-2.5 text-body text-foreground"
    >
      <span className="font-mono text-label uppercase tracking-[0.12em] text-accent">{c.doneLabel}</span>
      <span>{c.done}</span>
    </p>
  );
}

/**
 * What happened. Two outcomes, and the second is the interesting one: the
 * request is written down but not on the board, and the database has said
 * in Romanian what is left to do.
 *
 * The published one is the first of the four moments worth marking: the
 * calm confirmation, the request as the board will show it — the drawing,
 * the route — and the next two things to do.
 */
function Result({ state, draft }: { state: PublishRequestState; draft: RequestDraft }) {
  const c = requestsCopy.form.saved;
  const published = state.status === 'active';
  return (
    <section data-publish-result={published ? 'published' : 'draft'} className="flex flex-col gap-6">
      {published ? (
        <SuccessMoment title={successCopy.published.title} body={successCopy.published.body}>
          <div className="mt-2 flex items-center gap-3 rounded-input border border-border bg-surface p-3">
            <CategoryTile category={draft.category} size="sm" />
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold">
              {draft.fromCity} <CountryTag cc={draft.fromCountry} />
              <span aria-hidden="true" className="text-muted">
                →
              </span>
              {draft.toCity} <CountryTag cc={draft.toCountry} />
            </p>
          </div>
          <CarrierCount count={state.matchingCarriers ?? null} className="mt-3 max-w-[54ch]" />
        </SuccessMoment>
      ) : (
        <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-h3">{c.title}</h2>
          <p className="mt-2 max-w-[54ch] text-body">{state.publishError}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
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
