import { describe, expect, it } from 'vitest';
import {
  ADVANCED_OPEN_ON_LOAD,
  advancedStorageKey,
  checkChipDef,
  chipDate,
  chipsFromParams,
  hrefWithout,
  paramsFromSearch,
  periodChipDefs,
  rememberChoice,
  wasLeftOpen,
} from '@/lib/filter-disclosure';

/** sessionStorage, as far as the panel uses it. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

/** A private window, or storage the browser has blocked: every call throws. */
const throwingStorage = {
  getItem: () => {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('full', 'QuotaExceededError');
  },
  removeItem: () => {
    throw new DOMException('blocked', 'SecurityError');
  },
};

describe('„Mai multe filtre" is closed by default', () => {
  it('closed on the first paint, on every screen', () => {
    expect(ADVANCED_OPEN_ON_LOAD).toBe(false);
  });

  it('a fresh visit — nothing in this session — stays closed', () => {
    expect(wasLeftOpen(fakeStorage(), 'cereri')).toBe(false);
    expect(wasLeftOpen(null, 'cereri')).toBe(false);
  });

  it('closed whatever the address carries: the rule has no input for it', () => {
    // The whole API that can open the panel takes a storage and a screen.
    // There is no parameter through which active filters could open it.
    expect(wasLeftOpen.length).toBe(2);
  });
});

describe('session memory', () => {
  it('opening is remembered for the rest of the session, on that screen', () => {
    const storage = fakeStorage();
    rememberChoice(storage, 'cereri', true);
    expect(wasLeftOpen(storage, 'cereri')).toBe(true);
    expect(storage.data.get(advancedStorageKey('cereri'))).toBe('deschis');
  });

  it('closing forgets it, rather than writing „closed" down', () => {
    const storage = fakeStorage();
    rememberChoice(storage, 'cereri', true);
    rememberChoice(storage, 'cereri', false);
    expect(wasLeftOpen(storage, 'cereri')).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('one screen says nothing about another', () => {
    const storage = fakeStorage();
    rememberChoice(storage, 'cereri', true);
    expect(wasLeftOpen(storage, 'trasee')).toBe(false);
    expect(wasLeftOpen(storage, 'admin-oferte')).toBe(false);
    expect(advancedStorageKey('cereri')).not.toBe(advancedStorageKey('trasee'));
  });

  it('only its own value opens it: anything else in the key is ignored', () => {
    for (const value of ['true', '1', 'inchis', '']) {
      const storage = fakeStorage({ [advancedStorageKey('cereri')]: value });
      expect(wasLeftOpen(storage, 'cereri')).toBe(false);
    }
  });

  it('blocked storage: closed, and toggling never throws', () => {
    expect(wasLeftOpen(throwingStorage, 'cereri')).toBe(false);
    expect(() => rememberChoice(throwingStorage, 'cereri', true)).not.toThrow();
    expect(() => rememberChoice(throwingStorage, 'cereri', false)).not.toThrow();
    expect(() => rememberChoice(null, 'cereri', true)).not.toThrow();
  });
});

describe('chip addresses', () => {
  it('drops the named keys and the page, keeps the rest', () => {
    expect(
      hrefWithout('/firme', { q: 'Trans', judet: 'Cluj', acoperire: 'intern', pagina: '3' }, [
        'acoperire',
      ]),
    ).toBe('/firme?q=Trans&judet=Cluj');
  });

  it('back to the bare list when nothing is left', () => {
    expect(hrefWithout('/firme', { acoperire: 'intern' }, ['acoperire'])).toBe('/firme');
  });

  it('knows a list whose page key is „p"', () => {
    expect(
      hrefWithout('/admin/oferte', { stare: 'pending', 'de-la': '2026-09-01', p: '2' }, ['de-la'], 'p'),
    ).toBe('/admin/oferte?stare=pending');
  });

  it('reads the first of a repeated key and skips empty ones', () => {
    expect(hrefWithout('/x', { a: ['1', '2'], b: '  ', c: undefined, d: 'x' }, ['d'])).toBe('/x?a=1');
  });
});

describe('chips from plain params', () => {
  const defs = [
    ...periodChipDefs('De la', 'Până la'),
    checkChipDef('ascunse', 'Doar ascunse'),
  ];

  it('one chip per set filter, in the definitions’ order, each removing only itself', () => {
    const params = {
      stare: 'active',
      ascunse: 'da',
      'pana-la': '2026-09-30',
      'de-la': '2026-09-01',
      pagina: '4',
    };
    const chips = chipsFromParams('/admin/anunturi', params, defs);
    expect(chips.map((c) => c.id)).toEqual(['de-la', 'pana-la', 'ascunse']);
    expect(chips.map((c) => c.label)).toEqual([
      'De la: 01.09.2026',
      'Până la: 30.09.2026',
      'Doar ascunse',
    ]);
    expect(chips[0]?.href).toBe('/admin/anunturi?stare=active&ascunse=da&pana-la=2026-09-30');
    expect(chips[2]?.href).toBe(
      '/admin/anunturi?stare=active&pana-la=2026-09-30&de-la=2026-09-01',
    );
  });

  it('no chip for a main field, or for a checkbox that is not ticked', () => {
    expect(chipsFromParams('/x', { stare: 'active', ascunse: 'nu' }, defs)).toEqual([]);
  });

  it('the validated filters, not the raw address, are what chips come from', () => {
    expect(paramsFromSearch('?stare=pending&de-la=2026-09-01')).toEqual({
      stare: 'pending',
      'de-la': '2026-09-01',
    });
    expect(paramsFromSearch('')).toEqual({});
  });

  it('dates read the Romanian way', () => {
    expect(chipDate('2026-09-24')).toBe('24.09.2026');
    expect(chipDate('ieri')).toBe('ieri');
  });
});
