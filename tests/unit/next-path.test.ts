import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT, safeNextPath, signInUrlFor } from '@/lib/auth/next-path';

const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(127);

describe('safeNextPath — accepts internal paths', () => {
  it.each([
    '/cont',
    '/cont/profil',
    '/cont/firma/membri',
    '/cont?tab=documente',
    '/cont/firma#verificare',
    '/cerere/noua?tip=transport&sursa=email',
    '/a',
  ])('keeps %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });
});

describe('safeNextPath — rejects anything that leaves the origin', () => {
  it.each([
    ['protocol-relative', '//evil.example'],
    ['protocol-relative with path', '//evil.example/cont'],
    ['backslash escape', '/\\evil.example'],
    ['leading backslash', '\\\\evil.example'],
    ['absolute https', 'https://evil.example/cont'],
    ['absolute http', 'http://evil.example'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>'],
    ['mailto', 'mailto:someone@example.com'],
    ['scheme uppercase', 'HTTPS://evil.example'],
    ['bare host', 'evil.example/cont'],
    ['relative path', 'cont/profil'],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects %s', (_label, path) => {
    expect(safeNextPath(path)).toBe(DEFAULT_NEXT);
  });

  it('rejects a whitespace-smuggled protocol-relative URL', () => {
    // Browsers strip tab, LF and CR from URLs, so each of these would
    // actually navigate to //evil.example.
    expect(safeNextPath(`/${TAB}/evil.example`)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(`/${LF}/evil.example`)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(`/${CR}/evil.example`)).toBe(DEFAULT_NEXT);
  });

  it('rejects an encoded protocol-relative URL', () => {
    expect(safeNextPath('/%2f%2fevil.example')).toBe(DEFAULT_NEXT);
    expect(safeNextPath('/%2F%2Fevil.example')).toBe(DEFAULT_NEXT);
  });

  it('rejects an encoded scheme', () => {
    expect(safeNextPath('%6a%61%76%61%73%63%72%69%70%74%3aalert(1)')).toBe(
      DEFAULT_NEXT,
    );
  });

  it('rejects control characters', () => {
    expect(safeNextPath(`/cont${NUL}/profil`)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(`/cont${DEL}`)).toBe(DEFAULT_NEXT);
  });

  it('rejects non-strings', () => {
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(42 as unknown as string)).toBe(DEFAULT_NEXT);
  });

  it('never throws on malformed percent-encoding', () => {
    expect(() => safeNextPath('/cont/%E0%A4%A')).not.toThrow();
    expect(safeNextPath('/cont/%E0%A4%A')).toBe('/cont/%E0%A4%A');
  });
});

describe('safeNextPath — custom fallback', () => {
  it('uses the given fallback', () => {
    expect(safeNextPath('https://evil.example', '/acasa')).toBe('/acasa');
    expect(safeNextPath('', '')).toBe('');
  });
});

describe('signInUrlFor', () => {
  it('carries the path the user was trying to reach', () => {
    expect(signInUrlFor('/cont/firma/membri')).toBe(
      '/autentificare?next=%2Fcont%2Ffirma%2Fmembri',
    );
  });

  it('carries the query string too', () => {
    expect(signInUrlFor('/cont/firma', '?tab=membri')).toBe(
      '/autentificare?next=%2Fcont%2Ffirma%3Ftab%3Dmembri',
    );
  });

  it('omits next when the destination is already the default', () => {
    expect(signInUrlFor('/cont')).toBe('/autentificare');
  });

  it('omits next when the destination cannot be trusted', () => {
    expect(signInUrlFor('//evil.example')).toBe('/autentificare');
  });
});
