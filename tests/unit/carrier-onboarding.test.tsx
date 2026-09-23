import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CarrierBanner } from '@/components/onboarding/carrier-banner';
import { onboardingCopy } from '@/content/onboarding';
import {
  COMPANY_FILE_STEPS,
  carrierStage,
  needsOnboarding,
  stepPosition,
  type CarrierStage,
} from '@/lib/carrier-onboarding';
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

describe('where a carrier stands', () => {
  it('no firm on the account yet', () => {
    expect(carrierStage(null)).toBe('no_company');
  });

  it('a firm that is verified is in nobody’s way', () => {
    expect(carrierStage({ verificationStatus: 'verified', isSuspended: false })).toBe('ready');
    expect(needsOnboarding('ready')).toBe(false);
  });

  it('and every other status has something left to do', () => {
    expect(carrierStage({ verificationStatus: 'draft', isSuspended: false })).toBe('draft');
    expect(carrierStage({ verificationStatus: 'pending', isSuspended: false })).toBe('pending');
    expect(carrierStage({ verificationStatus: 'rejected', isSuspended: false })).toBe('rejected');
    expect(carrierStage({ verificationStatus: 'suspended', isSuspended: false })).toBe('suspended');
  });

  it('a suspension outranks the verification status, as it does everywhere else', () => {
    // `is_suspended` and `verification_status` are two columns that can
    // disagree. `banners.ts` reads the suspension first; so does this,
    // or a suspended firm would be told to carry on filling in a form.
    expect(carrierStage({ verificationStatus: 'verified', isSuspended: true })).toBe('suspended');
    expect(carrierStage({ verificationStatus: 'draft', isSuspended: true })).toBe('suspended');
  });
});

describe('the banner above the boards', () => {
  const STAGES: Exclude<CarrierStage, 'ready'>[] = [
    'no_company',
    'draft',
    'pending',
    'rejected',
    'suspended',
  ];

  it('says what can be done before what cannot, on every stage', () => {
    for (const stage of STAGES) {
      const html = renderToStaticMarkup(<CarrierBanner stage={stage} />);
      const c = onboardingCopy.banner[stage];
      expect(html, stage).toContain(c.title);
      expect(html, stage).toContain(c.action);
      // Exactly one way out of it. A banner with two buttons is a
      // decision, and this is not the screen for one.
      expect((html.match(/<a\b/g) ?? []).length, stage).toBe(1);
    }
  });

  it('but a suspension and a rejection carry no icon', () => {
    // `docs/13-iconuri.md`: a pictogram beside „cont suspendat" turns a
    // sentence somebody has to read into a notification they dismiss.
    for (const stage of ['suspended', 'rejected'] as const) {
      expect(renderToStaticMarkup(<CarrierBanner stage={stage} />), stage).not.toContain('<svg');
    }
  });

  it('and the calm ones do, because they are not an alarm', () => {
    for (const stage of ['no_company', 'draft', 'pending'] as const) {
      expect(renderToStaticMarkup(<CarrierBanner stage={stage} />), stage).toContain('<svg');
    }
  });
});

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

  const ALL = strings(onboardingCopy);
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
