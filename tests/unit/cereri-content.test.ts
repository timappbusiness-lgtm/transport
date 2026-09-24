import { describe, expect, it } from 'vitest';
import { requestsCopy } from '@/content/cereri';
import type { ListingStatus } from '@/lib/requests';

/**
 * The same guard the other copy files carry: not the wording, which changes
 * freely, but the rules that keep the flow honest.
 *
 * Until Faza 2 the rule here was that nothing may name an offer, because
 * `offers` had a table and no screen. It has both now, and the test that
 * enforced the silence would enforce a lie. What survives is the part that
 * was never about offers: no promised reply time, because nothing measures
 * one, and no invented number.
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

describe('request copy rules', () => {
  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('names offers only where a screen answers for them', () => {
    // Every sentence that says "ofertă" belongs to a request the client
    // owns, and the card that carries them links to /cont/cereri/[id],
    // which is built. The board's own copy still promises nothing: a
    // visitor reading /cereri is not being sold the account.
    // The status labels are exempt: a label for a state is not a promise,
    // and it is what keeps a badge from rendering blank.
    // `visibility` is exempt for the same reason as `mine`: it is read
    // on the publish form and on the owner's own request page, both
    // behind an account. A visitor on /cereri never sees a word of it.
    //
    // `card.offer` — „Trimite ofertă" — is exempt too: the card draws it
    // only for a signed-in carrier, and it opens the offer form on the
    // request, which is built. A visitor never sees it.
    const { offer, ...card } = requestsCopy.card;
    const board = strings({
      ...requestsCopy,
      card,
      mine: {},
      status: {},
      statusNote: {},
      visibility: {},
    }).join(' ');
    expect(board).not.toMatch(/ofert[ăaei]/i);
    expect(offer).toBe('Trimite ofertă');
    expect(strings(requestsCopy.mine).join(' ')).toMatch(/Oferte primite/);
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
    // The contact step opens with it, and the telephone field repeats
    // that every opening of the number is logged.
    expect(requestsCopy.form.stepHeads.contact.why).toMatch(/nu apare pe cerere/i);
    expect(requestsCopy.form.contact.phoneHint).toMatch(/se înregistrează/);
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
