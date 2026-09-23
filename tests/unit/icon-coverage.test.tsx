import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardRequestCard } from '@/components/requests/board-card';
import { RequestCard } from '@/components/requests/request-card';
import type { PublicRequest } from '@/lib/requests';
import { CARGO_CATEGORIES } from '@/lib/departures';

/**
 * That an icon actually reaches the markup.
 *
 * `icons.test.ts` checks the map, which is a different thing: the map was
 * complete and correct the whole time the site had no visible icons on
 * it. Four components used it, at a size nobody could see, and every
 * check passed. So this file renders the components and looks at what
 * came out.
 *
 * The Playwright half — that a screen has them once it is served — is in
 * `tests/e2e/iconuri.spec.ts`. This half runs without a database, which
 * is why the card checks live here: on a build with no Supabase the
 * board renders empty and a browser sees no cards at all.
 */

const NOW = new Date('2026-09-17T12:00:00.000Z');

function request(over: Partial<PublicRequest> = {}): PublicRequest {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'autoturism',
    make: 'Opel',
    model: 'Combo',
    year: 2019,
    is_running: true,
    service_type: 'pe_sens',
    from_city: 'Mizil',
    from_country: 'RO',
    to_city: 'Pamplona',
    to_country: 'ES',
    estimated_km: 2970,
    published_at: '2026-09-17T11:54:00.000Z',
    board: 'retur',
    loading_from: '2026-09-25',
    loading_to: null,
    weight_kg: 1400,
    needs_winch: false,
    photo_count: 0,
    is_domestic: false,
    from_county: null,
    to_county: null,
    from_lat: null,
    from_lng: null,
    to_lat: null,
    to_lng: null,
    ...over,
  };
}

/** Every `<svg>` in a fragment of markup, with its width and classes. */
function glyphs(html: string): { width: number; cls: string }[] {
  return [...html.matchAll(/<svg\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    const width = Number(/width="(\d+)"/.exec(tag)?.[1] ?? '0');
    return { width, cls: /class="([^"]*)"/.exec(tag)?.[1] ?? '' };
  });
}

describe('a card without an icon is a bug', () => {
  it('the board card draws one', () => {
    const html = renderToStaticMarkup(
      <ul>
        <BoardRequestCard request={request()} now={NOW} />
      </ul>,
    );
    expect(glyphs(html).length, 'the board card rendered no svg at all').toBeGreaterThan(0);
  });

  it('the homepage card draws one', () => {
    const html = renderToStaticMarkup(
      <ul>
        <RequestCard request={request()} now={NOW} />
      </ul>,
    );
    expect(glyphs(html).length, 'the homepage card rendered no svg at all').toBeGreaterThan(0);
  });

  it('for every category the enum can hold, retired ones included', () => {
    // A listing published under `camion` is a real listing and still
    // renders on the board.
    for (const category of CARGO_CATEGORIES) {
      const html = renderToStaticMarkup(
        <ul>
          <BoardRequestCard request={request({ category })} now={NOW} />
        </ul>,
      );
      expect(glyphs(html).length, `${category}: no icon on the card`).toBeGreaterThan(0);
    }
  });

  it('at a size somebody can see, not the 13px that started this', () => {
    const html = renderToStaticMarkup(
      <ul>
        <BoardRequestCard request={request()} now={NOW} />
      </ul>,
    );
    for (const glyph of glyphs(html)) {
      expect(glyph.width, `an icon ${glyph.width}px wide is decoration nobody sees`).toBeGreaterThanOrEqual(15);
    }
  });

  it('and in ink rather than the same grey as the label beside it', () => {
    // The card's category row is 10px uppercase `text-muted`. An icon
    // inheriting that colour is the bug that was reported; `tone="strong"`
    // is what makes it readable.
    const html = renderToStaticMarkup(
      <ul>
        <BoardRequestCard request={request()} now={NOW} />
      </ul>,
    );
    expect(html).toContain('text-foreground');
  });
});

describe('only one file may name lucide', () => {
  /**
   * The rule `docs/13-iconuri.md` states and the code did not follow.
   *
   * Twenty files imported `lucide-react` directly, each with its own
   * size and stroke, and two of them drew a shield beside a company name
   * — the exact example the document uses. A direct import is how an
   * icon gets onto a page without passing any of the rules, so the
   * import itself is what this forbids.
   */
  const ALLOWED = new Set(['src/lib/icons.ts', 'src/components/ui/icon.tsx']);

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(path));
      else if (/\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it('and every other file goes through the map', () => {
    const offenders = sources('src').filter(
      (file) => !ALLOWED.has(file) && readFileSync(file, 'utf8').includes("from 'lucide-react'"),
    );
    expect(offenders, `these import lucide directly:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the map itself imports no shield', () => {
    // A shield is the shape people read as a verification badge, and
    // `docs/13-iconuri.md` forbids anything that could. Checked on the
    // import list rather than on every file, because „Shield" is also
    // the name of the compliance section in the company profile —
    // `scutul de conformitate` is copy, not a glyph.
    const map = readFileSync('src/lib/icons.ts', 'utf8');
    const imports = map.slice(0, map.indexOf("} from 'lucide-react';"));
    expect(imports, 'a shield is back in the icon map').not.toMatch(/\bShield\w*,/);
  });
});
