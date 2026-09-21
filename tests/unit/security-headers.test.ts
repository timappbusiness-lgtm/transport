import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '@/lib/security-headers';

/**
 * Antetele, fixate.
 *
 * Testele astea nu descriu bune practici, descriu ce s-a găsit lipsă în
 * `docs/12-audit-securitate.md`, R2. Fiecare așteptare de aici are în
 * spate un atac pe care îl oprește, nu o listă dintr-un articol.
 */

const URL = 'https://ytwzydilyiekhexnpziu.supabase.co';

function valueOf(key: string, url: string | undefined = URL): string {
  const header = securityHeaders(url).find((h) => h.key === key);
  expect(header, `${key} lipsește cu totul`).toBeDefined();
  return header!.value;
}

describe('antetele de securitate', () => {
  it('refuză încadrarea în iframe, în două feluri', () => {
    // frame-ancestors este cel care contează; X-Frame-Options este
    // pentru browserele care încă nu îl citesc. Amândouă, pentru că
    // clickjacking pe „Acceptă oferta" costă bani reali.
    expect(contentSecurityPolicy(URL)).toContain("frame-ancestors 'none'");
    expect(valueOf('X-Frame-Options')).toBe('DENY');
  });

  it('nu lasă un formular al nostru să se trimită în altă parte', () => {
    expect(contentSecurityPolicy(URL)).toContain("form-action 'self'");
  });

  it('nu lasă pe nimeni să rescrie baza legăturilor relative', () => {
    expect(contentSecurityPolicy(URL)).toContain("base-uri 'self'");
  });

  it('scoate pluginurile cu totul', () => {
    expect(contentSecurityPolicy(URL)).toContain("object-src 'none'");
  });

  it('trimite numai originea către alt domeniu, nu URL-ul întreg', () => {
    // Un URL de comandă sau de conversație are id-ul în el. Nu are ce
    // căuta în logul altcuiva.
    expect(valueOf('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('închide camera, microfonul și localizarea', () => {
    const value = valueOf('Permissions-Policy');
    for (const feature of ['camera=()', 'microphone=()', 'geolocation=()']) {
      expect(value).toContain(feature);
    }
  });

  it('cere HTTPS doi ani înainte, fără preload', () => {
    const value = valueOf('Strict-Transport-Security');
    expect(value).toContain('max-age=63072000');
    expect(value).toContain('includeSubDomains');
    // Preload se cere o dată și se scoate greu. Domeniul încă se poate
    // schimba, deci nu.
    expect(value).not.toContain('preload');
  });

  it('opreşte ghicitul tipului de fișier', () => {
    expect(valueOf('X-Content-Type-Options')).toBe('nosniff');
  });

  it('lasă pagina să vorbească numai cu noi și cu Supabase', () => {
    const csp = contentSecurityPolicy(URL);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`connect-src 'self' ${URL} wss://ytwzydilyiekhexnpziu.supabase.co`);
  });

  it('și fără Supabase configurat nu scrie un connect-src stricat', () => {
    const csp = contentSecurityPolicy(undefined);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('connect-src ;');
    expect(csp).not.toContain('  ');
  });

  it('spune pe față care este partea slabă', () => {
    // 'unsafe-inline' pe script-src este o alegere, nu o scăpare: Next
    // injectează scripturi inline, iar alternativa cu nonce cere randare
    // dinamică pe fiecare pagină. Testul există ca schimbarea ei să fie
    // deliberată, nu tăcută.
    expect(contentSecurityPolicy(URL)).toContain("script-src 'self' 'unsafe-inline'");
  });
});
