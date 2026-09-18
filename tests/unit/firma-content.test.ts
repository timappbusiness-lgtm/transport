import { describe, expect, it } from 'vitest';
import { COVERAGE_COUNTRIES, countryName, firmaCopy } from '@/content/firma';
import { PROFILE_TABS } from '@/lib/company-profile';

/**
 * The rules that keep the profile area honest, not the wording, which
 * changes freely.
 *
 * The one that matters most here: the alerts tab must not offer a channel
 * nothing sends. `saved_searches` has carried `notify_whatsapp` and
 * `notify_push` since phase 0 and no workflow reads either, so a switch
 * for them would be a promise the platform does not keep. The e-mail is
 * real — publishing a request writes a row into `notification_outbox` for
 * every matching carrier — and it is the only one named.
 */

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: (number | string)[]) => string;
    out.push(fn(...Array.from({ length: fn.length }, () => 1)));
    out.push(fn(...Array.from({ length: fn.length }, () => '3 din 5')));
  } else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const ALL = strings(firmaCopy);
const JOINED = ALL.join(' ');

describe('company profile copy rules', () => {
  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('uses no superlatives', () => {
    expect(JOINED).not.toMatch(/cel mai|cea mai|cei mai|cele mai|garant|perfect|unic[ăae]?\b/i);
  });

  it('offers no channel the platform does not send', () => {
    expect(JOINED).not.toMatch(/sms|whatsapp|notificare push|push\b/i);
  });

  it('promises the e-mail it actually queues, and says how often', () => {
    expect(firmaCopy.alerts.lede).toMatch(/e-mail/i);
    expect(firmaCopy.alerts.enableHint).toMatch(/republicată nu se trimite/i);
  });

  it('states every matching rule the database applies', () => {
    const rules = firmaCopy.alerts.rules.join(' ');
    expect(rules).toMatch(/troliu/i);
    expect(rules).toMatch(/tractăr/i);
    expect(rules).toMatch(/categoriile/i);
  });

  it('says the indicative rate is indicative, wherever it appears', () => {
    expect(firmaCopy.capabilities.rateHint).toMatch(/orientativ/i);
    expect(firmaCopy.capabilities.rateHint).toMatch(/ofertă/i);
  });

  it('never suggests an empty profile blocks anything', () => {
    expect(firmaCopy.completeness.lede).not.toMatch(/blochează|nu poți|obligator/i);
    expect(firmaCopy.completeness.lede).toMatch(/nimic nu este blocat/i);
  });

  it('says the address is never published', () => {
    expect(firmaCopy.identity.addressHint).toMatch(/nu apare niciodată public/i);
  });

  it('keeps the trade terms in Romanian', () => {
    expect(firmaCopy.capabilities.equipmentHint).toMatch(/troliu/);
  });

  it('writes its diacritics', () => {
    // A stripped form of words this file uses a lot: the quickest way to
    // catch a paste from somewhere that lost them.
    expect(ALL.filter((s) => /\b(judet|judete|acoperire firma|masina|dotari)\b/i.test(s)))
      .toEqual([]);
  });

  it('has a name for every tab', () => {
    // A blank tab is worse than a badly named one.
    for (const tab of PROFILE_TABS) {
      expect(firmaCopy.tabs[tab]).toBeTruthy();
    }
  });

  it('has a label and a hint for every coverage scope', () => {
    for (const scope of ['judetean', 'national', 'international']) {
      expect(firmaCopy.coverage.scopes[scope]).toBeTruthy();
      expect(firmaCopy.coverage.scopeHints[scope]).toBeTruthy();
    }
  });
});

describe('the countries a firm can tick', () => {
  it('does not offer Romania, which is never optional', () => {
    expect(COVERAGE_COUNTRIES.some((country) => country.code === 'RO')).toBe(false);
    expect(firmaCopy.coverage.countriesHint).toMatch(/România este inclusă/i);
  });

  it('uses two-letter codes throughout', () => {
    expect(COVERAGE_COUNTRIES.every((country) => /^[A-Z]{2}$/.test(country.code))).toBe(true);
  });

  it('names each one in Romanian, with diacritics', () => {
    expect(countryName('FR')).toBe('Franța');
    expect(countryName('NL')).toBe('Țările de Jos');
  });

  it('hands back a code it does not know rather than an empty string', () => {
    expect(countryName('zz')).toBe('ZZ');
  });

  it('lists no country twice', () => {
    const codes = COVERAGE_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
