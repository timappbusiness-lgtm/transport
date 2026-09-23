import { Stars } from '@/components/ratings/star-input';
import { StatusBadge } from '@/components/ui/primitives';
import { ratingsCopy } from '@/content/evaluari';
import { formatDate } from '@/lib/ratings';
import type { PublicRating } from '@/lib/ratings-source';

const c = ratingsCopy;

/**
 * O evaluare, așa cum o citește cineva din afară.
 *
 * Semnul „după o dispută" stă lângă notă, nu la subsol: o notă mică după
 * o dispută înseamnă altceva decât una fără, iar cine citește trebuie să
 * afle asta în aceeași privire în care vede nota.
 */
export function RatingCard({
  rating,
  children,
}: {
  rating: PublicRating;
  /** Acțiunile care se schimbă de la ecran la ecran: sesizare, răspuns. */
  children?: React.ReactNode;
}) {
  return (
    <article className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Stars score={rating.score} />
        {rating.after_dispute ? (
          <StatusBadge tone="warning">{c.profile.afterDispute}</StatusBadge>
        ) : null}
        <span className="text-small text-muted">
          {rating.rater_name ?? '—'} · {formatDate(rating.created_at)}
          {rating.edited ? ` · ${c.form.edited}` : ''}
        </span>
      </div>

      {rating.comment !== null ? (
        <p className="mt-2 whitespace-pre-line break-words text-body">{rating.comment}</p>
      ) : null}

      <SubScoreRow rating={rating} />

      {rating.reply_body !== null ? (
        <div className="mt-3 border-l-2 border-border-strong pl-3">
          <p className="text-small font-medium text-muted">
            {c.reply.label} · {formatDate(rating.reply_at)}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-body">{rating.reply_body}</p>
        </div>
      ) : null}

      {children}
    </article>
  );
}

/** Sub-scorurile date, numai cele date. Un „—" pentru fiecare gol ar fi zgomot. */
function SubScoreRow({ rating }: { rating: PublicRating }) {
  const given: { label: string; value: number }[] = [];
  const add = (label: string, value: number | null) => {
    if (value !== null) given.push({ label, value });
  };
  add('Punctualitate', rating.punctuality);
  add('Comunicare', rating.communication);
  add('Grija față de vehicul', rating.vehicle_care);
  add('Informații corecte', rating.info_accuracy);
  add('Disponibilitate', rating.handover_availability);

  if (given.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
      {given.map((s) => (
        <li key={s.label}>
          {s.label}: <span className="font-mono tabular-nums">{s.value}/5</span>
        </li>
      ))}
    </ul>
  );
}
