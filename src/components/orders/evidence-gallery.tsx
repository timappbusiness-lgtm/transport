import Image from 'next/image';
import { ordersCopy } from '@/content/comenzi';
import { StatusBadge } from '@/components/ui/primitives';
import { CONDITION_CHECKLIST, formatMoment, summariseChecklist } from '@/lib/orders';
import type { EvidenceRow } from '@/lib/orders-source';

const c = ordersCopy.evidence;

/** The kinds in the order somebody reads them, not the order the enum declares. */
const ORDER: readonly string[] = [
  'pickup_photo',
  'condition_report',
  'delivery_photo',
  'recipient_confirmation',
  'transport_document',
  'incident_note',
];

/**
 * Everything captured against the order, grouped by stage.
 *
 * A photograph with no timestamp and no author is not evidence, so each
 * one carries both. Hidden rows stay in the list as a gap with a
 * sentence: a moderation decision that leaves no trace is indis-
 * tinguishable from a photograph that was never taken.
 */
export function EvidenceGallery({
  rows,
  urls,
  children,
}: {
  rows: readonly EvidenceRow[];
  urls: ReadonlyMap<string, string>;
  /** The staff hide control, injected so this stays a server component. */
  children?: (row: EvidenceRow) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <section aria-labelledby="dovezi" className="rounded-card border border-border bg-surface p-5">
        <h2 id="dovezi" className="text-h3">
          {c.title}
        </h2>
        <p className="mt-2 text-body text-muted">{c.empty}</p>
      </section>
    );
  }

  const groups = ORDER.map((kind) => ({
    kind,
    label: c.kinds[kind] ?? kind,
    items: rows.filter((row) => row.kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <section aria-labelledby="dovezi" className="rounded-card border border-border bg-surface p-5">
      <h2 id="dovezi" className="text-h3">
        {c.title}
      </h2>
      <p className="mt-1 max-w-[62ch] text-small text-muted">{c.lede}</p>

      <div className="mt-5 flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.kind}>
            <h3 className="text-body font-medium">{group.label}</h3>

            {group.kind === 'condition_report' || group.kind === 'incident_note' ? (
              <ul className="mt-2 flex flex-col gap-3">
                {group.items.map((row) => (
                  <li key={row.id} className="rounded-input border border-border bg-ground-alt p-3">
                    <p className="text-small text-muted">
                      {c.at} {formatMoment(row.captured_at)} {c.by} {row.author_name}
                      {row.is_hidden ? (
                        <StatusBadge tone="danger" className="ml-2">
                          {c.hidden}
                        </StatusBadge>
                      ) : null}
                    </p>
                    {group.kind === 'condition_report' && !row.is_hidden ? (
                      <ChecklistCard payload={row.payload} note={row.note} />
                    ) : (
                      <p className="mt-1.5 whitespace-pre-line break-words text-body">{row.note}</p>
                    )}
                    {children?.(row)}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {group.items.map((row) => (
                  <li key={row.id} className="min-w-0">
                    <EvidencePhoto row={row} url={row.file_path ? urls.get(row.file_path) : undefined} />
                    {children?.(row)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function EvidencePhoto({ row, url }: { row: EvidenceRow; url: string | undefined }) {
  return (
    <figure className="min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-input border border-border bg-ground-alt">
        {row.is_hidden || url === undefined ? (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-small text-muted">
            {row.is_hidden ? c.hidden : '—'}
          </span>
        ) : (
          <Image
            src={url}
            alt={row.note ?? c.kinds[row.kind] ?? 'Dovadă'}
            fill
            sizes="(max-width: 640px) 45vw, 22vw"
            className="object-cover"
            unoptimized
          />
        )}
      </div>
      <figcaption className="mt-1 text-small leading-tight text-muted [overflow-wrap:anywhere]">
        {formatMoment(row.captured_at)}
        <span className="block">{row.author_name}</span>
        {row.lat !== null ? <span className="block">{c.location}</span> : null}
      </figcaption>
    </figure>
  );
}

function ChecklistCard({
  payload,
  note,
}: {
  payload: Record<string, string>;
  note: string | null;
}) {
  return (
    <div className="mt-2">
      <p className="text-body font-medium">{summariseChecklist(payload)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {CONDITION_CHECKLIST.map((item) => (
          <div key={item.key} className="flex items-baseline justify-between gap-2 text-small">
            <dt className="text-muted">{item.label}</dt>
            <dd className="tabular-nums">{payload[item.key] ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {note !== null ? <p className="mt-2 whitespace-pre-line break-words text-body">{note}</p> : null}
    </div>
  );
}

/**
 * Two rows of photographs beside each other.
 *
 * The comparison is the whole reason the photographs exist: a scratch
 * is only evidence against a picture of the same wing without it. The
 * client's own photographs, taken when they published the request, are
 * the baseline for the pickup set; the pickup set is the baseline for
 * the delivery one.
 */
export function ComparisonView({
  title,
  leftLabel,
  rightLabel,
  left,
  right,
  urls,
  publicUrls,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  /** Paths in the public listing bucket, or evidence rows. */
  left: readonly (EvidenceRow | string)[];
  right: readonly EvidenceRow[];
  urls: ReadonlyMap<string, string>;
  publicUrls: ReadonlyMap<string, string>;
}) {
  if (left.length === 0 || right.length === 0) return null;

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h3 className="text-h3">{title}</h3>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-body font-medium text-muted">{leftLabel}</p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {left.map((item) =>
              typeof item === 'string' ? (
                <li key={item} className="min-w-0">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-input border border-border bg-ground-alt">
                    {publicUrls.get(item) !== undefined ? (
                      <Image
                        src={publicUrls.get(item)!}
                        alt={c.fromClient}
                        fill
                        sizes="(max-width: 1024px) 45vw, 22vw"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-small text-muted">{c.fromClient}</p>
                </li>
              ) : (
                <li key={item.id} className="min-w-0">
                  <EvidencePhoto row={item} url={item.file_path ? urls.get(item.file_path) : undefined} />
                </li>
              ),
            )}
          </ul>
        </div>

        <div>
          <p className="text-body font-medium text-muted">{rightLabel}</p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {right.map((row) => (
              <li key={row.id} className="min-w-0">
                <EvidencePhoto row={row} url={row.file_path ? urls.get(row.file_path) : undefined} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
