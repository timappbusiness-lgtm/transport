import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnpcBadges, SalBadge, SolBadge } from '@/components/layout/anpc-badges';
import { CONSUMER_REDRESS, redressEntry, redressName } from '@/config/consumer-redress';
import { contrast } from './contrast.test';

/**
 * The ANPC badges in the footer: the authority's colours, kept to the two
 * badges, and each badge one link that says where it goes.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');
const BADGES = 'src/components/layout/anpc-badges.tsx';

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match) throw new Error(`--color-${name} missing`);
  return match[1]!.toLowerCase();
}

describe('the ANPC colours', () => {
  it('are the blue sampled from the official badges and plain white', () => {
    expect(token('anpc-blue')).toBe('#292b6e');
    expect(token('anpc-paper')).toBe('#ffffff');
  });

  it('are used by the two badges and by nothing else', () => {
    const users = sources('src').filter(
      (file) => file !== 'src/app/globals.css' && /anpc-(?:blue|paper)/.test(readFileSync(file, 'utf8')),
    );
    expect(users).toEqual([BADGES]);
    const badges = readFileSync(BADGES, 'utf8');
    expect(badges).toMatch(/export function SolBadge/);
    expect(badges).toMatch(/export function SalBadge/);
  });

  it('exist as values in the stylesheet only', () => {
    const holders = sources('src').filter((file) => /#292b6e/i.test(readFileSync(file, 'utf8')));
    expect(holders).toEqual(['src/app/globals.css']);
  });

  it('and the badges borrow none of ours: no accent, no surface, no ink as a colour', () => {
    const classes = readFileSync(BADGES, 'utf8');
    expect(classes).not.toMatch(/\b(?:bg|text|border|fill|stroke)-(?:accent|surface|foreground|muted|ground|background)/);
  });

  it('read on each other at the AAA floor, both ways', () => {
    expect(contrast(token('anpc-blue'), token('anpc-paper'))).toBeGreaterThanOrEqual(7);
  });
});

describe('the badges', () => {
  const html = renderToStaticMarkup(<AnpcBadges />);

  it('are two, SOL then SAL, as on the official sites', () => {
    expect(CONSUMER_REDRESS.map((e) => e.key)).toEqual(['sol', 'sal']);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html.indexOf('data-redress="sol"')).toBeLessThan(html.indexOf('data-redress="sal"'));
  });

  it.each(CONSUMER_REDRESS.map((e) => [e.key, e] as const))(
    '%s is one link to the official page, in a new tab, telling nothing back',
    (_key, entry) => {
      const link = new RegExp(`<a [^>]*data-redress="${entry.key}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(link).toContain(`href="${entry.href}"`);
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain(`aria-label="${redressName(entry)} (se deschide într-o filă nouă)"`);
      // A visible focus ring, not the browser default that a reset may take away.
      expect(link).toContain('focus-visible:outline-2');
    },
  );

  it('are named by their wording and the authority', () => {
    expect(redressName(redressEntry('sol'))).toBe('Soluționarea online a litigiilor — ANPC');
    expect(redressName(redressEntry('sal'))).toBe('Soluționarea alternativă a litigiilor — ANPC');
  });

  it('print the wording on two lines and a DETALII pill, hidden from a screen reader so nothing is read twice', () => {
    for (const entry of CONSUMER_REDRESS) {
      const one = renderToStaticMarkup(
        entry.key === 'sal' ? <SalBadge entry={entry} /> : <SolBadge entry={entry} />,
      );
      expect(one).toContain('aria-hidden="true"');
      expect(one).toContain('>a litigiilor</span>');
      // One sentence when the markup is read as text, not two words glued.
      const text = one.replace(/<[^>]+>/g, '');
      expect(text.toLowerCase()).toContain(entry.label.toLowerCase());
      expect(one).toContain('>Detalii</span>');
      expect(one).toContain('uppercase');
    }
  });

  it('SAL carries the authority on its left, behind a rule; SOL does not', () => {
    const sal = renderToStaticMarkup(<SalBadge entry={redressEntry('sal')} />);
    const sol = renderToStaticMarkup(<SolBadge entry={redressEntry('sol')} />);
    expect(sal).toMatch(/border-r-2 border-anpc-blue[^>]*>ANPC</);
    expect(sol).not.toContain('>ANPC<');
  });

  it('draw no copy of the coat of arms: no image, no drawing, until the official file is added', () => {
    expect(html).not.toMatch(/<svg|<img/);
    for (const entry of CONSUMER_REDRESS) expect(entry.badge).toBeNull();
  });

  it('once the official file is in public/, show it as decoration inside the same link', () => {
    const official = { ...redressEntry('sal'), badge: { src: '/anpc/sal.png', width: 250 as const, height: 50 as const } };
    const one = renderToStaticMarkup(<SalBadge entry={official} />);
    expect(one).toMatch(/<img[^>]*alt=""/);
    expect(one).toContain('/anpc/sal.png');
    expect(one).toContain(`aria-label="${redressName(official)} (se deschide într-o filă nouă)"`);
  });
});

describe('the two addresses', () => {
  it('SAL is the ANPC complaints platform since Order 270/2026', () => {
    expect(redressEntry('sal').href).toBe('https://reclamatiisal.anpc.ro/');
    expect(redressEntry('sal').closedOn).toBeNull();
  });

  it('SOL is the old Commission address, and the entry says the platform closed', () => {
    // Shown on the owner's decision; the date travels with it so nobody
    // mistakes it for a live service. docs/09-verificare-juridica.md, item 13.
    expect(redressEntry('sol').href).toBe('https://ec.europa.eu/consumers/odr');
    expect(redressEntry('sol').closedOn).toBe('2025-07-20');
  });
});
