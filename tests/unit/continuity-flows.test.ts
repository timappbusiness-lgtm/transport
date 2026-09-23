import { describe, expect, it } from 'vitest';
import { AUTH_PAGES, returnPathAfterAuth, withNext } from '@/lib/auth/next-path';
import { boardHref, cleanBoardQuery, rememberBoard } from '@/lib/continuity/board-return';
import {
  DONE_PARAM,
  doneUrl,
  draftKey,
  isDraftPayload,
  isDraftScope,
  isDraftStep,
  parseDone,
  type DraftStorage,
} from '@/lib/continuity/drafts';
import {
  parseFieldValues,
  readFields,
  sameFieldValues,
  writeFields,
  type FieldLike,
} from '@/lib/continuity/form-values';
import {
  FAILURE_MESSAGES,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  STALE_PAGE_MESSAGE,
  failureKind,
  keepOnFailure,
} from '@/lib/continuity/network';
import { withParam } from '@/lib/continuity/query';
import {
  SESSION_EXPIRED_DIGEST,
  SESSION_EXPIRED_MESSAGE,
  SIGN_IN_AGAIN_HREF,
  isSessionExpired,
  sessionExpiredError,
} from '@/lib/continuity/session';
import { parseStep } from '@/lib/continuity/steps';
import {
  REQUEST_STEP_DEFINITION,
  emptyDraft,
  reachableRequestStep,
  stepHasInput,
  type RequestDraft,
} from '@/lib/request-form';

/**
 * The rules every interruptible flow is built on, as the flows use them:
 * which failures keep the form, where a sign-in returns to, how a board
 * remembers its filters, what a form draft is made of, and how the
 * request form decides which step a URL may show.
 */

function memory(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('a failed request keeps the form', () => {
  it('names the four failures, and nothing else', () => {
    expect(failureKind(new TypeError('Failed to fetch'))).toBe('network');
    expect(failureKind(sessionExpiredError())).toBe('session');
    // An exception on the server arrives with a digest and no message.
    expect(failureKind(Object.assign(new Error('An error occurred'), { digest: '1234567' }))).toBe('server');
    expect(failureKind(new Error('An unexpected response was received from the server.'))).toBe('server');
    expect(failureKind(new Error('Body exceeded 1 MB limit'))).toBe('server');
    expect(
      failureKind(new Error('Server Action "abc" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action')),
    ).toBe('stale');
    // Next's own control flow is not a failure.
    expect(failureKind(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/cont;307;' }))).toBeNull();
    expect(failureKind(Object.assign(new Error('x'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }))).toBeNull();
    // A bug in the browser is a bug.
    expect(failureKind(new TypeError('Cannot read properties of undefined'))).toBeNull();
    expect(failureKind('Failed to fetch')).toBeNull();
  });

  it('turns each into the sentence for it, keeping what the form held', async () => {
    type State = { error?: string; values?: Record<string, string> };
    const previous: State = { values: { email: 'ana@example.ro' } };
    const cases: [unknown, string][] = [
      [new TypeError('Failed to fetch'), NETWORK_ERROR_MESSAGE],
      [sessionExpiredError(), SESSION_EXPIRED_MESSAGE],
      [Object.assign(new Error('boom'), { digest: '99' }), SERVER_ERROR_MESSAGE],
      [new Error('Server Action "x" was not found on the server.'), STALE_PAGE_MESSAGE],
    ];
    for (const [thrown, message] of cases) {
      const kept = keepOnFailure<State, FormData>(
        async () => {
          throw thrown;
        },
        (prev, text) => ({ ...prev, error: text }),
      );
      expect(await kept(previous, new FormData())).toEqual({ ...previous, error: message });
    }
    expect(Object.keys(FAILURE_MESSAGES).sort()).toEqual(['network', 'server', 'session', 'stale']);
  });

  it('lets a redirect through', async () => {
    const redirecting = keepOnFailure<object, FormData>(
      async () => {
        throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/cont/trasee;303;' });
      },
      () => ({ error: 'no' }),
    );
    await expect(redirecting({}, new FormData())).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('an expired session', () => {
  it('is one recognisable error, whose digest is the part that survives production', () => {
    const error = sessionExpiredError();
    expect(error.digest).toBe(SESSION_EXPIRED_DIGEST);
    expect(error.digest.startsWith('NEXT_')).toBe(false);
    expect(isSessionExpired(error)).toBe(true);
    expect(isSessionExpired(new Error(SESSION_EXPIRED_MESSAGE))).toBe(false);
  });

  it('is signed back into in a new tab that lands on a page that tells this one', () => {
    expect(SIGN_IN_AGAIN_HREF).toBe('/autentificare?next=%2Freconectat');
  });
});

describe('where a sign-in returns to', () => {
  it('is the page and position the person was on, internal paths only', () => {
    expect(returnPathAfterAuth('/cerere/noua?pas=contact')).toBe('/cerere/noua?pas=contact');
    expect(returnPathAfterAuth('/cont/cereri/abc#oferte')).toBe('/cont/cereri/abc#oferte');
    expect(returnPathAfterAuth('https://evil.example/cerere')).toBe('/cont');
    expect(returnPathAfterAuth('//evil.example')).toBe('/cont');
    expect(returnPathAfterAuth('/%2F%2Fevil.example')).toBe('/cont');
    expect(returnPathAfterAuth(null)).toBe('/cont');
  });

  it('is never a sign-in page, which would send a signed-in person round for ever', () => {
    for (const page of AUTH_PAGES) {
      expect(returnPathAfterAuth(page)).toBe('/cont');
      expect(returnPathAfterAuth(`${page}?next=/cont`)).toBe('/cont');
    }
    expect(returnPathAfterAuth('/inregistrare/firma')).toBe('/cont');
  });

  it('is carried by every link on the way, nested for the password reset', () => {
    const back = '/cerere/noua?pas=contact';
    const reset = withNext('/parola-noua', back);
    expect(reset).toBe('/parola-noua?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact');
    // The callback receives the reset page, which carries the form on.
    expect(new URL(`https://x${reset}`).searchParams.get('next')).toBe(back);
    expect(withNext('/autentificare?eroare=link', back)).toBe(
      '/autentificare?eroare=link&next=%2Fcerere%2Fnoua%3Fpas%3Dcontact',
    );
  });
});

describe('the request form in the URL', () => {
  const today = '2026-09-23';
  const route: RequestDraft = {
    ...emptyDraft(),
    fromCity: 'München',
    fromCountry: 'DE',
    toCity: 'Cluj-Napoca',
    loadingFrom: '2030-06-01',
  };

  it('reads ?pas= as the word on the stepper or the number', () => {
    expect(parseStep('traseu', REQUEST_STEP_DEFINITION)).toBe('ruta');
    expect(parseStep('3', REQUEST_STEP_DEFINITION)).toBe('serviciu');
    expect(parseStep('contact', REQUEST_STEP_DEFINITION)).toBe('contact');
    expect(parseStep('ruta', REQUEST_STEP_DEFINITION)).toBeNull();
  });

  it('shows an unreachable step as the last one that can be reached', () => {
    expect(reachableRequestStep(emptyDraft(), 'contact', today)).toBe('ruta');
    expect(reachableRequestStep(route, 'contact', today)).toBe('vehicul');
    const vehicle = { ...route, make: 'Volkswagen', model: 'Golf', year: '2018' };
    expect(reachableRequestStep(vehicle, 'contact', today)).toBe('contact');
    // A date that has passed since yesterday sends the person back to it.
    expect(reachableRequestStep({ ...vehicle, loadingFrom: '2020-01-01' }, 'contact', today)).toBe('ruta');
  });

  it('only says what is missing on a step the person had filled in', () => {
    expect(stepHasInput(emptyDraft(), 'vehicul')).toBe(false);
    expect(stepHasInput(route, 'ruta')).toBe(true);
    expect(stepHasInput({ ...emptyDraft(), make: 'Opel' }, 'vehicul')).toBe(true);
  });
});

describe('a board remembers its filters for the way back', () => {
  it('keeps only a query of key=value pairs', () => {
    expect(cleanBoardQuery('?tip=autoturism&pagina=2')).toBe('?tip=autoturism&pagina=2');
    expect(cleanBoardQuery('tip=autoturism')).toBe('?tip=autoturism');
    expect(cleanBoardQuery('')).toBe('');
    expect(cleanBoardQuery('?a=1#frag')).toBe('');
    expect(cleanBoardQuery('?a b')).toBe('');
    expect(cleanBoardQuery(`?${'a=1&'.repeat(600)}`)).toBe('');
  });

  it('goes back to the board as it was left, per board', () => {
    const storage = memory();
    rememberBoard(storage, '/cereri', '?tip=autoturism&raza=100');
    rememberBoard(storage, '/trasee', '');
    expect(boardHref(storage, '/cereri')).toBe('/cereri?tip=autoturism&raza=100');
    expect(boardHref(storage, '/trasee')).toBe('/trasee');
    expect(boardHref(null, '/cereri')).toBe('/cereri');
  });
});

describe('paging keeps the filters', () => {
  it('changes one parameter and keeps the rest', () => {
    const params = { nota: '1', firma: 'abc', pagina: '2', gol: '' };
    expect(withParam('/admin/evaluari', params, 'pagina', '3')).toBe('/admin/evaluari?nota=1&firma=abc&pagina=3');
    expect(withParam('/admin/evaluari', params, 'pagina', null)).toBe('/admin/evaluari?nota=1&firma=abc');
    expect(withParam('/admin/anunturi', { fel: ['trasee'] }, 'pagina', '2')).toBe('/admin/anunturi?fel=trasee&pagina=2');
    expect(withParam('/x', {}, 'pagina', null)).toBe('/x');
  });
});

describe('a finished form clears its draft', () => {
  it('names the draft on the page the action redirects to', () => {
    expect(doneUrl('/cont/trasee', 'traseu')).toBe(`/cont/trasee?${DONE_PARAM}=traseu`);
    expect(doneUrl('/admin/inscrieri/x?pas=link', 'inscriere-asistata', 'x-profil')).toBe(
      '/admin/inscrieri/x?pas=link&gata=inscriere-asistata.x-profil',
    );
    expect(parseDone('traseu')).toEqual({ form: 'traseu', scope: null });
    expect(parseDone('inscriere-asistata.x-profil')).toEqual({ form: 'inscriere-asistata', scope: 'x-profil' });
    expect(parseDone('parola')).toBeNull();
    expect(parseDone('traseu.../x')).toBeNull();
    expect(parseDone(null)).toBeNull();
    expect(draftKey('traseu')).toBe('coridor.ciorna.traseu');
  });

  it('checks the same shapes the table does, before asking it', () => {
    expect(isDraftScope('')).toBe(true);
    expect(isDraftScope('3f6c1b2a-0000-4000-8000-000000000001')).toBe(true);
    expect(isDraftScope('Majuscule')).toBe(false);
    expect(isDraftStep(null)).toBe(true);
    expect(isDraftStep('contact')).toBe(true);
    expect(isDraftStep('')).toBe(false);
    expect(isDraftPayload({ a: 1 })).toBe(true);
    expect(isDraftPayload([1])).toBe(false);
    expect(isDraftPayload({ a: 'x'.repeat(40_000) })).toBe(false);
  });
});

describe('the fields of an ordinary form', () => {
  function fields(): (FieldLike & { checked?: boolean })[] {
    return [
      { name: 'from_city', type: 'text', value: 'München' },
      { name: 'direction', type: 'radio', value: 'tur', checked: false },
      { name: 'direction', type: 'radio', value: 'retur', checked: true },
      { name: 'service_types', type: 'checkbox', value: 'pe_sens', checked: true },
      { name: 'service_types', type: 'checkbox', value: 'expres', checked: false },
      { name: 'notes', type: 'textarea', value: 'Fără grabă' },
      { name: 'listing_id', type: 'hidden', value: 'abc' },
      { name: 'password', type: 'password', value: 'secret' },
      { name: 'photo', type: 'file', value: 'C:\\fakepath\\a.jpg' },
    ];
  }

  it('reads what the person set, never what the page set, a password or a file', () => {
    const values = readFields(fields());
    expect(values).toEqual({
      from_city: 'München',
      direction: 'retur',
      service_types: ['pe_sens'],
      notes: 'Fără grabă',
    });
  });

  it('writes a draft back, radios and checkboxes included', () => {
    const target = fields();
    const applied = writeFields(target, {
      from_city: 'Graz',
      direction: 'tur',
      service_types: ['expres'],
      listing_id: 'forged',
    });
    expect(applied).toBe(5);
    expect(target[0]!.value).toBe('Graz');
    expect(target[1]!.checked).toBe(true);
    expect(target[2]!.checked).toBe(false);
    expect(target[3]!.checked).toBe(false);
    expect(target[4]!.checked).toBe(true);
    // A hidden field is the page's, and a draft never writes it.
    expect(target[6]!.value).toBe('abc');
  });

  it('lets only a map of strings back in from storage', () => {
    expect(parseFieldValues({ a: 'x', b: ['y'] })).toEqual({ a: 'x', b: ['y'] });
    expect(parseFieldValues({ a: 1 })).toBeNull();
    expect(parseFieldValues([])).toBeNull();
    expect(parseFieldValues(null)).toBeNull();
  });

  it('compares without caring about order, and treats absent as empty', () => {
    expect(sameFieldValues({ a: ['1', '2'] }, { a: ['2', '1'] })).toBe(true);
    expect(sameFieldValues({ a: '' }, {})).toBe(true);
    expect(sameFieldValues({ a: 'x' }, { a: 'y' })).toBe(false);
  });
});
