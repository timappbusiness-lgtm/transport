import { Stars } from '@/components/ratings/star-input';
import { Card } from '@/components/ui/primitives';
import { ratingsCopy } from '@/content/evaluari';
import {
  formatDate,
  formatScore,
  percentLabel,
  publicAverage,
  sampleLabel,
  tooFewRatings,
  type Reputation,
} from '@/lib/ratings';

const c = ratingsCopy.profile;

/**
 * Reputația unei firme, cu „Cum calculăm" sub ea.
 *
 * Fiecare rând care nu are destule date scrie de ce, nu o liniuță. „Prea
 * puține date" spune că numărul va apărea; o liniuță arată ca o eroare.
 * Și fiecare număr are o propoziție în nota de la final, în aceleași
 * cuvinte ca formula din baza de date.
 */
export function ReputationBlock({
  rep,
  minPublic,
}: {
  rep: Reputation;
  minPublic: number;
}) {
  const average = publicAverage(rep, minPublic);

  return (
    <section aria-labelledby="reputatie" className="flex flex-col gap-4">
      <h2 id="reputatie" className="text-h3">
        {c.title}
      </h2>

      <Card className="p-5">
        {rep.ratingCount === 0 ? (
          <p className="text-body text-muted">{c.none}</p>
        ) : average !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-figure tabular-nums text-accent">{average}</span>
            <Stars score={Math.round(rep.ratingAvg ?? 0)} />
            <span className="text-body text-muted">{c.ratingsCount(rep.ratingCount)}</span>
          </div>
        ) : (
          <div>
            <p className="text-body-lg">{c.tooFew}</p>
            <p className="mt-1 text-body text-muted">{c.tooFewHint(rep.ratingCount)}</p>
          </div>
        )}

        {average !== null ? <SubScores rep={rep} /> : null}

        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
          <Figure label={c.completedCarrier} value={String(rep.completedAsCarrier)} />
          {rep.completedAsClient > 0 ? (
            <Figure label={c.completedClient} value={String(rep.completedAsClient)} />
          ) : null}

          <Figure
            label={c.punctuality}
            value={percentLabel(rep.punctualityPct)}
            note={
              rep.punctualityPct === null
                ? c.notEnough
                : sampleLabel(rep.punctualitySample, 'o comandă', 'comenzi', 'comenzi')
            }
          />
          <Figure
            label={c.responseRate}
            value={percentLabel(rep.responsePct)}
            note={
              rep.responsePct === null
                ? c.notEnough
                : sampleLabel(rep.responseSample, 'o cerere', 'cereri', 'cereri')
            }
          />

          <Figure
            label={c.disputes}
            value={c.disputesValue(rep.disputesOpened12m, rep.disputesResolved12m)}
          />
          {rep.verifiedSince !== null ? (
            <Figure label={c.verifiedSince} value={formatDate(rep.verifiedSince)} />
          ) : null}
        </dl>
      </Card>

      <details className="rounded-card border border-border bg-ground-alt p-4">
        <summary className="cursor-pointer text-body font-medium">{c.howTitle}</summary>
        <ul className="mt-3 flex flex-col gap-2 text-body text-muted">
          {c.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function SubScores({ rep }: { rep: Reputation }) {
  const rows: { label: string; value: number | null }[] = [
    { label: 'Punctualitate', value: rep.punctuality },
    { label: 'Comunicare', value: rep.communication },
    { label: 'Grija față de vehicul', value: rep.vehicleCare },
    { label: 'Informații corecte', value: rep.infoAccuracy },
    { label: 'Disponibilitate', value: rep.handover },
  ].filter((r) => r.value !== null);

  if (rows.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-small text-muted">
      {rows.map((r) => (
        <li key={r.label}>
          {r.label}: <span className="font-mono tabular-nums">{formatScore(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-body">
        {value ?? <span className="text-muted">{note ?? '—'}</span>}
        {value !== null && note !== undefined ? (
          <span className="ml-1.5 text-small text-muted">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}

/** Numerele scurte pentru un card de ofertă sau un rând de comparație. */
export function ReputationInline({
  rep,
  minPublic,
}: {
  rep: Pick<
    Reputation,
    'ratingAvg' | 'ratingCount' | 'completedAsCarrier' | 'punctualityPct'
  >;
  minPublic: number;
}) {
  const average = publicAverage(rep, minPublic);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-small text-muted">
      {average !== null ? (
        <span>
          <span className="font-mono tabular-nums text-foreground">{average}</span>{' '}
          {c.ratingsCount(rep.ratingCount)}
        </span>
      ) : tooFewRatings(rep, minPublic) ? (
        <span>{c.tooFew}</span>
      ) : null}

      {rep.completedAsCarrier > 0 ? (
        <span>
          · {rep.completedAsCarrier} {rep.completedAsCarrier === 1 ? 'transport' : 'transporturi'}
        </span>
      ) : null}

      {rep.punctualityPct !== null ? <span>· {rep.punctualityPct}% la timp</span> : null}
    </span>
  );
}
