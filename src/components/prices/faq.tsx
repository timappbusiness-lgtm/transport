import { pricesCopy } from '@/content/preturi';

const c = pricesCopy.faq;

/**
 * Three questions, answered in plain sentences and without a figure between
 * them — so the block stays true whether or not the table above it is
 * published, and whatever the team sets the rates to.
 */
export function PriceFaq() {
  return (
    <section aria-labelledby="intrebari" className="mt-14 border-t border-border pt-10">
      <h2 id="intrebari" className="text-lg">
        {c.title}
      </h2>
      <dl className="mt-6 grid gap-6 md:grid-cols-3">
        {c.items.map((item) => (
          <div key={item.q}>
            <dt className="font-medium">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
