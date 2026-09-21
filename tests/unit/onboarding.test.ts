import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALERT_DAYS,
  CLAIM_DAYS,
  PURGE_DAYS,
  STEPS,
  claimPath,
  claimUrl,
  daysLeft,
  daysUntilPurge,
  doneCount,
  expiryLabel,
  hasErrors,
  isComplete,
  isExpired,
  looksLikeToken,
  needsChasing,
  normaliseOnboardingPhone,
  parseStep,
  resumeAt,
  validateContact,
  type ContactInput,
  type StepState,
} from '@/lib/onboarding';

/**
 * Ce se poate verifica fără o bază de date.
 *
 * Cine poate crea o înscriere, cine o poate revendica și cele patru
 * ocheri pe un document sunt în Postgres și în blocul ASI din
 * `rls_test.sql`. Aici sunt pașii, ceasul și formularul — plus ultimele
 * trei teste, care citesc migrarea înapoi ca cele trei ferestre să nu
 * poată ajunge două numere diferite.
 */

const MIGRATION = 'supabase/migrations/20260926100000_inscriere_asistata.sql';
const sql = () => readFileSync(MIGRATION, 'utf8');

const NOW = new Date('2026-10-01T12:00:00.000Z');

function steps(over: Partial<StepState> = {}): StepState {
  return { firma: false, documente: false, vehicule: false, profil: false, ...over };
}

function contact(over: Partial<ContactInput> = {}): ContactInput {
  return {
    name: 'Marian Popescu',
    email: 'marian@exemplu.ro',
    phone: '0722 123 456',
    channel: 'telefon',
    consentDate: '2026-09-30',
    consentConfirmed: true,
    ...over,
  };
}

describe('pașii vrăjitorului', () => {
  it('sunt patru, în ordinea în care se fac', () => {
    expect([...STEPS]).toEqual(['firma', 'documente', 'vehicule', 'profil']);
  });

  it('numără doar ce este gata', () => {
    expect(doneCount(steps())).toBe(0);
    expect(doneCount(steps({ firma: true, vehicule: true }))).toBe(2);
    expect(doneCount(steps({ firma: true, documente: true, vehicule: true, profil: true }))).toBe(4);
  });

  it('duce înapoi la primul pas nefăcut, nu după ultimul făcut', () => {
    // Cineva care a sărit documentele și a adăugat mașinile trebuie dus
    // înapoi la documente.
    expect(resumeAt(steps({ firma: true, vehicule: true }))).toBe('documente');
    expect(resumeAt(steps())).toBe('firma');
    expect(resumeAt(steps({ firma: true, documente: true }))).toBe('vehicule');
  });

  it('și rămâne pe ultimul când totul este gata', () => {
    const all = steps({ firma: true, documente: true, vehicule: true, profil: true });
    expect(resumeAt(all)).toBe('profil');
    expect(isComplete(all)).toBe(true);
    expect(isComplete(steps({ firma: true }))).toBe(false);
  });

  it('un pas inventat în adresă cade pe primul', () => {
    expect(parseStep('vehicule')).toBe('vehicule');
    expect(parseStep('altceva')).toBe('firma');
    expect(parseStep(null)).toBe('firma');
    expect(parseStep(undefined)).toBe('firma');
  });
});

describe('ceasul linkului', () => {
  it('rotunjește în sus, pentru că 23 de ore este tot o zi', () => {
    expect(daysLeft('2026-10-02T11:00:00.000Z', NOW)).toBe(1);
    expect(daysLeft('2026-10-08T12:00:00.000Z', NOW)).toBe(7);
  });

  it('spune negativ despre ce a trecut', () => {
    expect(daysLeft('2026-09-28T12:00:00.000Z', NOW)).toBeLessThan(0);
    expect(isExpired('2026-09-28T12:00:00.000Z', NOW)).toBe(true);
    expect(isExpired('2026-10-05T12:00:00.000Z', NOW)).toBe(false);
  });

  it('nu inventează o dată când nu are una', () => {
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft('nu e o dată', NOW)).toBeNull();
    expect(isExpired(null, NOW)).toBe(false);
    expect(expiryLabel(null, NOW)).toBe('—');
  });

  it('scrie o singură zi la singular', () => {
    expect(expiryLabel('2026-10-02T11:00:00.000Z', NOW)).toBe('mai are o zi');
    expect(expiryLabel('2026-10-04T12:00:00.000Z', NOW)).toBe('mai are 3 zile');
    expect(expiryLabel('2026-09-20T12:00:00.000Z', NOW)).toBe('a expirat');
  });
});

describe('cine are nevoie de un telefon', () => {
  it('abia după treizeci de zile de tăcere', () => {
    expect(needsChasing('2026-09-20T12:00:00.000Z', 'trimis', NOW)).toBe(false);
    expect(needsChasing('2026-08-25T12:00:00.000Z', 'trimis', NOW)).toBe(true);
  });

  it('și numai dacă linkul chiar a plecat', () => {
    expect(needsChasing('2026-08-01T12:00:00.000Z', 'in_lucru', NOW)).toBe(false);
    expect(needsChasing('2026-08-01T12:00:00.000Z', 'revendicat', NOW)).toBe(false);
    expect(needsChasing(null, 'trimis', NOW)).toBe(false);
  });

  it('câte zile mai are până la ștergere', () => {
    expect(daysUntilPurge('2026-09-01T12:00:00.000Z', NOW)).toBe(30);
    expect(daysUntilPurge('2026-06-01T12:00:00.000Z', NOW)).toBe(0);
  });
});

describe('formularul de contact', () => {
  it('trece cu date întregi', () => {
    expect(hasErrors(validateContact(contact(), NOW))).toBe(false);
  });

  it('cere numele persoanei, nu al firmei', () => {
    expect(validateContact(contact({ name: 'Io' }), NOW).name).toBeDefined();
  });

  it('refuză o adresă care nu este una', () => {
    expect(validateContact(contact({ email: 'marian' }), NOW).email).toBeDefined();
    expect(validateContact(contact({ email: 'marian@exemplu' }), NOW).email).toBeDefined();
  });

  it('și un telefon prea scurt', () => {
    expect(validateContact(contact({ phone: '0722' }), NOW).phone).toBeDefined();
  });

  it('nu pornește fără bifa de acord', () => {
    const errors = validateContact(contact({ consentConfirmed: false }), NOW);
    expect(errors.consentConfirmed).toContain('acordul firmei');
  });

  it('nici fără canalul pe care a venit', () => {
    expect(validateContact(contact({ channel: '' }), NOW).channel).toBeDefined();
    expect(validateContact(contact({ channel: 'porumbel' }), NOW).channel).toBeDefined();
  });

  it('refuză un acord datat mâine', () => {
    expect(validateContact(contact({ consentDate: '2026-10-05' }), NOW).consentDate)
      .toContain('viitor');
  });

  it('și unul de acum patru luni', () => {
    expect(validateContact(contact({ consentDate: '2026-05-01' }), NOW).consentDate)
      .toContain('90 de zile');
  });

  it('dar acceptă unul de ieri', () => {
    expect(validateContact(contact({ consentDate: '2026-09-30' }), NOW).consentDate)
      .toBeUndefined();
  });
});

describe('numărul de telefon', () => {
  it('ajunge la forma pe care o cere baza', () => {
    expect(normaliseOnboardingPhone('0722 123 456')).toBe('+40722123456');
    expect(normaliseOnboardingPhone('+40 722 123 456')).toBe('+40722123456');
    expect(normaliseOnboardingPhone('0040722123456')).toBe('+40722123456');
    expect(normaliseOnboardingPhone('(0722) 123-456')).toBe('+40722123456');
  });

  it('și trece constrângerea din migrare', () => {
    const e164 = /^\+[1-9][0-9]{7,14}$/;
    for (const raw of ['0722 123 456', '+40722123456', '0040722123456']) {
      expect(normaliseOnboardingPhone(raw)).toMatch(e164);
    }
  });
});

describe('linkul', () => {
  it('recunoaște forma pe care o emite baza', () => {
    expect(looksLikeToken('a'.repeat(64))).toBe(true);
    expect(looksLikeToken('A'.repeat(64))).toBe(false);
    expect(looksLikeToken('a'.repeat(63))).toBe(false);
    expect(looksLikeToken('nu-este-un-token')).toBe(false);
  });

  it('se construiește la fel ca în e-mail', () => {
    expect(claimPath('abc')).toBe('/revendica/abc');
    expect(claimUrl('https://exemplu.ro/', 'abc')).toBe('https://exemplu.ro/revendica/abc');
    expect(claimUrl('https://exemplu.ro', 'abc')).toBe('https://exemplu.ro/revendica/abc');
  });
});

// ---------------------------------------------------------------------
// Aceleași numere ca în migrare
//
// Trei ferestre, scrise în două locuri. Testele astea citesc migrarea
// înapoi, ca ziua în care cineva schimbă una să fie ziua în care află că
// mai există una.
// ---------------------------------------------------------------------
describe('ferestrele sunt aceleași ca în Postgres', () => {
  it('linkul ține șapte zile', () => {
    expect(CLAIM_DAYS).toBe(7);
    expect(sql()).toContain("now() + interval '7 days'");
  });

  it('anunțul vine la treizeci', () => {
    expect(ALERT_DAYS).toBe(30);
    expect(sql()).toContain("p_now - interval '30 days'");
    expect(sql()).toContain("'days', 30");
  });

  it('și ștergerea la șaizeci', () => {
    expect(PURGE_DAYS).toBe(60);
    expect(sql()).toContain("p_now - interval '60 days'");
  });

  it('iar tokenul are 64 de caractere pentru că sunt două uuid-uri', () => {
    const text = sql();
    expect(text).toContain("replace(gen_random_uuid()::text, '-', '')");
    // Digest, nu tokenul: tabelul pe care îl citește echipa nu este un
    // loc pentru o cheie care autentifică pe cineva.
    expect(text).toContain("encode(sha256(convert_to(v_token, 'UTF8')), 'hex')");
  });
});
