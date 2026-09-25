import { describe, expect, it } from 'vitest';
import { HOMEPAGE_FAQ_COUNT, buildFaq, homepageFaq, joinRo, type FaqInput } from '@/lib/faq';
import type { Plan } from '@/lib/plans';
import type { PublicRequirement } from '@/lib/trust';

/**
 * The FAQ answers questions about rules the platform enforces. An answer
 * assembled from the wrong rows tells a carrier to obtain a document they
 * do not need, or states a price nobody set — so these check the sentences,
 * not the layout.
 */

function requirement(over: Partial<PublicRequirement> = {}): PublicRequirement {
  return {
    scope: 'company',
    kind: 'licenta_comunitara',
    label_ro: 'Licență comunitară',
    for_company_types: null,
    for_vehicle_types: null,
    excluded_vehicle_types: null,
    is_blocking: true,
    has_expiry: true,
    grace_days: 0,
    reminder_days: [30, 14, 7, 1],
    ...over,
  };
}

const REQUIREMENTS: PublicRequirement[] = [
  requirement({ kind: 'certificat_inregistrare_onrc', label_ro: 'Certificat ONRC', has_expiry: false }),
  requirement({ kind: 'licenta_comunitara', for_company_types: ['transport'] }),
  requirement({
    kind: 'certificat_casa_expeditii',
    label_ro: 'Certificat casă de expediții',
    for_company_types: ['expeditie'],
  }),
  requirement({ kind: 'asigurare_cmr', label_ro: 'Asigurare CMR', grace_days: 15 }),
  requirement({ kind: 'itp', label_ro: 'ITP', scope: 'vehicle' }),
  requirement({
    kind: 'copie_conforma',
    label_ro: 'Copie conformă',
    scope: 'vehicle',
    excluded_vehicle_types: ['autoutilitara_3_5t'],
  }),
];

const PLAN: Plan = {
  code: 'carrier',
  name: 'Transportator',
  description: null,
  audience: 'carrier',
  monthlyPrice: 149,
  highlight: true,
  features: [
    { key: 'routes', label: 'Publicare nelimitată', status: 'included' },
    { key: 'promoted', label: 'Anunțuri promovate', status: 'coming_soon' },
  ],
  periods: [{ months: 1, total: 149 }],
  limits: {
    contactsPerMonth: null,
    activeTruckListings: null,
    activeCargoListings: 10,
    savedSearches: 10,
  },
};

function input(over: Partial<FaqInput> = {}): FaqInput {
  return {
    requirements: REQUIREMENTS,
    plan: PLAN,
    trialDays: 30,
    vatLabel: null,
    reviewTimeLabel: 'în cel mult o zi lucrătoare',
    ...over,
  };
}

function find(groups: ReturnType<typeof buildFaq>, id: string) {
  return groups.flatMap((g) => g.entries).find((e) => e.id === id);
}

describe('which documents the answer names', () => {
  it('separates what every firm brings from what only a carrier brings', () => {
    const answer = find(buildFaq(input()), 'documente-inscriere')?.answer.join(' ') ?? '';
    expect(answer).toContain('Pentru orice firmă: Certificat ONRC și Asigurare CMR.');
    expect(answer).toContain('Pentru firmele de transport, în plus: Licență comunitară.');
    expect(answer).toContain('Pentru casele de expediții, în plus: Certificat casă de expediții.');
  });

  it('carries the exemption, so a van owner is not sent for a document they do not need', () => {
    const answer = find(buildFaq(input()), 'documente-inscriere')?.answer.join(' ') ?? '';
    expect(answer).toContain('Copie conformă (nu se cere pentru autoutilitară până în 3,5 t)');
  });

  it('leaves the question out when there are no rules to read', () => {
    expect(find(buildFaq(input({ requirements: [] })), 'documente-inscriere')).toBeUndefined();
  });
});

describe('the price', () => {
  it('states what the database holds, with the trial from the settings', () => {
    const answer = find(buildFaq(input()), 'abonament')?.answer.join(' ') ?? '';
    expect(answer).toContain('costă 149 lei pe lună');
    expect(answer).toContain('Perioada gratuită de 30 de zile');
  });

  it('says whether the price includes VAT, in the words staff wrote', () => {
    // The operator pays VAT. The sentence comes from pricing_settings and
    // follows the price; the FAQ never writes one of its own.
    const answer = find(buildFaq(input({ vatLabel: 'Prețurile nu includ TVA' })), 'abonament')?.answer ?? [];
    expect(answer[1]).toBe('Prețurile nu includ TVA.');
    const silent = find(buildFaq(input({ vatLabel: null })), 'abonament')?.answer.join(' ') ?? '';
    expect(silent).not.toContain('TVA');
  });

  it('lists what the plan includes today, not what is coming', () => {
    const answer = find(buildFaq(input()), 'abonament')?.answer.join(' ') ?? '';
    expect(answer).toContain('publicare nelimitată');
    expect(answer).not.toContain('anunțuri promovate');
  });

  it('uses the Romanian plural for a shorter trial', () => {
    const answer = find(buildFaq(input({ trialDays: 14 })), 'abonament')?.answer.join(' ') ?? '';
    expect(answer).toContain('de 14 zile');
  });

  it('says nothing about a trial that does not exist', () => {
    const answer = find(buildFaq(input({ trialDays: 0 })), 'abonament')?.answer.join(' ') ?? '';
    expect(answer).not.toContain('gratuită');
  });

  it('asks no question it cannot answer: no plan, no price', () => {
    expect(find(buildFaq(input({ plan: null })), 'abonament')).toBeUndefined();
  });
});

describe('what expiry costs', () => {
  it('reads the reminder schedule and the grace period from the rows', () => {
    const answer = find(buildFaq(input()), 'expirare-document')?.answer.join(' ') ?? '';
    expect(answer).toContain('cu 30, 14, 7 și o zi înainte');
    expect(answer).toContain('perioadă de grație de 15 zile');
  });

  it('separates the vehicle from the firm', () => {
    const answer = find(buildFaq(input()), 'expirare-document')?.answer.join(' ') ?? '';
    expect(answer).toContain('vehiculul iese de pe bursă');
    expect(answer).toContain('firma nu mai poate trimite oferte');
    expect(answer).toContain('Contul rămâne al tău');
  });
});

describe('the review time', () => {
  it('is absent when nobody set what we can promise', () => {
    expect(find(buildFaq(input({ reviewTimeLabel: null })), 'durata-verificare')).toBeUndefined();
  });

  it('quotes the label the team set', () => {
    const answer = find(buildFaq(input()), 'durata-verificare')?.answer.join(' ') ?? '';
    expect(answer).toContain('în cel mult o zi lucrătoare');
  });
});

describe('the six the homepage shows', () => {
  it('takes six, in the preferred order', () => {
    const picked = homepageFaq(buildFaq(input()));
    expect(picked).toHaveLength(HOMEPAGE_FAQ_COUNT);
    expect(picked[0]?.id).toBe('cost-cerere');
    expect(new Set(picked.map((e) => e.id)).size).toBe(HOMEPAGE_FAQ_COUNT);
  });

  it('closes the gap when a preferred question was never built', () => {
    const picked = homepageFaq(buildFaq(input({ plan: null })));
    expect(picked.map((e) => e.id)).not.toContain('abonament');
    expect(picked).toHaveLength(HOMEPAGE_FAQ_COUNT);
  });

  it('never invents one: it shows what there is', () => {
    const picked = homepageFaq(buildFaq(input({ requirements: [], plan: null, reviewTimeLabel: null })));
    expect(picked.length).toBeLessThanOrEqual(HOMEPAGE_FAQ_COUNT);
    expect(picked.length).toBeGreaterThan(0);
  });
});

describe('the questions groups carry', () => {
  it('puts the client questions and the carrier questions in their own group', () => {
    const groups = buildFaq(input());
    expect(groups.map((g) => g.id)).toEqual(['clienti', 'transportatori']);
    expect(groups[0]?.entries.some((e) => e.id === 'acte-vehicul')).toBe(true);
    expect(groups[1]?.entries.some((e) => e.id === 'lista-publica')).toBe(true);
  });

  it('lists only the vehicle categories the forms offer', () => {
    const answer = find(buildFaq(input()), 'vehicule')?.answer.join(' ') ?? '';
    expect(answer).toContain('autoturism');
    expect(answer).toContain('vehicul care nu pornește');
    expect(answer).not.toContain('camion');
  });
});

describe('the Romanian list', () => {
  it('puts "și" before the last item', () => {
    expect(joinRo(['a', 'b', 'c'])).toBe('a, b și c');
    expect(joinRo(['a'])).toBe('a');
    expect(joinRo([])).toBe('');
  });
});
