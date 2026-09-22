import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARGO_CATEGORIES } from '@/lib/departures';
import { ORDER_STEPS } from '@/lib/orders';
import {
  CATEGORY_ICONS,
  CONTENT_ICONS,
  CONTENT_LABELS,
  EQUIPMENT_ICONS,
  ICON_MAPS,
  ICON_SIZES,
  ICON_STROKE,
  ORDER_STEP_ICONS,
  SERVICE_ICONS,
  STATUS_ICONS,
  STATUS_LABELS,
  iconForContent,
  iconForEquipment,
  iconForOrderStep,
  iconForService,
} from '@/lib/icons';

/**
 * The icon map, checked both ways.
 *
 * A value with no icon renders as a gap. An icon mapped to a value that
 * no longer exists is dead weight that looks maintained. Both are quiet,
 * so both fail here.
 *
 * The second half of the file is the harder rule: where an icon must
 * *not* appear. Legal text, suspension, rejection, disputes, deletion,
 * errors and destructive confirmations get words and nothing else. That
 * is not a style preference — a pictogram next to „Cont suspendat"
 * makes a serious sentence look like a notification, and a shield beside
 * a company name looks like a verification badge somebody earned.
 */

const SEED_EQUIPMENT = [
  'troliu',
  'platforma_hidraulica',
  'rampe',
  'chingi',
  'roti_transport',
  'prelata',
  'remorca_inchisa',
  'cric',
  'robot_pornire',
  'lant_tractare',
];

const SEED_SERVICES = [
  'transport_platforma',
  'tractare',
  'transport_inchis',
  'transport_nefunctional',
  'transport_avariat',
  'transport_motociclete',
  'ridicare_domiciliu',
  'livrare_domiciliu',
  'transport_expres',
  'transport_utilaje',
];

function migrations(): string {
  const dir = 'supabase/migrations';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n');
}

describe('every value has an icon', () => {
  for (const [name, map] of Object.entries(ICON_MAPS)) {
    it(`${name}: no value is left without one`, () => {
      for (const value of map.values) {
        expect(map.icons[value as keyof typeof map.icons], `${name}.${value}`).toBeTruthy();
      }
    });

    it(`${name}: and no icon points at a value that is gone`, () => {
      const known = new Set(map.values as readonly string[]);
      for (const key of Object.keys(map.icons)) {
        expect(known.has(key), `${name}.${key} has an icon but no value`).toBe(true);
      }
    });
  }

  it('covers every category the enum can hold, retired ones included', () => {
    // A listing published under `camion` still renders on the board.
    for (const code of CARGO_CATEGORIES) {
      expect(CATEGORY_ICONS[code], code).toBeTruthy();
    }
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...CARGO_CATEGORIES].sort());
  });

  it('covers every equipment and service option the seed creates', () => {
    for (const code of SEED_EQUIPMENT) expect(iconForEquipment(code), code).toBeTruthy();
    for (const code of SEED_SERVICES) expect(iconForService(code), code).toBeTruthy();
  });

  it('and maps no equipment or service code the seed does not have', () => {
    // The team can add an option from /admin/optiuni without a deploy, so
    // a code with no icon is fine and renders as text. A code here that
    // the seed never had is a typo nobody would otherwise see.
    const sql = migrations();
    for (const code of Object.keys(EQUIPMENT_ICONS)) {
      expect(sql, `equipment ${code}`).toContain(`('${code}'`);
    }
    for (const code of Object.keys(SERVICE_ICONS)) {
      expect(sql, `service ${code}`).toContain(`('${code}'`);
    }
  });

  it('gives every status chip an icon and a label', () => {
    for (const kind of Object.keys(STATUS_LABELS)) {
      expect(STATUS_ICONS[kind as keyof typeof STATUS_ICONS], kind).toBeTruthy();
      expect(STATUS_LABELS[kind as keyof typeof STATUS_LABELS], kind).toBeTruthy();
    }
  });

  it('gives every content type an icon and a label', () => {
    for (const type of Object.keys(CONTENT_LABELS)) {
      expect(iconForContent(type as keyof typeof CONTENT_ICONS), type).toBeTruthy();
    }
    expect(Object.keys(CONTENT_ICONS).sort()).toEqual(Object.keys(CONTENT_LABELS).sort());
  });
});

describe('the order timeline', () => {
  it('has an icon for each of the seven steps', () => {
    for (const step of ORDER_STEPS) {
      expect(iconForOrderStep(step), step).toBeTruthy();
    }
  });

  it('and none for a dispute or a cancellation', () => {
    // A dispute is a serious moment between two firms. The type cannot
    // say „these seven and no others", so this does.
    expect(iconForOrderStep('disputed')).toBeNull();
    expect(iconForOrderStep('cancelled')).toBeNull();
    expect(Object.keys(ORDER_STEP_ICONS).sort()).toEqual([...ORDER_STEPS].sort());
  });
});

describe('one scale, one stroke', () => {
  it('offers three sizes and no more', () => {
    expect(Object.keys(ICON_SIZES)).toEqual(['sm', 'md', 'lg']);
    for (const size of Object.values(ICON_SIZES)) {
      expect(size).toBeGreaterThan(10);
      expect(size).toBeLessThan(28);
    }
  });

  it('and one stroke width', () => {
    expect(ICON_STROKE).toBe(1.75);
  });
});

describe('where an icon must never appear', () => {
  /** Files whose job is a serious moment, or a legal one. */
  const SOLEMN = [
    'src/content/legal.ts',
    'src/app/termeni/page.tsx',
    'src/app/confidentialitate/page.tsx',
    'src/app/cookies/page.tsx',
  ];

  it('not on the legal pages', () => {
    for (const file of SOLEMN) {
      let body: string;
      try {
        body = readFileSync(file, 'utf8');
      } catch {
        continue; // the page may be generated from content elsewhere
      }
      expect(body, `${file} imports lucide`).not.toContain("from 'lucide-react'");
      expect(body, `${file} uses the Icon component`).not.toMatch(/<Icon\b/);
    }
  });

  it('nor beside a suspension, a rejection or a deletion', () => {
    // The banner copy carries these. An icon here turns a sentence a
    // person has to read into a notification they can dismiss.
    const banners = readFileSync('src/components/app/status-banner.tsx', 'utf8');
    for (const word of ['suspended', 'rejected']) {
      // If the file grows an icon next to one of these, this fails and
      // somebody has to argue for it rather than merge it quietly.
      const nearby = new RegExp(`${word}[\\s\\S]{0,400}?<Icon\\b`);
      expect(banners, `an icon appears near "${word}"`).not.toMatch(nearby);
    }
  });

  it('and no emoji anywhere in the interface copy', () => {
    const dir = 'src/content';
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const body = readFileSync(`${dir}/${file}`, 'utf8');
      // Pictographs and dingbats. Flags are two regional-indicator
      // letters, which this catches as well.
      expect(body, `${file} contains an emoji`).not.toMatch(
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u,
      );
    }
  });
});
