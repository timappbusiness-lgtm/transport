import { beforeEach, describe, expect, it } from 'vitest';
import {
  CARRIER_COUNT_COPY,
  cacheKey,
  carrierCountSentence,
  clearCarrierCountCache,
  readCache,
  writeCache,
} from '@/lib/carrier-count';

describe('carrierCountSentence', () => {
  it('says the client sentence, word for word, in the plural', () => {
    expect(carrierCountSentence(4)).toBe(
      '4 transportatori verificați circulă pe această rută.',
    );
  });

  it('does not write „1 transportatori"', () => {
    expect(carrierCountSentence(1)).toBe(
      'Un transportator verificat circulă pe această rută.',
    );
  });

  it('puts „de" in from twenty upwards, as Romanian requires', () => {
    expect(carrierCountSentence(19)).toContain('19 transportatori verificați');
    expect(carrierCountSentence(20)).toContain('20 de transportatori verificați');
    expect(carrierCountSentence(101)).toContain('101 de transportatori verificați');
  });

  it('no longer promises a period it does not check', () => {
    // The count is coverage, category and equipment. Saying „în perioada
    // aleasă" over that would be the exact claim the date requirement was
    // added to avoid, made without the requirement.
    for (const count of [0, 1, 5, 40]) {
      expect(carrierCountSentence(count)).not.toContain('perioada aleasă');
    }
  });

  it('has its own sentence for zero rather than a rounded-up one', () => {
    expect(carrierCountSentence(0)).toBe(CARRIER_COUNT_COPY.zero);
    expect(carrierCountSentence(0)).toContain('Cererea rămâne publicată');
    // A negative count cannot happen, and if it did it must not print.
    expect(carrierCountSentence(-3)).toBe(CARRIER_COUNT_COPY.zero);
  });

  it('never promises a name or a contact', () => {
    for (const count of [0, 1, 5, 40]) {
      const sentence = carrierCountSentence(count);
      expect(sentence).not.toMatch(/telefon|contact|e-mail|SRL/i);
    }
  });
});

describe('the preview memo', () => {
  beforeEach(() => clearCarrierCountCache());

  it('answers again inside the window and forgets after it', () => {
    const key = cacheKey('u1', ['RO', 'CJ', 'RO', 'TM', '2026-10-01', null]);
    writeCache(key, 3, 1_000);
    expect(readCache(key, 2_000)).toBe(3);
    expect(readCache(key, 40_000)).toBeNull();
  });

  it('keeps two people apart, because the count excludes their own firm', () => {
    const route = ['RO', 'CJ', 'RO', 'TM', '2026-10-01', null] as const;
    writeCache(cacheKey('u1', route), 3, 1_000);
    expect(readCache(cacheKey('u2', route), 1_500)).toBeNull();
  });

  it('treats a missing county as its own route, not as any county', () => {
    writeCache(cacheKey('u1', ['RO', null, 'RO', 'TM', '2026-10-01', null]), 7, 1_000);
    expect(readCache(cacheKey('u1', ['RO', 'CJ', 'RO', 'TM', '2026-10-01', null]), 1_500)).toBeNull();
  });

  it('does not grow without bound', () => {
    for (let i = 0; i < 700; i += 1) writeCache(cacheKey('u1', [i]), i, 1_000);
    // The oldest keys are gone; the newest are still answerable.
    expect(readCache(cacheKey('u1', [0]), 1_500)).toBeNull();
    expect(readCache(cacheKey('u1', [699]), 1_500)).toBe(699);
  });
});
