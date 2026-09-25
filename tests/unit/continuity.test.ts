import { describe, expect, it } from 'vitest';
import {
  LOCAL_DRAFT_TTL_MS,
  clearDraft,
  draftKey,
  isDraftForm,
  newestDraft,
  readDraft,
  writeDraft,
  type DraftStorage,
} from '@/lib/continuity/drafts';
import { leavesThisPage, shouldAskBeforeLeaving } from '@/lib/continuity/leave-guard';
import { NETWORK_ERROR_MESSAGE, isNetworkError, keepOnNetworkFailure } from '@/lib/continuity/network';
import { STEP_PARAM, parseStep, reachableStep, withStep } from '@/lib/continuity/steps';
import { safeNextPath, withNext } from '@/lib/auth/next-path';

/**
 * The pieces every interruptible form is built from: where it is (the step
 * in the URL), what it holds (the draft), where a sign-in comes back to,
 * and when leaving has to ask.
 */

type Step = 'ruta' | 'vehicul' | 'serviciu' | 'contact';
const FLOW = {
  steps: ['ruta', 'vehicul', 'serviciu', 'contact'] as const,
  slugs: { ruta: 'traseu', vehicul: 'vehicul', serviciu: 'serviciu', contact: 'contact' },
};

describe('the step in the URL', () => {
  it('reads the slug', () => {
    expect(parseStep('serviciu', FLOW)).toBe('serviciu');
    expect(parseStep('traseu', FLOW)).toBe('ruta');
  });

  it('reads the position a person would type', () => {
    expect(parseStep('3', FLOW)).toBe('serviciu');
    expect(parseStep('1', FLOW)).toBe('ruta');
  });

  it('forgives case and spaces', () => {
    expect(parseStep(' Contact ', FLOW)).toBe('contact');
  });

  it('refuses what is not a step', () => {
    for (const raw of [null, undefined, '', '0', '5', '99', 'ruta', 'javascript:alert(1)', '../contact']) {
      expect(parseStep(raw, FLOW), String(raw)).toBeNull();
    }
  });

  it('writes the step and keeps every other parameter', () => {
    expect(withStep('?plecare=Milano%7CIT', 'serviciu', FLOW)).toBe('?plecare=Milano%7CIT&pas=serviciu');
    expect(withStep('plecare=Milano%7CIT&pas=vehicul', 'contact', FLOW)).toBe(
      '?plecare=Milano%7CIT&pas=contact',
    );
  });

  it('writes the first step as no parameter at all', () => {
    expect(withStep('?pas=contact', 'ruta', FLOW)).toBe('');
    expect(withStep('?pas=contact&x=1', 'ruta', FLOW)).toBe('?x=1');
  });

  it('uses one parameter name everywhere', () => {
    expect(STEP_PARAM).toBe('pas');
  });
});

describe('a step that cannot be reached yet', () => {
  const complete = (done: Step[]) => (step: Step) => done.includes(step);

  it('is honoured when everything before it is done', () => {
    expect(reachableStep('contact', FLOW.steps, complete(['ruta', 'vehicul', 'serviciu']))).toBe('contact');
  });

  it('sends the person to the first gap instead of an empty form', () => {
    expect(reachableStep('contact', FLOW.steps, complete([]))).toBe('ruta');
    expect(reachableStep('contact', FLOW.steps, complete(['ruta']))).toBe('vehicul');
    expect(reachableStep('serviciu', FLOW.steps, complete(['ruta', 'serviciu']))).toBe('vehicul');
  });

  it('does not care whether the requested step itself is done', () => {
    expect(reachableStep('vehicul', FLOW.steps, complete(['ruta']))).toBe('vehicul');
  });

  it('starts at the beginning for a step it does not know', () => {
    expect(reachableStep('nope' as Step, FLOW.steps, complete(['ruta']))).toBe('ruta');
  });
});

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const parseObject = (payload: unknown) =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, string>) : null;

describe('a draft in the browser', () => {
  const NOW = 1_800_000_000_000;

  it('comes back as it was saved, with its step', () => {
    const storage = memory();
    expect(writeDraft(storage, 'k', { city: 'Cluj' }, 'serviciu', NOW)).toBe(true);
    expect(readDraft(storage, 'k', parseObject, NOW + 1000)).toEqual({
      payload: { city: 'Cluj' },
      step: 'serviciu',
      savedAt: NOW,
    });
  });

  it('is gone after three days, and removed', () => {
    const storage = memory();
    writeDraft(storage, 'k', { city: 'Cluj' }, null, NOW);
    expect(readDraft(storage, 'k', parseObject, NOW + LOCAL_DRAFT_TTL_MS + 1)).toBeNull();
    expect(storage.data.has('k')).toBe(false);
  });

  it('is still there the day after', () => {
    const storage = memory();
    writeDraft(storage, 'k', { city: 'Cluj' }, null, NOW);
    expect(readDraft(storage, 'k', parseObject, NOW + 24 * 3600 * 1000)).not.toBeNull();
  });

  it('never trusts what storage holds', () => {
    const storage = memory();
    for (const raw of ['not json', '"text"', '{"v":2,"savedAt":1,"payload":{}}', '{"v":1,"payload":{}}', '{"v":1,"savedAt":1,"payload":"x"}']) {
      storage.data.set('k', raw);
      expect(readDraft(storage, 'k', parseObject, NOW), raw).toBeNull();
    }
  });

  it('does not accept a draft from the future', () => {
    const storage = memory();
    writeDraft(storage, 'k', {}, null, NOW + 10 * 60_000);
    expect(readDraft(storage, 'k', parseObject, NOW)).toBeNull();
  });

  it('works without storage at all', () => {
    expect(writeDraft(null, 'k', {}, null, NOW)).toBe(false);
    expect(readDraft(null, 'k', parseObject, NOW)).toBeNull();
    expect(() => clearDraft(null, 'k')).not.toThrow();
  });

  it('survives storage that throws', () => {
    const broken: DraftStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(writeDraft(broken, 'k', {}, null, NOW)).toBe(false);
    expect(readDraft(broken, 'k', parseObject, NOW)).toBeNull();
    expect(() => clearDraft(broken, 'k')).not.toThrow();
  });

  it('refuses a payload too large to be a form', () => {
    expect(writeDraft(memory(), 'k', { x: 'y'.repeat(40_000) }, null, NOW)).toBe(false);
  });

  it('is cleared', () => {
    const storage = memory();
    writeDraft(storage, 'k', {}, null, NOW);
    clearDraft(storage, 'k');
    expect(storage.data.size).toBe(0);
  });

  it('is kept per form and per scope', () => {
    expect(draftKey('cerere')).toBe('app.ciorna.cerere');
    expect(draftKey('oferta', 'abc')).toBe('app.ciorna.oferta.abc');
    expect(isDraftForm('cerere')).toBe(true);
    expect(isDraftForm('orice')).toBe(false);
  });
});

describe('two copies of a draft', () => {
  const at = (savedAt: number, city: string) => ({ payload: { city }, step: null, savedAt });

  it('resumes from the one saved last', () => {
    expect(newestDraft(at(2, 'telefon'), at(1, 'desktop'))?.payload.city).toBe('telefon');
    expect(newestDraft(at(1, 'telefon'), at(2, 'desktop'))?.payload.city).toBe('desktop');
  });

  it('gives a tie to the server, which every device agrees on', () => {
    expect(newestDraft(at(5, 'local'), at(5, 'server'))?.payload.city).toBe('server');
  });

  it('takes whichever exists', () => {
    expect(newestDraft(null, at(1, 'server'))?.payload.city).toBe('server');
    expect(newestDraft(at(1, 'local'), null)?.payload.city).toBe('local');
    expect(newestDraft(null, null)).toBeNull();
  });
});

describe('where a sign-in comes back to', () => {
  it('carries the exact step', () => {
    expect(withNext('/autentificare', '/cerere/noua?pas=contact')).toBe(
      '/autentificare?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact',
    );
    expect(safeNextPath('/cerere/noua?pas=contact')).toBe('/cerere/noua?pas=contact');
  });

  it('adds to a link that already has a query', () => {
    expect(withNext('/inregistrare?tip=firma', '/cerere/noua?pas=contact')).toBe(
      '/inregistrare?tip=firma&next=%2Fcerere%2Fnoua%3Fpas%3Dcontact',
    );
  });

  it('is only ever an internal path', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '%2F%2Fevil.example', null, '']) {
      expect(withNext('/autentificare', bad), String(bad)).toBe('/autentificare');
    }
  });

  it('leaves off a next that is the default anyway', () => {
    expect(withNext('/autentificare', '/cont')).toBe('/autentificare');
  });
});

describe('asking before leaving', () => {
  it('asks with changes nobody saved', () => {
    expect(shouldAskBeforeLeaving({ dirty: true, confirmed: false })).toBe(true);
  });

  it('asks once: a person who said yes has decided', () => {
    expect(shouldAskBeforeLeaving({ dirty: true, confirmed: true })).toBe(false);
  });

  it('never after a save', () => {
    expect(shouldAskBeforeLeaving({ dirty: false, confirmed: false })).toBe(false);
  });

  const here = new URL('https://exemplu.ro/cont/firma?sectiune=identitate');
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  const anchor = (href: string, extra: Partial<{ target: string; hasDownload: boolean }> = {}) => ({
    href,
    target: '',
    hasDownload: false,
    ...extra,
  });

  it('knows a click that takes this tab to another page of the site', () => {
    expect(leavesThisPage(plain, anchor('/cont'), here)).toBe(true);
    expect(leavesThisPage(plain, anchor('/cont/firma?sectiune=acoperire'), here)).toBe(true);
  });

  it('and the clicks that do not', () => {
    expect(leavesThisPage(plain, anchor('#sus'), here)).toBe(false);
    expect(leavesThisPage(plain, anchor('/cont', { target: '_blank' }), here)).toBe(false);
    expect(leavesThisPage(plain, anchor('/fisier.pdf', { hasDownload: true }), here)).toBe(false);
    expect(leavesThisPage({ ...plain, metaKey: true }, anchor('/cont'), here)).toBe(false);
    expect(leavesThisPage({ ...plain, button: 1 }, anchor('/cont'), here)).toBe(false);
    expect(leavesThisPage({ ...plain, defaultPrevented: true }, anchor('/cont'), here)).toBe(false);
    // Another site: the browser asks there itself, through beforeunload.
    expect(leavesThisPage(plain, anchor('https://example.com/'), here)).toBe(false);
  });
});

describe('a request that did not arrive', () => {
  it('is told apart from every other failure', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true);
    expect(isNetworkError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    expect(isNetworkError(new Error('Cannot read properties of undefined'))).toBe(false);
    // Next's own redirect travels as an error with a digest; it must pass.
    expect(isNetworkError(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/cont;307;' }))).toBe(false);
    expect(isNetworkError('Failed to fetch')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  it('becomes state, with everything the form already held', async () => {
    type State = { error?: string; values?: Record<string, string> };
    const failing = keepOnNetworkFailure<State, FormData>(
      async () => {
        throw new TypeError('Failed to fetch');
      },
      (previous, message) => ({ ...previous, error: message }),
    );
    const state = await failing({ values: { price: '450' } }, new FormData());
    expect(state).toEqual({ values: { price: '450' }, error: NETWORK_ERROR_MESSAGE });
  });

  it('while anything else still throws', async () => {
    const redirecting = keepOnNetworkFailure<object, FormData>(
      async () => {
        throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/cont;307;' });
      },
      (previous) => previous,
    );
    await expect(redirecting({}, new FormData())).rejects.toThrow('NEXT_REDIRECT');
  });
});
