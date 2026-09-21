import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nimic secret în ce pleacă spre browser.
 *
 * Auditul nu a găsit nimic — dar „nu am găsit" este o stare, nu o
 * garanție. Un `process.env.RESEND_API_KEY` scăpat într-un fișier
 * `'use client'` ajunge în pachet la următorul build, iar de acolo la
 * oricine deschide DevTools.
 *
 * Testul are două jumătăți, pentru că verifică două lucruri diferite:
 *
 * 1. **Sursa** — niciun fișier de client nu citește o variabilă care nu
 *    este `NEXT_PUBLIC_*`. Rulează întotdeauna.
 * 2. **Pachetul** — chunk-urile chiar construite nu conțin ceva care
 *    arată a cheie. Rulează numai dacă există un build; altfel sare,
 *    pentru că un test care cade pentru că nimeni nu a dat `pnpm build`
 *    este un test pe care lumea învață să îl ignore.
 */

const CLIENT_DIR = 'src';
const BUNDLE_DIR = '.next/static';

/** Numele care nu au ce căuta niciodată în browser. */
const SECRET_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'VAPID_PRIVATE_KEY',
  'IMPORT_IP_SALT',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
];

/** Forme care arată a cheie oriunde le-ai vedea. */
const SECRET_SHAPES: readonly [string, RegExp][] = [
  ['cheie Stripe live', /\bsk_live_[A-Za-z0-9]{16,}/],
  ['cheie Resend', /\bre_[A-Za-z0-9]{24,}/],
  ['cheie OpenAI', /\bsk-[A-Za-z0-9]{32,}/],
  ['cheie Anthropic', /\bsk-ant-[A-Za-z0-9-]{32,}/],
  // Un JWT cu rolul de serviciu în payload. Cheia anon este tot un JWT
  // și este publică prin construcție, deci se caută rolul, nu forma.
  ['JWT cu rol de serviciu', /"role"\s*:\s*"service_role"/],
];

function walk(dir: string, match: (name: string) => boolean): string[] {
  let found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found = found.concat(walk(full, match));
    else if (match(entry)) found.push(full);
  }
  return found;
}

describe('nimic secret nu pleacă spre browser', () => {
  it('niciun fișier de client nu citește o variabilă non-publică', () => {
    const sources = walk(CLIENT_DIR, (name) => /\.(ts|tsx)$/.test(name));
    const offenders: string[] = [];

    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes("'use client'") && !text.includes('"use client"')) continue;

      for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1]!;
        if (!name.startsWith('NEXT_PUBLIC_')) offenders.push(`${file}: ${name}`);
      }
    }

    expect(offenders, `variabile non-publice într-un fișier de client:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('și niciun nume de secret nu apare într-un fișier de client', () => {
    const sources = walk(CLIENT_DIR, (name) => /\.(ts|tsx)$/.test(name));
    const offenders: string[] = [];

    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes("'use client'") && !text.includes('"use client"')) continue;
      // Acest fișier de test enumeră numele ca date, nu le folosește.
      if (file.includes('bundle-secrets')) continue;

      for (const name of SECRET_NAMES) {
        if (text.includes(name)) offenders.push(`${file}: ${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('pachetul construit nu conține nimic în formă de cheie', () => {
    const chunks = walk(BUNDLE_DIR, (name) => name.endsWith('.js'));
    if (chunks.length === 0) {
      // Fără build nu este nimic de verificat. Se sare, nu se cade:
      // altfel testul devine zgomot pe care lumea învață să îl ignore.
      expect(chunks).toEqual([]);
      return;
    }

    const offenders: string[] = [];
    for (const chunk of chunks) {
      const text = readFileSync(chunk, 'utf8');
      for (const name of SECRET_NAMES) {
        if (text.includes(name)) offenders.push(`${chunk}: numele ${name}`);
      }
      for (const [label, shape] of SECRET_SHAPES) {
        if (shape.test(text)) offenders.push(`${chunk}: ${label}`);
      }
    }

    expect(offenders, `în pachet:\n${offenders.join('\n')}`).toEqual([]);
  });
});
