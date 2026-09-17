import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { trustCopy, verificationCopy } from '@/content/siguranta';

/**
 * The safety copy is the copy most worth lying in, so it is the copy with
 * the strictest test. Two kinds of rule are enforced here:
 *
 *   1. Words we do not use. "Garantăm" and "100%" are promises no
 *      marketplace can keep, and "toate firmele" is a claim about a set we
 *      do not control.
 *   2. Numbers that must match the platform. The reminder schedule on the
 *      homepage is checked against the migration that seeds it, so the two
 *      cannot drift apart without a failing test.
 */

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') out.push((value as (...a: string[]) => string)('1', '2'));
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const ALL = [...strings(trustCopy), ...strings(verificationCopy)];

describe('words we do not use', () => {
  it('promises no guarantee', () => {
    const offenders = ALL.filter((s) => /\bgarant(ăm|ez|ie|ii|at|ată)\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('claims no percentage of certainty', () => {
    const offenders = ALL.filter((s) => /100\s*%|\bsut[ăa] la sut[ăa]\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('never says anything is completely safe', () => {
    const offenders = ALL.filter((s) => /complet sigur|perfect sigur|risc zero/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('never says a company is "în legalitate"', () => {
    // We know what a document says and when it expires. Whether a company
    // is operating lawfully is not ours to certify.
    const offenders = ALL.filter((s) => /în legalitate/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('never speaks for every company on the platform', () => {
    const offenders = ALL.filter((s) => /\btoate firmele\b|\btoți transportatorii\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('uses no exclamation marks and no superlatives', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
    const offenders = ALL.filter((s) =>
      /\bcel mai (bun|sigur|rapid|ieftin)\b|\bcea mai (bun|sigur|rapid|ieftin)/i.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('writes Romanian with diacritics rather than their ASCII stand-ins', () => {
    const offenders = ALL.filter((s) =>
      /\b(siguranta|verificam|firma verificate|romania|masina)\b/i.test(s),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the six things we say we do', () => {
  it('says six, not five and not seven', () => {
    expect(trustCopy.section.items).toHaveLength(6);
  });

  it('keeps each one to a line and at most two sentences', () => {
    for (const item of trustCopy.section.items) {
      expect(item.title.length).toBeLessThanOrEqual(40);
      const sentences = item.body.split('.').filter((part) => part.trim() !== '');
      expect(sentences.length, item.title).toBeLessThanOrEqual(2);
    }
  });

  it('promises no ratings, because nobody can leave one yet', () => {
    // `ratings` exists and the database refuses a rating before delivery,
    // but no screen lets a client write one. Until one does, the claim is
    // absent rather than softened.
    const titles = trustCopy.section.items.map((i) => i.title).join(' ');
    expect(titles).not.toMatch(/evalu/i);
  });

  it('promises no masking of contact details inside messages', () => {
    // Nothing strips a phone number out of a message body. What is enforced
    // is that contact details sit behind reveal_contact.
    const bodies = trustCopy.section.items.map((i) => i.body).join(' ');
    expect(bodies).not.toMatch(/în mesaje.*(ascuns|mascat)/i);
  });

  it('states the reminder schedule the migration actually seeds', () => {
    const migration = readFileSync(
      'supabase/migrations/20260916120200_documents_compliance.sql',
      'utf8',
    );
    const seeded = /reminder_days integer\[\] not null default '\{([\d,]+)\}'/.exec(migration);
    expect(seeded, 'reminder_days default not found in the migration').not.toBeNull();

    const days = (seeded?.[1] ?? '').split(',');
    const claim = trustCopy.section.items[1]?.body ?? '';
    for (const day of days) {
      // "1" is written out as "o zi" in Romanian, so it is checked as words.
      if (day === '1') expect(claim).toContain('o zi');
      else expect(claim, `reminder at ${day} days`).toContain(day);
    }
  });
});

describe('the example card', () => {
  it('is a made-up company and says so in its name', () => {
    expect(trustCopy.section.example.company).toMatch(/exemplu/i);
  });

  it('carries a word for every status, not only a colour', () => {
    for (const row of trustCopy.section.example.rows) {
      expect(row.state.length).toBeGreaterThan(0);
      expect(['success', 'warning']).toContain(row.tone);
    }
  });
});

describe('the verification page', () => {
  it('walks five steps, from sign-up to a blocked account', () => {
    expect(verificationCopy.steps.items).toHaveLength(5);
  });

  it('says plainly what it cannot check', () => {
    const cannot = verificationCopy.scope.weDont.items.join(' ');
    expect(cannot).toMatch(/asigurător|asiguratorilor|asigurătorilor/i);
    expect(cannot).toMatch(/RAR/);
    expect(cannot).toMatch(/ARR/);
  });

  it('tells the reader the check does not replace their own', () => {
    expect(verificationCopy.scope.caveat).toMatch(/nu înlocuiește/i);
  });

  it('answers three questions always, and a fourth when we can', () => {
    expect(verificationCopy.faq.items).toHaveLength(3);
    expect(verificationCopy.faq.reviewTime.q).toMatch(/\?$/);
  });

  it('does not promise that an order is cancelled when a document lapses', () => {
    const answer = verificationCopy.faq.items[0]?.a ?? '';
    expect(answer).toMatch(/nu se anulează/i);
  });
});
