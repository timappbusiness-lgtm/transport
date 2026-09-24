import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { departuresCopy } from '@/content/departures';
import { FEATURES } from '@/lib/features';
import {
  FOOTER_NAV,
  PLATFORM_LINKS,
  buildNav,
  headerBar,
  headerMenu,
  type NavContext,
} from '@/lib/navigation';

/**
 * Two things are published on the platform, and each has one name.
 *
 * What a client publishes is a „cerere de transport"; the board of them
 * is „Cereri de transport". What a carrier publishes is a „traseu"; the
 * board of them is „Trasee disponibile". The same words in the menu, on
 * the page, in the e-mail and in the empty state.
 *
 * Never „anunț" for either. The competitor calls both sides „anunțuri",
 * and a dispatcher looking at a list of „anunțuri" cannot tell whether
 * they are looking at work to bid on or capacity to book — which is the
 * whole confusion this platform set out not to have. And never „plecare"
 * for a route: it was the old name, and three names for one thing is
 * two too many.
 *
 * The scan reads the string literals of every copy file and of the
 * e-mail templates. Code comments are skipped: they are for us. The one
 * „anunț" that stays is the vehicle sale ad that /admin/import reads —
 * a different thing, on a classifieds site — and the legal documents,
 * which change only as a new version.
 */

const CONTENT_DIR = join(process.cwd(), 'src', 'content');
const TEMPLATES = join(process.cwd(), 'supabase', 'functions', 'outbox-dispatcher', 'templates.ts');

/** Not scanned: a sale ad is an „anunț", and the legal texts are versioned. */
const SKIP = [/[\\/]legal[\\/]/, /import-anunt\.ts$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** The string literals of a file, comments removed first. */
function literals(path: string): string[] {
  const source = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return [...source.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(
    (match) => match[0].slice(1, -1),
  );
}

const SCANNED = [...files(CONTENT_DIR).filter((path) => !SKIP.some((re) => re.test(path))), TEMPLATES];

/** „anunț", „anunțul", „anunțuri", „anunțurile", „anunțului" — the noun, not the verb „anunțăm". */
const ANUNT = /(?<![a-zăâîșț])anunț(ul|uri|urile|ului)?(?![a-zăâîșț])/i;
/** „plecări", „plecările", „plecarea" — the old name for a route. */
const PLECARE = /(?<![a-zăâîșț])plecăr(i|ile|ilor)(?![a-zăâîșț])|(?<![a-zăâîșț])plecarea(?![a-zăâîșț])/i;

/** The photo taken from the vehicle's sale ad: „din anunț" is exactly right there. */
const SALE_AD = /din anunț/;

describe('one name for each thing that is published', () => {
  it('never calls a request or a route an „anunț"', () => {
    const found = SCANNED.flatMap((path) =>
      literals(path)
        .filter((text) => ANUNT.test(text) && !SALE_AD.test(text))
        .map((text) => `${path.replace(process.cwd(), '')}: „${text}"`),
    );
    expect(found).toEqual([]);
  });

  it('never calls a route a „plecare"', () => {
    const found = SCANNED.flatMap((path) =>
      literals(path)
        .filter((text) => PLECARE.test(text))
        .map((text) => `${path.replace(process.cwd(), '')}: „${text}"`),
    );
    expect(found).toEqual([]);
  });

  it('titles the two boards by their names', () => {
    expect(requestsCopy.board.title).toBe('Cereri de transport');
    expect(departuresCopy.board.title).toBe('Trasee disponibile');
  });

  it('names the two boards the same way in every menu that uses the long name', () => {
    const contexts: NavContext[] = [
      { accountType: 'company', companyType: 'transport', role: 'owner', isStaff: false },
      { accountType: 'company', companyType: 'expeditie', role: 'owner', isStaff: false },
      { accountType: 'company', companyType: 'both', role: 'owner', isStaff: false },
      { accountType: 'individual', companyType: null, role: null, isStaff: false },
      { accountType: 'company', companyType: null, role: null, isStaff: false },
    ];
    const NAMES: Record<string, string> = {
      [ROUTES.requests]: 'Cereri de transport',
      [ROUTES.routes]: 'Trasee disponibile',
    };
    const items = [
      ...FOOTER_NAV,
      ...PLATFORM_LINKS,
      ...contexts.flatMap((ctx) => [
        ...buildNav(ctx, FEATURES),
        ...headerBar(ctx),
        ...headerMenu(ctx),
      ]),
    ];
    for (const item of items) {
      const name = NAMES[item.href];
      if (name !== undefined) expect(item.label, item.href).toBe(name);
    }
  });

  it('titles each board page by its name', () => {
    const requests = readFileSync('src/app/cereri/(panou)/page.tsx', 'utf8');
    const routes = readFileSync('src/app/trasee/(panou)/page.tsx', 'utf8');
    expect(requests).toMatch(/title: 'Cereri de transport'/);
    expect(routes).toMatch(/title: 'Trasee disponibile'/);
  });

  it('names a carrier\'s own list the way the menu does', () => {
    expect(departuresCopy.mine.title).toBe('Traseele mele');
  });
});
