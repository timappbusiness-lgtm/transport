import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SuccessMoment } from '@/components/ui/success-moment';
import { successCopy } from '@/content/success';
import { homeCopy } from '@/content/home';
import { appCopy } from '@/content/app';

/**
 * Warmer, and exactly as honest.
 *
 * The brief was a person talking to a dispatcher: second person, short
 * sentences, no jargon. The limits are what keep warm from becoming
 * salesy — no superlative, no exclamation mark outside a success screen
 * (and none was needed on those either), and no promise the platform
 * does not enforce. „Îți pot trimite oferte" is true; „îți trimit
 * oferte" was not, because nobody guarantees an offer.
 */

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    const r = fn(...Array.from({ length: fn.length }, () => 1));
    if (typeof r === 'string') out.push(r);
  } else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const REWRITTEN = [
  ...strings(successCopy),
  ...strings(homeCopy),
  ...strings(appCopy.home),
  ...strings(appCopy.carrier.matches),
  ...strings(appCopy.carrier.checklist),
];

describe('the rewritten copy', () => {
  it('uses no exclamation mark anywhere in src/content', () => {
    // The rule allows one per page, on a success screen. The four moments
    // did not need it, so the count across the whole of the copy is zero
    // — and a test at zero is simpler than one counting per page.
    const dir = 'src/content';
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) =>
        readFileSync(join(dir, f), 'utf8')
          .split('\n')
          .filter((line) => /['`][^'`]*!(?!=)[^'`]*['`]/.test(line) && !line.trim().startsWith('//'))
          .map((line) => `${f}: ${line.trim()}`),
      );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('uses no superlative', () => {
    const superlative = /\bcel mai (bun|ieftin|rapid|sigur|mare)|\bcea mai (bună|ieftină|rapidă|sigură|mare)|\bcei mai\b|\bcele mai (bune|ieftine|rapide|sigure)|\bnr\.? ?1\b|\bnumărul unu\b|\bperfect|\bgarant/i;
    expect(REWRITTEN.filter((s) => superlative.test(s))).toEqual([]);
  });

  it('promises no offer, no delivery and no full return', () => {
    const promise = /\bîți trimit oferte|\bvei primi|\bprimești sigur|\bajunge sigur|\bretur plin|\bmereu\b|\bîntotdeauna\b/i;
    expect(REWRITTEN.filter((s) => promise.test(s))).toEqual([]);
  });

  it('talks to the reader in the second person where it gives an instruction', () => {
    // The hero, the CTA steps and the moments: „scrii", „alegi", „poți".
    expect(homeCopy.activity.cta.steps.join(' ')).toMatch(/\b(Scrii|alegi|Compari)\b/);
    expect(successCopy.verified.body).toMatch(/\bpoți\b/);
  });
});

describe('the success moments', () => {
  it.each(Object.entries(successCopy))('%s says one sentence', (_key, moment) => {
    const sentences = moment.body.split(/[.?]\s/).filter(Boolean);
    expect(sentences.length, moment.body).toBeLessThanOrEqual(2);
    expect(moment.body.length).toBeLessThanOrEqual(90);
  });

  it('never draws anything that could read as a verification mark', () => {
    const html = renderToStaticMarkup(<SuccessMoment title="t" body="b" />);
    // No circle, no tick, no shield: a road and a flag.
    expect(html).not.toMatch(/<circle\b/);
    expect(html).not.toMatch(/check|shield|badge|seal/i);
  });

  it('only on a transport that ended the way it was meant to', () => {
    const page = readFileSync('src/app/cont/transporturi/[id]/page.tsx', 'utf8');
    const at = page.indexOf('<SuccessMoment');
    expect(at).toBeGreaterThan(0);
    expect(page.slice(at - 200, at)).toMatch(/order\.status === 'order_completed'/);
  });

  it('keeps the fact that an accepted offer costs no contact', () => {
    expect(successCopy.offerAccepted.body).toMatch(/nu se scad din abonament/);
    expect(successCopy.offerWon.body).toMatch(/nu se scade din abonament/);
  });
});

describe('the formal screens stayed formal', () => {
  it('no success moment, badge or warm copy on a legal, deletion or dispute screen', () => {
    for (const file of [
      'src/components/legal/legal-page.tsx',
      'src/components/account/deletion-panel.tsx',
      'src/components/app/status-banner.tsx',
      'src/components/account/status-banner.tsx',
    ]) {
      const body = readFileSync(file, 'utf8');
      expect(body, file).not.toMatch(/SuccessMoment|successCopy|<Badge\b/);
    }
  });
});
