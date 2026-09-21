/**
 * Antetele de securitate, într-un loc care se poate testa.
 *
 * Erau zero. Auditul le-a numit R2: fără `frame-ancestors`, `/cont/*` se
 * pune într-un iframe pe un site oarecare și se apasă butoanele care
 * contează; fără `Referrer-Policy`, fiecare navigare spre exterior duce
 * URL-ul întreg, iar URL-urile noastre au în ele id-uri de cereri, de
 * comenzi și de conversații.
 *
 * **Despre `script-src`.** Are `'unsafe-inline'`, și merită spus de ce,
 * nu ascuns. Next injectează scripturi inline pentru hidratare și
 * streaming. Alternativa curată este un nonce pe cerere, dar nonce-ul
 * cere randare dinamică pe fiecare pagină — inclusiv pe cele de
 * marketing, care acum sunt statice. Până când cineva măsoară costul
 * ăla, `script-src` este partea slabă a acestei politici.
 *
 * Restul directivelor nu depind de el și opresc lucruri reale oricum:
 * `object-src 'none'` scoate pluginurile, `base-uri 'self'` oprește
 * rescrierea bazei pentru toate legăturile relative, `form-action
 * 'self'` oprește trimiterea unui formular al nostru către alt domeniu,
 * `frame-ancestors 'none'` oprește clickjacking-ul.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * De unde are voie pagina să ceară date.
 *
 * Supabase se dă din afară pentru că URL-ul proiectului diferă între
 * previzualizare și producție, iar un `*` acolo ar anula rostul.
 */
export function contentSecurityPolicy(supabaseUrl: string | undefined): string {
  const supabase = typeof supabaseUrl === 'string' && supabaseUrl !== '' ? supabaseUrl : '';
  const wss = supabase.replace(/^https:/, 'wss:');

  const connect = ['\'self\'', supabase, wss].filter((source) => source !== '').join(' ');

  return [
    "default-src 'self'",
    // Vezi nota din capul fișierului despre 'unsafe-inline'.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // `data:` pentru previzualizarea pozei înainte de încărcare, `blob:`
    // pentru cea din formular; ambele sunt ale paginii, nu ale nimănui.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function securityHeaders(supabaseUrl: string | undefined): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(supabaseUrl) },
    // Doi ani, cu subdomenii. `preload` lipsește intenționat: se cere o
    // dată și se scoate greu, iar domeniul încă se poate schimba.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Dublura lui frame-ancestors, pentru browserele care încă nu îl citesc.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Originea, nu calea: un URL de comandă nu are ce căuta în logul
    // altcuiva, dar analiticele au nevoie să știe că traficul vine de la noi.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
  ];
}
