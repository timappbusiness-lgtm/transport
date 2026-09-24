import { describe, expect, it } from 'vitest';
import { inscriereCopy } from '@/content/inscriere';
import { onboardingCopy } from '@/content/onboarding';
import { COMPANY_FILE_STEPS, stepPosition } from '@/lib/carrier-onboarding';
import { PROFILE_TABS, tabsFor } from '@/lib/company-profile';

/**
 * The first ten minutes of a carrier's account.
 *
 * A dispatcher signs up, lands on the board and is told, once and
 * calmly, what is still between them and an offer. Two things have to
 * hold for that to be true rather than decorative: the stage has to come
 * out of the firm's own state and nowhere else, and the numbering on the
 * company file has to count the steps this firm will actually see.
 */

// Where a carrier stands, and the banner above the boards, are in
// carrier-journey.test.tsx: the stage now reads the vehicles and the
// documents as well as the firm's status.

describe('the company file counts its own steps', () => {
  it('the steps are the tabs, neither more nor fewer', () => {
    expect([...COMPANY_FILE_STEPS]).toEqual([...PROFILE_TABS]);
  });

  it('„Pasul 1 din 5" for a carrier', () => {
    const steps = tabsFor('transport');
    expect(stepPosition('identitate', steps)).toEqual({ current: 1, total: 5 });
    expect(stepPosition('public', steps)).toEqual({ current: 5, total: 5 });
  });

  it('and „Pasul 4 din 4" for a forwarder, which has no equipment step', () => {
    // Counting five at a firm that will only ever see four is a small
    // lie that makes the last step look broken.
    const steps = tabsFor('expeditie');
    expect(steps).not.toContain('dotari');
    expect(stepPosition('public', steps)).toEqual({ current: 4, total: 4 });
    expect(stepPosition('dotari', steps)).toBeNull();
  });

  it('every step says why it is asked', () => {
    for (const step of COMPANY_FILE_STEPS) {
      expect(onboardingCopy.why[step], step).toMatch(/^Ca să /);
    }
  });
});

describe('what the onboarding copy may not say', () => {
  function strings(value: unknown, out: string[] = []): string[] {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      const fn = value as (...args: number[]) => string;
      out.push(fn(...Array.from({ length: fn.length }, (_, i) => i + 1)));
    } else if (Array.isArray(value)) for (const item of value) strings(item, out);
    else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) strings(item, out);
    }
    return out;
  }

  const ALL = strings([onboardingCopy, inscriereCopy]);
  const JOINED = ALL.join(' ');

  it('promises no verification time, because nothing measures one', () => {
    // „Aproximativ 10 minute" is a promise about the typing, which is
    // ours to keep. A number for the review is somebody else's day.
    expect(JOINED).not.toMatch(/verific\w+[^.]{0,40}\b\d+\s*(minute|ore|zile)/i);
    expect(JOINED).not.toMatch(/în (24 de ore|maxim|cel mult)\s*\d/i);
  });

  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('writes its diacritics', () => {
    expect(ALL.filter((s) => /\b(firma ta[^ăaei]|panoul de cereri[^.]*asteapta)\b/i.test(s))).toEqual(
      [],
    );
    // The words this file repeats, in the form that keeps them.
    expect(JOINED).toMatch(/Completarea dosarului durează aproximativ/);
  });
});
