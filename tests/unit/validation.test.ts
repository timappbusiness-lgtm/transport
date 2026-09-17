import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  isCompanyType,
  normaliseCui,
  normalisePhone,
  validateCompanyDetails,
  validateCui,
  validateEmail,
  validateFullName,
  validateIndividualSignUp,
  validateOtp,
  validatePassword,
  validatePhone,
  validateSignIn,
} from '@/lib/validation/auth';

describe('e-mail', () => {
  it.each(['ion@example.com', 'a.b+tag@sub.example.co.uk', 'șerban@exemplu.ro'])(
    'accepts %s',
    (email) => {
      expect(validateEmail(email)).toBeUndefined();
    },
  );

  it.each(['', '   ', 'ion', 'ion@', '@example.com', 'ion@example', 'a b@c.com'])(
    'rejects %s',
    (email) => {
      expect(validateEmail(email)).toBeDefined();
    },
  );

  it('ignores surrounding whitespace', () => {
    expect(validateEmail('  ion@example.com  ')).toBeUndefined();
  });
});

describe('password', () => {
  it('requires the minimum length', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeUndefined();
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBeDefined();
  });

  it('names the minimum in the message', () => {
    expect(validatePassword('scurt')).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('does not apply a length rule on sign-in', () => {
    // Telling someone their existing password is too short is nonsense.
    expect(validateSignIn({ email: 'ion@example.com', password: 'abc' }).ok).toBe(true);
    expect(validateSignIn({ email: 'ion@example.com', password: '' }).ok).toBe(false);
  });
});

describe('full name', () => {
  it('accepts a normal Romanian name with diacritics', () => {
    expect(validateFullName('Ștefan Mureșan')).toBeUndefined();
  });

  it.each(['', '  ', 'Io'])('rejects %s', (name) => {
    expect(validateFullName(name)).toBeDefined();
  });
});

describe('CUI', () => {
  it('strips the RO prefix and any spacing', () => {
    expect(normaliseCui('RO 14 399 840')).toBe('14399840');
    expect(normaliseCui('ro14399840')).toBe('14399840');
    expect(normaliseCui('14399840')).toBe('14399840');
  });

  it.each(['14399840', 'RO14399840', '12', '1234567890'])('accepts %s', (cui) => {
    expect(validateCui(cui)).toBeUndefined();
  });

  it.each(['', 'RO', '1', '12345678901'])('rejects %s', (cui) => {
    expect(validateCui(cui)).toBeDefined();
  });
});

describe('phone', () => {
  it.each([
    ['0722 123 456', '+40722123456'],
    ['0722123456', '+40722123456'],
    ['+40722123456', '+40722123456'],
    ['40722123456', '+40722123456'],
    ['0722-123-456', '+40722123456'],
    ['0722.123.456', '+40722123456'],
    ['722123456', '+40722123456'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each(['', '0212345678', '072212345', '07221234567', '+49 151 12345678', 'abc'])(
    'rejects %s as a Romanian mobile',
    (input) => {
      expect(normalisePhone(input)).toBeNull();
    },
  );

  it('reports a message for an unusable number', () => {
    expect(validatePhone('0212345678')).toBeDefined();
    expect(validatePhone('0722123456')).toBeUndefined();
  });
});

describe('OTP', () => {
  it('accepts six digits, with or without spacing', () => {
    expect(validateOtp('123456')).toBeUndefined();
    expect(validateOtp('123 456')).toBeUndefined();
  });

  it.each(['', '12345', '1234567', 'abcdef'])('rejects %s', (code) => {
    expect(validateOtp(code)).toBeDefined();
  });
});

describe('individual sign-up', () => {
  const valid = {
    fullName: 'Ion Popescu',
    email: 'ion@example.com',
    password: 'parolaSigura1',
    terms: true,
  };

  it('accepts a complete form', () => {
    expect(validateIndividualSignUp(valid)).toEqual({ ok: true, errors: {} });
  });

  it('requires the terms checkbox', () => {
    const result = validateIndividualSignUp({ ...valid, terms: false });
    expect(result.ok).toBe(false);
    expect(result.errors.terms).toBeDefined();
  });

  it('reports every bad field at once rather than one at a time', () => {
    const result = validateIndividualSignUp({
      fullName: '',
      email: 'nope',
      password: 'x',
      terms: false,
    });
    expect(Object.keys(result.errors).sort()).toEqual([
      'email',
      'fullName',
      'password',
      'terms',
    ]);
  });
});

describe('company details', () => {
  it('accepts the three company types', () => {
    for (const companyType of ['transport', 'expeditie', 'both']) {
      expect(
        validateCompanyDetails({
          cui: 'RO14399840',
          legalName: 'Transport Demo SRL',
          companyType,
        }).ok,
      ).toBe(true);
    }
  });

  it('rejects an unknown company type', () => {
    const result = validateCompanyDetails({
      cui: 'RO14399840',
      legalName: 'Transport Demo SRL',
      companyType: 'altceva',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.companyType).toBeDefined();
  });

  it('guards the company type at the type level too', () => {
    expect(isCompanyType('transport')).toBe(true);
    expect(isCompanyType('owner')).toBe(false);
    expect(isCompanyType(null)).toBe(false);
  });
});
