import { describe, expect, it } from 'vitest';
import {
  anafWarning,
  cuiControlDigitOk,
  cuiDigits,
  cuiInputState,
  readLookupResponse,
} from '@/lib/company-lookup';

/**
 * The CUI autofill, from what is typed to what the form says.
 *
 * `readLookupResponse` reads what `verify-cui-anaf` answers; the mapping of
 * ANAF's own record is tested beside the function, in
 * supabase/functions/verify-cui-anaf/map_test.ts.
 */

const ACTIVE = {
  found: true,
  cui: 14399840,
  legal_name: 'TRANSPORT ARDEAL SRL',
  address: 'JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. FABRICII, NR.12',
  county: 'Cluj',
  city: 'Cluj-Napoca',
  reg_com: 'J12/1234/2010',
  vat_payer: true,
  is_inactive: false,
  is_struck_off: false,
  checked_at: '2026-09-24T09:00:00.000Z',
};

describe('the CUI as it is typed', () => {
  it('keeps the digits whatever the spelling', () => {
    expect(cuiDigits('RO 14 399 840')).toBe('14399840');
    expect(cuiDigits('ro14399840')).toBe('14399840');
  });

  it('checks the control digit', () => {
    expect(cuiControlDigitOk('14399840')).toBe(true);
    expect(cuiControlDigitOk('RO361579')).toBe(true);
    expect(cuiControlDigitOk('14399841')).toBe(false);
    expect(cuiControlDigitOk('1')).toBe(false);
    expect(cuiControlDigitOk('12345678901')).toBe(false);
  });

  it('is ready the moment the control digit agrees — no button', () => {
    expect(cuiInputState('')).toBe('empty');
    expect(cuiInputState('1')).toBe('incomplete');
    expect(cuiInputState('14399')).toBe('incomplete');
    expect(cuiInputState('14399840')).toBe('ready');
    expect(cuiInputState('RO 14399840')).toBe('ready');
  });

  it('calls a full-length CUI with a wrong control digit a typo, a short one unfinished', () => {
    expect(cuiInputState('14399841')).toBe('typo');
    expect(cuiInputState('1439')).toBe('incomplete');
  });
});

describe("reading the function's answer", () => {
  it('a found company fills the name, the county and the town', () => {
    const result = readLookupResponse('14399840', 200, ACTIVE);
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.company).toMatchObject({
      cui: '14399840',
      legalName: 'TRANSPORT ARDEAL SRL',
      county: 'Cluj',
      city: 'Cluj-Napoca',
      regCom: 'J12/1234/2010',
      vatPayer: true,
      isInactive: false,
      isStruckOff: false,
    });
    expect(anafWarning(result.company)).toBeNull();
  });

  it("writes the county the app's way when ANAF's spelling is one of ours", () => {
    const result = readLookupResponse('14399840', 200, { ...ACTIVE, county: 'Bucuresti' });
    expect(result.status === 'found' && result.company.county).toBe('București');
  });

  it('an inactive company is found, and says so', () => {
    const result = readLookupResponse('14399840', 200, { ...ACTIVE, is_inactive: true });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(anafWarning(result.company)).toBe('inactive');
  });

  it('a struck-off company is found, and struck off wins over inactive', () => {
    const result = readLookupResponse('14399840', 200, { ...ACTIVE, is_inactive: true, is_struck_off: true });
    expect(result.status === 'found' && anafWarning(result.company)).toBe('struck_off');
  });

  it('a CUI ANAF does not know is „not found", not a failure', () => {
    expect(readLookupResponse('14399840', 404, { found: false, reason: 'not_found' }).status).toBe('not_found');
  });

  it('a wrong control digit, caught by the function, is „invalid"', () => {
    expect(readLookupResponse('14399841', 400, { reason: 'invalid' }).status).toBe('invalid');
  });

  it('ANAF down, the function down or not deployed, or no answer at all is „unavailable"', () => {
    expect(readLookupResponse('14399840', 503, { reason: 'unavailable', retryable: true }).status).toBe('unavailable');
    expect(readLookupResponse('14399840', 500, { error: 'boom' }).status).toBe('unavailable');
    // The gateway's own 404 for a function that is not deployed.
    expect(
      readLookupResponse('14399840', 404, { code: 'NOT_FOUND', message: 'Requested function was not found' }).status,
    ).toBe('unavailable');
    expect(readLookupResponse('14399840', null, null).status).toBe('unavailable');
    expect(readLookupResponse('14399840', 502, '<html>Bad gateway</html>').status).toBe('unavailable');
  });
});
