import { describe, expect, it } from 'vitest';
import { requestsCopy } from '@/content/cereri';
import type { ListingStatus } from '@/lib/requests';

/**
 * The same guard the other copy files carry: not the wording, which changes
 * freely, but the rules that keep the flow honest.
 *
 * The one that matters most here: nothing may promise an offer. `offers`
 * has a table, RLS and an RPC, and no screen — so a carrier who sees a
 * request today telephones. A form that said "primești oferte în câteva
 * ore" would be selling a feature nobody can use.
 */

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    // Every callable in this file takes numbers; ones and threes are enough
    // to see both sides of a Romanian plural.
    const fn = value as (...args: number[]) => string;
    const args = Array.from({ length: fn.length }, () => 1);
    out.push(fn(...args), fn(...args.map(() => 3)));
  } else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const ALL = strings(requestsCopy);
const JOINED = ALL.join(' ');

/**
 * The status labels are exempt from the "no offer" rule below. A label for
 * a state nothing can reach is not a promise — it is what keeps a badge
 * from rendering blank the day the state becomes reachable.
 */
const PROSE = strings({ ...requestsCopy, status: {}, statusNote: {} }).join(' ');

describe('request copy rules', () => {
  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('promises no offer, because no screen makes one', () => {
    expect(PROSE).not.toMatch(/ofert[ăaei]/i);
  });

  it('promises no reply time, because nothing measures one', () => {
    expect(JOINED).not.toMatch(/în (câteva|maxim|mai puțin de)\s+\w*\s*(minute|ore|zile)/i);
  });

  it('writes no price, no percentage and no plan limit', () => {
    // Limits come from `plans` and prices from `price_rates`. A number here
    // is one nobody approved and nobody can change without a deploy.
    expect(ALL.filter((s) => /\d[\d.,]*\s*(lei\b|€|eur\b|%)/i.test(s))).toEqual([]);
    expect(JOINED).not.toMatch(/\b\d+\s*(cereri|anunțuri)\s*active/i);
  });

  it('never says verification can be bought', () => {
    expect(JOINED).not.toMatch(/insignă|badge/i);
    expect(JOINED).not.toMatch(/cea mai mare|garant/i);
  });

  it('keeps the regulatory and trade terms in Romanian', () => {
    expect(requestsCopy.form.condition.winch).toMatch(/troliu/);
  });

  it('writes its diacritics', () => {
    // A stripped form of a word the copy uses a lot: the quickest way to
    // catch a paste from somewhere that lost them.
    const stripped = ALL.filter((s) => /\b(cerere gratuita|transportator verificat[^ăaei]|masina)\b/i.test(s));
    expect(stripped).toEqual([]);
  });

  it('says plainly that the telephone number is not on the advert', () => {
    expect(requestsCopy.form.contact.lede).toMatch(/nu apare pe anunț/i);
  });

  it('says the estimate step is optional and the carrier decides', () => {
    expect(requestsCopy.detail.contactHidden).toMatch(/transportator/i);
  });

  it('has a label for every listing status, including the retired two', () => {
    // A blank badge on somebody's dashboard costs more trust than a label
    // for a status nothing can reach yet.
    const statuses: ListingStatus[] = [
      'draft',
      'active',
      'offers_received',
      'carrier_selected',
      'in_progress',
      'delivered',
      'cancelled',
      'expired',
      'suspended',
      'disputed',
      'assigned',
      'completed',
    ];
    for (const status of statuses) {
      expect(requestsCopy.status[status]).toBeTruthy();
    }
  });
});
