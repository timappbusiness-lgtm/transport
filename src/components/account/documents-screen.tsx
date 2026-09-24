'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerDocumentAction } from '@/app/cont/fleet-actions';
import {
  classifyDocumentAction,
  declareDocumentAction,
  readDocumentAction,
} from '@/app/cont/documente-actions';
import { NewVehicleForm } from '@/components/account/fleet-forms';
import { DocumentExample } from '@/components/onboarding/document-example';
import { buttonClasses } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { Thumbnail, UploadLine } from '@/components/ui/upload-line';
import { inscriereCopy } from '@/content/inscriere';
import {
  countChecklist,
  isUploaded,
  orderForWork,
  progressLabel,
  requirementAnchor,
  type RequirementState,
} from '@/lib/document-checklist';
import {
  formatDateRo,
  isIsoDate,
  suggestAssignment,
  type DocumentReading,
} from '@/lib/document-reading';
import { MAX_DOCUMENT_BYTES, documentFileProblem, documentStoragePath } from '@/lib/documents';
import { shrinkPhoto } from '@/lib/photo-shrink';
import type { UploadItem } from '@/lib/uploads/queue';
import { SendError, uploadToStorage } from '@/lib/uploads/transport';
import { failureMessage, useUploadQueue, type QueuedFile } from '@/lib/uploads/use-upload-queue';
import { cn } from '@/lib/utils';
import type { Database } from '@/lib/supabase/database.types';

type DocumentKind = Database['public']['Enums']['document_kind'];

const c = inscriereCopy.documents;

/** The document on file for a requirement, while it waits for us or after we sent it back. */
export interface ScreenDocument {
  id: string;
  status: string;
  /** What the model read. */
  validUntil: string | null;
  /** What the carrier confirmed. */
  declared: string | null;
  rejectionReason: string | null;
  extractionError: string | null;
}

export interface ScreenRequirement {
  scope: 'company' | 'vehicle';
  kind: string;
  label: string;
  reason: string;
  isBlocking: boolean;
  state: RequirementState;
  vehicleId: string | null;
  latest: ScreenDocument | null;
}

export interface ScreenVehicle {
  id: string;
  plate: string;
}

const STATE_TONE: Record<RequirementState, 'success' | 'neutral' | 'danger' | 'warning'> = {
  ok: 'success',
  in_review: 'neutral',
  missing: 'warning',
  rejected: 'danger',
  expired: 'danger',
};

/**
 * Every document the firm owes, on one screen, camera first.
 *
 * Each row names a document, shows a drawing of it with the date marked,
 * says in one line why we ask for it, and opens the camera. A photograph
 * appears at once with its progress; the model reads it in the background
 * and offers the date to confirm. Or: many at once from the gallery, where
 * the model says what each one is and the carrier confirms.
 *
 * Every file is kept on the phone until the server has it (`useUploadQueue`)
 * and sent under an id chosen once, so a failed or interrupted upload is
 * retried without a second copy and a reload loses nothing. What is
 * required is the database's (`document_requirements`); this screen only
 * counts it.
 */
export function DocumentsScreen({
  companyId,
  requirements,
  vehicles,
  focusVehicleId,
  kinds,
}: {
  companyId: string;
  requirements: ScreenRequirement[];
  vehicles: ScreenVehicle[];
  focusVehicleId: string | null;
  /** Every kind this firm is asked for, for the gallery's „Ce act este". */
  kinds: { kind: string; label: string; scope: 'company' | 'vehicle' }[];
}) {
  const router = useRouter();
  const [readings, setReadings] = useState<Record<string, DocumentReading | 'reading'>>({});
  const [refused, setRefused] = useState<string | null>(null);

  const queue = useUploadQueue({
    scope: `doc:${companyId}`,
    keepAfterUpload: (item) => item.meta.mode === 'gallery',
    send: async (file, onProgress) => sendDocument(companyId, file, onProgress),
    onUploaded: (item) => {
      if (item.meta.mode !== 'row') return;
      // The row turns „încărcat" now; the reading follows.
      router.refresh();
      setReadings((current) => ({ ...current, [item.id]: 'reading' }));
      void readDocumentAction(item.id)
        .catch(() => ({ status: 'failed', message: null }) as const)
        .then((reading) => {
          setReadings((current) => ({ ...current, [item.id]: reading }));
          router.refresh();
        });
    },
  });

  function pick(files: FileList | null, meta: UploadItem['meta']) {
    const chosen = Array.from(files ?? []);
    const accepted: File[] = [];
    for (const file of chosen) {
      const problem = documentFileProblem(file);
      if (problem !== null) {
        setRefused(problem === 'wrong_type' ? c.wrongType : c.tooLarge);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) {
      setRefused(null);
      queue.add(accepted, meta);
    }
  }

  const shown = focusVehicleId === null ? requirements : requirements.filter((row) => row.vehicleId === focusVehicleId);
  const counts = countChecklist(shown);
  const restored = queue.items.filter((item) => item.restored && item.status !== 'uploaded').length;
  const galleryItems = queue.items.filter((item) => item.meta.mode === 'gallery');
  const groups = groupRows(shown, vehicles, focusVehicleId);

  return (
    <div className="flex flex-col gap-5" data-documents-screen>
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-body font-medium" data-documents-progress>
          {progressLabel(counts)}
        </p>
        <div className="h-2 overflow-hidden rounded-pill bg-ground-alt">
          <div
            className="h-full origin-left rounded-pill bg-accent transition-transform motion-reduce:transition-none"
            style={{ transform: `scaleX(${counts.blockingTotal === 0 ? 1 : counts.blockingDone / counts.blockingTotal})` }}
          />
        </div>
        {counts.blockingMissing === 0 ? <p className="text-small text-muted">{c.allBlocking}</p> : null}
        {restored > 0 ? <p className="text-small text-foreground">{c.waitingFiles(restored)}</p> : null}
      </div>

      <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
        <label className={cn(buttonClasses('secondary', 'md'), 'w-full cursor-pointer sm:w-auto')}>
          {c.gallery}
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="sr-only"
            data-gallery-input
            onChange={(event) => {
              pick(event.target.files, { mode: 'gallery' });
              event.target.value = '';
            }}
          />
        </label>
        <p className="mt-2 text-small text-muted">{c.galleryHint}</p>
        {refused !== null ? <p role="alert" className="mt-2 text-small text-danger">{refused}</p> : null}
        {galleryItems.length > 0 ? (
          <GalleryPanel
            items={galleryItems}
            kinds={kinds}
            vehicles={vehicles}
            preview={queue.previewOf}
            onRetry={queue.retry}
            onDiscard={queue.discard}
            onRegistered={(id) => {
              queue.discard(id);
              router.refresh();
            }}
          />
        ) : null}
      </section>

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3" data-document-group={group.key}>
          <h2 className="text-body font-medium">{group.title}</h2>
          <ul className="flex flex-col gap-3">
            {orderForWork(group.rows).map((requirement) => {
              return (
                <RequirementRow
                  key={`${requirement.vehicleId ?? 'firma'}:${requirement.kind}`}
                  requirement={requirement}
                  uploads={queue.items.filter(
                    (item) =>
                      item.meta.mode === 'row' &&
                      item.meta.kind === requirement.kind &&
                      (item.meta.vehicleId ?? null) === requirement.vehicleId &&
                      !(item.status === 'uploaded' && requirement.latest?.id === item.id),
                  )}
                  reading={requirement.latest ? readings[requirement.latest.id] : undefined}
                  preview={queue.previewOf}
                  onPick={(files) => pick(files, { mode: 'row', kind: requirement.kind, vehicleId: requirement.vehicleId })}
                  onRetry={queue.retry}
                  onDiscard={queue.discard}
                  onConfirmed={() => router.refresh()}
                />
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-small text-muted">{c.optionalNote}</p>

      {focusVehicleId !== null ? (
        <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-3 text-body font-medium">{c.addVehicle}</h2>
          <NewVehicleForm
            onCreated={(vehicle) => {
              // The new vehicle's documents, on the same journey (`pentru`, `next` kept).
              const params = new URLSearchParams(window.location.search);
              params.set('vehicul', vehicle.id);
              router.push(`?${params.toString()}`);
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

/** Upload, and for a row whose document is known, register — both under the id chosen on the device. */
async function sendDocument(
  companyId: string,
  file: QueuedFile,
  onProgress: (fraction: number) => void,
): Promise<Record<string, string>> {
  const original = new File([file.blob], file.name, { type: file.type });
  const prepared = file.type.startsWith('image/') ? await shrinkPhoto(original) : original;
  if (prepared.size > MAX_DOCUMENT_BYTES) throw new SendError('too_large', c.tooLarge);

  const path = documentStoragePath(companyId, file.id, prepared.name);
  await uploadToStorage({ bucket: 'documents', path, file: prepared, onProgress: (f) => onProgress(f * 0.9) });

  const sent = { path, name: prepared.name, mime: prepared.type || 'application/octet-stream', size: String(prepared.size) };
  if (file.meta.mode !== 'row') return sent;

  const registered = await registerDocumentAction({
    documentId: file.id,
    vehicleId: typeof file.meta.vehicleId === 'string' ? file.meta.vehicleId : null,
    kind: String(file.meta.kind) as DocumentKind,
    fileName: prepared.name,
    mime: sent.mime,
    size: prepared.size,
  });
  if (registered.error) throw new SendError('refused', registered.error);
  onProgress(1);
  return sent;
}

function groupRows(rows: ScreenRequirement[], vehicles: ScreenVehicle[], focus: string | null) {
  const groups: { key: string; title: string; rows: ScreenRequirement[] }[] = [];
  const company = rows.filter((row) => row.scope === 'company');
  if (focus === null && company.length > 0) groups.push({ key: 'firma', title: c.companySection, rows: company });
  for (const vehicle of vehicles) {
    if (focus !== null && vehicle.id !== focus) continue;
    const own = rows.filter((row) => row.vehicleId === vehicle.id);
    if (own.length > 0) groups.push({ key: vehicle.id, title: c.vehicleSection(vehicle.plate), rows: own });
  }
  return groups;
}

// ---------------------------------------------------------------------
// One requirement
// ---------------------------------------------------------------------

function RequirementRow({
  requirement,
  uploads,
  reading,
  preview,
  onPick,
  onRetry,
  onDiscard,
  onConfirmed,
}: {
  requirement: ScreenRequirement;
  uploads: UploadItem[];
  reading: DocumentReading | 'reading' | undefined;
  preview: (id: string) => string | null;
  onPick: (files: FileList | null) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onConfirmed: () => void;
}) {
  const { latest } = requirement;
  const needsFile = !isUploaded(requirement.state);
  const waiting = latest !== null && ['uploaded', 'parsing', 'pending'].includes(latest.status) ? latest : null;

  return (
    <li
      id={requirementAnchor(requirement.kind, requirement.vehicleId)}
      className="scroll-mt-24 rounded-card border border-border bg-surface p-4"
      data-requirement={requirement.kind}
      data-vehicle={requirement.vehicleId ?? ''}
      data-state={requirement.state}
    >
      <div className="flex gap-3">
        <div className="flex-none">
          <DocumentExample kind={requirement.kind} label={requirement.label} className="h-14 w-[4.7rem]" />
          <p className="mt-1 text-center text-small text-muted">{c.example}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-body font-medium">{requirement.label}</h3>
            <span className="text-small text-muted">{requirement.isBlocking ? c.blocking : c.optional}</span>
          </div>
          <p className="mt-0.5 text-small text-muted">{requirement.reason}</p>
          <div className="mt-2">
            <StatusBadge tone={STATE_TONE[requirement.state]}>{c.states[requirement.state]}</StatusBadge>
          </div>
          {requirement.state === 'rejected' && latest?.rejectionReason ? (
            <p className="mt-2 text-small text-foreground">{c.rejectedBecause(latest.rejectionReason)}</p>
          ) : null}
        </div>
      </div>

      {uploads.map((item) => (
        <UploadLine key={item.id} className="mt-3" item={item} preview={preview(item.id)} onRetry={onRetry} onDiscard={onDiscard} />
      ))}

      {waiting !== null ? (
        <DateConfirm document={waiting} reading={reading} onConfirmed={onConfirmed} />
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={cn(buttonClasses(needsFile ? 'primary' : 'secondary', 'sm'), 'cursor-pointer')}>
          {needsFile ? c.camera : c.replace}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            data-camera-input
            onChange={(event) => {
              onPick(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <label className="cursor-pointer text-small link-accent">
          {c.orFile}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            data-file-input
            onChange={(event) => {
              onPick(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
      </div>
    </li>
  );
}

/** What the model read, and the carrier's confirmation of the date. */
function DateConfirm({
  document,
  reading,
  onConfirmed,
}: {
  document: ScreenDocument;
  reading: DocumentReading | 'reading' | undefined;
  onConfirmed: () => void;
}) {
  const read = reading !== undefined && reading !== 'reading' && reading.status === 'read' ? reading.validUntil : null;
  const suggested = document.declared ?? read ?? document.validUntil;
  const [value, setValue] = useState(suggested ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [seen, setSeen] = useState(suggested);
  if (seen !== suggested) {
    // The reading arrived after the field was drawn: offer it, unless the
    // carrier already typed something else.
    setSeen(suggested);
    if (value === '' && suggested) setValue(suggested);
  }

  if (document.declared !== null && state !== 'failed') {
    return <p className="mt-3 text-small text-foreground" data-date-confirmed>{c.confirmed(formatDateRo(document.declared))}</p>;
  }

  const line =
    reading === 'reading'
      ? c.reading
      : reading?.status === 'unreadable'
        ? c.unreadable
        : suggested
          ? c.read(formatDateRo(suggested))
          : c.readNothing;

  return (
    <div className="mt-3 rounded-input border border-border p-3" data-date-confirm>
      <p className="text-small" aria-live="polite">
        {line}
      </p>
      {reading !== undefined && reading !== 'reading' && reading.status === 'read' && reading.mismatch ? (
        <p className="mt-1 text-small text-foreground">{c.mismatch}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small">
          {c.dateLabel}
          <input
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
          />
        </label>
        <button
          type="button"
          disabled={!isIsoDate(value) || state === 'saving'}
          className={buttonClasses('secondary', 'sm')}
          onClick={async () => {
            setState('saving');
            try {
              const result = await declareDocumentAction(document.id, value);
              setState(result.ok ? 'saved' : 'failed');
              setMessage(result.ok ? null : c.retry);
              if (result.ok) onConfirmed();
            } catch (error) {
              setState('failed');
              setMessage(failureMessage(error).message);
            }
          }}
        >
          {c.confirmDate}
        </button>
      </div>
      {state === 'saved' ? <p className="mt-1 text-small">{c.confirmed(formatDateRo(value))}</p> : null}
      {state === 'failed' && message ? <p className="mt-1 text-small text-danger">{message}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// The gallery: many files, each recognised, each confirmed
// ---------------------------------------------------------------------

type Suggestion =
  | { status: 'classifying' }
  | { status: 'done'; kind: string | null; vehicleId: string | null; date: string | null; recognised: boolean };

function GalleryPanel({
  items,
  kinds,
  vehicles,
  preview,
  onRetry,
  onDiscard,
  onRegistered,
}: {
  items: UploadItem[];
  kinds: { kind: string; label: string; scope: 'company' | 'vehicle' }[];
  vehicles: ScreenVehicle[];
  preview: (id: string) => string | null;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onRegistered: (id: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const asked = useRef(new Set<string>());

  // Every uploaded gallery file is recognised once — including the ones a
  // reload brought back, which lost the answer with the page.
  useEffect(() => {
    for (const item of items) {
      const path = item.result?.path;
      if (item.status !== 'uploaded' || !path || asked.current.has(item.id)) continue;
      asked.current.add(item.id);
      void Promise.resolve().then(async () => {
        setSuggestions((current) => ({ ...current, [item.id]: { status: 'classifying' } }));
        const reading = await classifyDocumentAction(path).catch(() => ({ status: 'failed', message: null }) as const);
        const guess = suggestAssignment(reading, kinds, vehicles);
        setSuggestions((current) => ({
          ...current,
          [item.id]: {
            status: 'done',
            kind: guess.kind,
            vehicleId: guess.vehicleId,
            date: reading.status === 'read' ? reading.validUntil : null,
            recognised: guess.kind !== null,
          },
        }));
      });
    }
  }, [items, kinds, vehicles]);

  return (
    <div className="mt-4 flex flex-col gap-3" data-gallery-panel>
      <h3 className="text-body font-medium">{c.assignTitle}</h3>
      {items.map((item) =>
        item.status === 'uploaded' ? (
          <GalleryAssign
            key={item.id}
            item={item}
            suggestion={suggestions[item.id]}
            kinds={kinds}
            vehicles={vehicles}
            preview={preview(item.id)}
            onDiscard={onDiscard}
            onRegistered={onRegistered}
          />
        ) : (
          <UploadLine key={item.id} item={item} preview={preview(item.id)} onRetry={onRetry} onDiscard={onDiscard} />
        ),
      )}
    </div>
  );
}

function GalleryAssign({
  item,
  suggestion,
  kinds,
  vehicles,
  preview,
  onDiscard,
  onRegistered,
}: {
  item: UploadItem;
  suggestion: Suggestion | undefined;
  kinds: { kind: string; label: string; scope: 'company' | 'vehicle' }[];
  vehicles: ScreenVehicle[];
  preview: string | null;
  onDiscard: (id: string) => void;
  onRegistered: (id: string) => void;
}) {
  const done = suggestion?.status === 'done' ? suggestion : null;
  const [kind, setKind] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [applied, setApplied] = useState<Suggestion | undefined>(undefined);
  if (done !== null && applied !== suggestion) {
    // The guess arrives after the row is drawn: it fills only what the
    // carrier has not chosen yet.
    setApplied(suggestion);
    if (kind === '' && done.kind) setKind(done.kind);
    if (vehicleId === '' && done.vehicleId) setVehicleId(done.vehicleId);
    if (date === '' && done.date) setDate(done.date);
  }
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const chosen = kinds.find((entry) => entry.kind === kind) ?? null;
  const needsVehicle = chosen?.scope === 'vehicle';
  const ready = chosen !== null && (!needsVehicle || vehicleId !== '') && (date === '' || isIsoDate(date));

  async function confirm() {
    if (chosen === null) return;
    setState('saving');
    setMessage(null);
    try {
      const registered = await registerDocumentAction({
        documentId: item.id,
        vehicleId: needsVehicle ? vehicleId : null,
        kind: chosen.kind as DocumentKind,
        fileName: item.result?.name ?? item.name,
        mime: item.result?.mime ?? item.type,
        size: Number(item.result?.size ?? item.size),
      });
      if (registered.error) {
        setState('failed');
        setMessage(registered.error);
        return;
      }
      // The reading fills our reviewer's form; the date is the carrier's.
      await readDocumentAction(item.id).catch(() => null);
      if (date !== '') await declareDocumentAction(item.id, date).catch(() => null);
      onRegistered(item.id);
    } catch (error) {
      setState('failed');
      setMessage(failureMessage(error).message);
    }
  }

  return (
    <div className="rounded-input border border-border p-3" data-gallery-item data-suggested-kind={done?.kind ?? ''}>
      <div className="flex gap-3">
        <Thumbnail item={item} preview={preview} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-small">{item.name}</p>
          <p className="text-small text-muted">
            {suggestion === undefined || suggestion.status === 'classifying'
              ? c.classifying
              : done?.recognised
                ? c.recognised
                : c.notRecognised}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-small">
          {c.assignKind}
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
          >
            <option value="">{c.chooseKind}</option>
            {kinds.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        {needsVehicle ? (
          <label className="flex flex-col gap-1 text-small">
            {c.assignVehicle}
            <select
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
            >
              <option value="">{c.chooseVehicle}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-small">
          {c.dateLabel}
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!ready || state === 'saving'}
          onClick={confirm}
          className={buttonClasses('primary', 'sm')}
        >
          {c.confirm}
        </button>
        <button
          type="button"
          onClick={() => onDiscard(item.id)}
          className="text-small text-muted underline-offset-4 hover:underline"
        >
          {c.discard}
        </button>
      </div>
      {state === 'failed' && message ? <p className="mt-2 text-small text-danger">{message}</p> : null}
    </div>
  );
}
