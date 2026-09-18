import { describe, expect, it } from 'vitest';
import { seoCopy } from '@/content/transport-auto';

/**
 * The rule that matters most on a landing page: **the copy states no
 * figure.** Every number on one of these pages is read live from the table
 * that owns it, and a number written into the copy is a number that goes
 * stale the week after somebody changes the thing it describes — on a page
 * built to be found by strangers, which is the worst place for it.
 */

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: string[]) => string;
    out.push(fn(...Array.from({ length: fn.length }, () => '—')));
  } else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const ALL = strings(seoCopy);
const JOINED = ALL.join(' ');

describe('landing page copy rules', () => {
  it('states no price, no count and no distance', () => {
    expect(ALL.filter((s) => /\d[\d.,]*\s*(lei|€|eur|km|firme|zile)/i.test(s))).toEqual([]);
  });

  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('uses no superlatives, which a landing page is the temptation for', () => {
    expect(JOINED).not.toMatch(/cel mai|cea mai|cei mai|cele mai|garant|num[ăa]rul 1|lider/i);
  });

  it('never promises a delivery date from a driving time', () => {
    // The distance block states hours of driving. Somebody reading it as a
    // delivery promise is the single likeliest complaint these pages cause.
    expect(seoCopy.facts.durationNote).toMatch(/nu termen de livrare/i);
  });

  it('says the indicative price is indicative, wherever it appears', () => {
    expect(seoCopy.price.note).toMatch(/orientativ|estimare/i);
    expect(seoCopy.price.note).toMatch(/ofert/i);
  });

  it('says a corridor price is computed on an example route', () => {
    // A corridor has no single distance, and one number pretending
    // otherwise would be wrong for most visitors.
    expect(seoCopy.price.example).toMatch(/referință/i);
  });

  it('offers something in every empty state rather than a dead end', () => {
    expect(seoCopy.requests.emptyAction).toBeTruthy();
    expect(seoCopy.departures.emptyAction).toBeTruthy();
    expect(seoCopy.companies.empty).toMatch(/publică o cerere/i);
  });

  it('writes its diacritics', () => {
    expect(ALL.filter((s) => /\b(judet|judete|masina|transportator verificat[^ăaei])\b/i.test(s)))
      .toEqual([]);
  });

  it('has a label for every kind of related list', () => {
    for (const type of [
      'corridor_international',
      'route_internal',
      'county',
      'vehicle_type',
    ]) {
      expect(seoCopy.related[type]).toBeTruthy();
    }
  });
});
