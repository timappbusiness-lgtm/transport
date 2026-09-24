import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COVERAGE_COUNTRIES, countryName } from '@/content/firma';
import { CARGO_CATEGORY_LABELS, SERVICE_TYPE_LABELS } from '@/lib/departures';
import { VEHICLE_TYPE_LABELS } from '@/lib/vehicles';
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatMoney,
  formatPlate,
  formatWindow,
} from '../../supabase/functions/contract-pdf/format.ts';
import { CARGO_CATEGORY, COUNTRY, SERVICE_TYPE, VEHICLE_TYPE } from '../../supabase/functions/contract-pdf/labels.ts';
import { contractFacts, TO_BE_FILLED } from '../../supabase/functions/contract-pdf/model.ts';
import { SAMPLE_RENDER_DATA } from '../../supabase/functions/contract-pdf/sample.ts';
import type { RenderData } from '../../supabase/functions/contract-pdf/snapshot.ts';
import { CURRENT_TEMPLATE, templateFor, TEMPLATES } from '../../supabase/functions/contract-pdf/templates/index.ts';

/**
 * The transport contract, before it is drawn: what each value from the
 * snapshot becomes on paper, which model draws which version, and the
 * Romanian formatting of every date, amount and day count.
 *
 * The drawing itself — the text layer of the PDF, the page size, the
 * font — is `contract-pdf.test.ts`.
 */

/** A copy of the sample with some of its snapshot replaced. */
function withSnapshot(patch: (s: RenderData['snapshot']) => RenderData['snapshot'], extra: Partial<RenderData> = {}): RenderData {
  const copy = structuredClone(SAMPLE_RENDER_DATA);
  return { ...copy, ...extra, snapshot: patch(copy.snapshot) };
}

function allText(data: RenderData): string {
  const facts = contractFacts(data);
  const doc = templateFor(facts.templateVersion).build(facts, data.snapshot.generated_at ?? null);
  const parts: string[] = [doc.title, doc.subtitle, doc.footer.left, ...doc.footer.lines];
  for (const row of doc.meta) parts.push(row.label, row.value);
  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
      case 'subheading':
      case 'paragraph':
        parts.push(block.text);
        break;
      case 'notice':
        parts.push(block.title, block.text);
        break;
      case 'rows':
        for (const row of block.rows) parts.push(row.label, row.value);
        break;
      case 'table':
        parts.push(...block.columns, ...block.rows.flat());
        break;
      case 'list':
        parts.push(...block.items);
        break;
    }
  }
  return parts.join('\n');
}

describe('Romanian formatting', () => {
  it('writes amounts with dot thousands, comma decimals and the currency after', () => {
    expect(formatMoney(2400, 'RON')).toBe('2.400,00 lei');
    expect(formatMoney(1234567.5, 'EUR')).toBe('1.234.567,50 EUR');
    expect(formatMoney(999, 'RON')).toBe('999,00 lei');
    expect(formatMoney(0.1 + 0.2, 'RON')).toBe('0,30 lei');
    expect(formatMoney(null, 'RON')).toBeNull();
  });

  it('puts „de" between a number and „zile" where Romanian does', () => {
    expect(formatDays(1)).toBe('1 zi');
    expect(formatDays(2)).toBe('2 zile');
    expect(formatDays(19)).toBe('19 zile');
    expect(formatDays(20)).toBe('20 de zile');
    expect(formatDays(30)).toBe('30 de zile');
    expect(formatDays(101)).toBe('101 zile');
    expect(formatDays(120)).toBe('120 de zile');
    expect(formatDays(null)).toBeNull();
  });

  it('prints a calendar date as itself and an instant as its day in Bucharest', () => {
    expect(formatDate('2026-10-01')).toBe('01.10.2026');
    // 21:30 UTC in September is 00:30 the next day in Bucharest (UTC+3).
    expect(formatDate('2026-09-24T21:30:00Z')).toBe('25.09.2026');
    // And in winter (UTC+2).
    expect(formatDate('2026-12-31T22:30:00+00:00')).toBe('01.01.2027');
    // Postgres writes six fractional digits.
    expect(formatDateTime('2026-09-24T10:30:00.654321+00:00')).toBe('24.09.2026, ora 13:30');
    expect(formatDate('not a date')).toBeNull();
  });

  it('writes a window as one day when both ends are the same day', () => {
    expect(formatWindow('2026-10-01', '2026-10-03')).toBe('între 01.10.2026 și 03.10.2026');
    expect(formatWindow('2026-10-03T06:00:00Z', '2026-10-03T15:00:00Z')).toBe('03.10.2026');
    expect(formatWindow('2026-10-01', null)).toBe('din 01.10.2026');
    expect(formatWindow(null, '2026-10-01')).toBe('până la 01.10.2026');
    expect(formatWindow(null, null)).toBeNull();
  });

  it('spaces a Romanian plate and leaves a foreign one as written', () => {
    expect(formatPlate('MS01TRM')).toBe('MS 01 TRM');
    expect(formatPlate('b 123 abc')).toBe('B 123 ABC');
    expect(formatPlate('M-AB 1234')).toBe('M-AB 1234');
  });
});

describe('the labels the edge function carries, against the application', () => {
  it('names every cargo category as the boards do', () => {
    expect(CARGO_CATEGORY).toEqual(CARGO_CATEGORY_LABELS);
  });

  it('names every service level as the request form does', () => {
    expect(SERVICE_TYPE).toEqual(SERVICE_TYPE_LABELS);
  });

  it('names every vehicle type as the fleet screen does', () => {
    expect(VEHICLE_TYPE).toEqual(VEHICLE_TYPE_LABELS);
  });

  it('names every country as the company profile does, and Romania too', () => {
    for (const { code } of COVERAGE_COUNTRIES) expect(COUNTRY[code], code).toBe(countryName(code));
    expect(COUNTRY.RO).toBe('România');
  });
});

describe('the contract models', () => {
  it('generates with the model the database records', () => {
    // The last migration that defines contract_template_version() decides.
    const dir = 'supabase/migrations';
    let body = '';
    for (const file of readdirSync(dir).sort()) {
      const sql = readFileSync(`${dir}/${file}`, 'utf8');
      const at = sql.indexOf('create or replace function public.contract_template_version()');
      if (at !== -1) body = sql.slice(at, sql.indexOf('$fn$;', at));
    }
    expect(body).toContain(`select '${CURRENT_TEMPLATE}'::text`);
  });

  it('keeps every model it has ever generated with', () => {
    expect(Object.keys(TEMPLATES)).toContain('1.0');
    expect(() => templateFor('0.9')).toThrow();
  });
});

describe('from the snapshot to the facts on the contract', () => {
  const facts = contractFacts(SAMPLE_RENDER_DATA);

  it('states the carrier as the company it is, VAT prefix included', () => {
    expect(facts.carrier.name).toBe('Exemplu Transport Mureș SRL');
    const rows = Object.fromEntries(facts.carrier.rows.map((r) => [r.label, r.value]));
    expect(rows.CUI).toBe('RO12345678');
    expect(rows['Nr. registrul comerțului']).toBe('J26/123/2015');
    expect(rows.Sediul).toBe('Str. Gheorghe Doja nr. 12, Târgu Mureș, jud. Mureș');
    expect(rows['Reprezentant legal']).toBe('Ștefan Țurcanu, administrator');
  });

  it('states a private client by name and contact only, with no identification number', () => {
    expect(facts.client.kind).toBe('individual');
    expect(facts.client.rows.map((r) => r.label)).toEqual(['Calitate', 'E-mail', 'Telefon']);
    expect(allText(SAMPLE_RENDER_DATA)).not.toMatch(/\bCNP\b/);
  });

  it('carries each verified document with its number, validity and the day it was checked', () => {
    expect(facts.companyCredentials).toEqual([
      {
        label: 'Licență de transport național',
        number: 'LTN-000123',
        validity: 'valabil până la 01.03.2031',
        checked: 'verificat în platformă la 10.09.2026',
      },
      {
        label: 'Asigurare CMR',
        number: 'CMR-2026-4567',
        validity: 'valabil 15.01.2026 – 14.01.2027',
        checked: 'verificat în platformă la 10.09.2026',
      },
    ]);
    expect(facts.missingCompanyCredentials).toEqual([]);
    expect(facts.vehicle?.plate).toBe('MS 01 TRM');
    expect(facts.vehicle?.description).toBe('Iveco Daily, 2020, Platformă auto (deschisă)');
    expect(facts.vehicle?.documents.map((d) => d.label)).toEqual(['ITP', 'Asigurare RCA', 'Copie conformă']);
    expect(facts.vehicle?.documents[0]?.number).toBe('nemenționat');
    expect(facts.vehicle?.missing).toEqual([]);
  });

  it('states the route, the windows, the service, the price and the payment term', () => {
    expect(facts.route.line).toBe('Târgu Mureș — Iași');
    expect(facts.route.from).toBe('Târgu Mureș, jud. Mureș, România');
    expect(facts.route.international).toBe(false);
    expect(facts.pickupWindow).toBe('între 01.10.2026 și 02.10.2026');
    expect(facts.deliveryWindow).toBe('03.10.2026');
    expect(facts.service?.label).toBe('Pe sens');
    expect(facts.price).toBe('2.400,00 lei');
    expect(facts.paymentTerm).toBe('30 de zile');
    expect(facts.conditions).toContain('Cheile se predau șoferului');
  });

  it('describes the vehicle carried as the client declared it', () => {
    const rows = Object.fromEntries(facts.cargo!.rows.map((r) => [r.label, r.value]));
    expect(facts.cargo?.title).toBe('Dacia Logan, 2019');
    expect(rows.Categorie).toBe('Autoturism / SUV');
    expect(rows['Pornește și merge']).toBe('da');
    expect(rows['Avariat la predare']).toBe('da — zgârietură pe bara din spate');
    expect(rows['Masă']).toBe('1.150 kg');
    // Asked only of a vehicle that does not run.
    expect(rows['Frânele funcționează']).toBeUndefined();
  });

  it('prints „[de completat]" for operator details not filled in yet, never an invented value', () => {
    expect(facts.operator.name).toBe(TO_BE_FILLED);
    expect(facts.operator.rows.every((r) => r.value === TO_BE_FILLED)).toBe(true);
  });

  it('falls back from the order window to the request and then to the offer estimate', () => {
    const noOrderWindow = withSnapshot((s) => ({
      ...s,
      order: { ...s.order, pickup_from: null, pickup_to: null, delivery_from: null, delivery_to: null },
    }));
    expect(contractFacts(noOrderWindow).pickupWindow).toBe('între 01.10.2026 și 02.10.2026');
    expect(contractFacts(noOrderWindow).deliveryWindow).toBe('din 03.10.2026');

    const onlyOffer = withSnapshot((s) => ({
      ...s,
      order: { ...s.order, pickup_from: null, pickup_to: null, delivery_from: null, delivery_to: null },
      request: { ...s.request, loading_from: null, loading_to: null, unloading_from: null, unloading_to: null },
    }));
    expect(contractFacts(onlyOffer).deliveryWindow).toBe('03.10.2026 (estimare din ofertă)');
  });

  it('says what is missing rather than leaving it out', () => {
    const bare = withSnapshot((s) => ({
      ...s,
      carrier: { ...s.carrier!, kind: 'company', legal_representative: null },
      credentials: {
        company_documents: [],
        vehicle: { ...s.credentials!.vehicle!, documents: [], copie_conforma_required: true },
      },
    }));
    const f = contractFacts(bare);
    expect(f.missingCompanyCredentials).toEqual(['licență de transport', 'asigurare CMR']);
    expect(f.vehicle?.missing).toEqual(['ITP', 'RCA', 'copie conformă']);
    expect(f.carrier.rows.find((r) => r.label === 'Reprezentant legal')?.value).toContain(TO_BE_FILLED);
    expect(allText(bare)).toContain('nu exista în platformă un document aprobat pentru: licență de transport, asigurare CMR');
  });

  it('says when no vehicle was assigned yet', () => {
    const noVehicle = withSnapshot((s) => ({ ...s, credentials: { ...s.credentials, vehicle: null } }));
    expect(contractFacts(noVehicle).vehicle).toBeNull();
    expect(allText(noVehicle)).toContain('nu alocase încă un vehicul');
  });

  it('applies CMR to an international transport and the Civil Code to a domestic one', () => {
    expect(allText(SAMPLE_RENDER_DATA)).toContain('Codul civil');
    expect(allText(SAMPLE_RENDER_DATA)).not.toContain('Convenția privind contractul de transport internațional');
    const abroad = withSnapshot((s) => ({
      ...s,
      request: { ...s.request, unloading: { city: 'Budapesta', county: null, country: 'HU' } },
    }));
    expect(contractFacts(abroad).route.international).toBe(true);
    expect(contractFacts(abroad).route.to).toBe('Budapesta, Ungaria');
    expect(allText(abroad)).toContain('Convenția privind contractul de transport internațional de mărfuri pe șosele (CMR');
  });
});

describe('versions and acceptances', () => {
  it('numbers the version and marks one that a newer version replaced', () => {
    expect(contractFacts(SAMPLE_RENDER_DATA).superseded).toBe(false);
    const old = { ...structuredClone(SAMPLE_RENDER_DATA), version: 1, latest_version: 2 };
    const f = contractFacts(old);
    expect(f.superseded).toBe(true);
    expect(allText(old)).toContain('Versiune înlocuită de versiunea 2');
  });

  it('shows this version’s acceptances, and the previous version’s in the footer', () => {
    const f = contractFacts(SAMPLE_RENDER_DATA);
    expect(f.thisVersion.carrier?.name).toBe('Ștefan Țurcanu');
    expect(f.thisVersion.carrier?.at).toBe('24.09.2026, ora 14:05');
    expect(f.thisVersion.client).toBeNull();
    const facts = contractFacts(SAMPLE_RENDER_DATA);
    const doc = templateFor('1.0').build(facts, null);
    expect(doc.footer.lines[0]).toBe(
      'Acceptări versiunea 2: transportatorul — Ștefan Țurcanu, 24.09.2026, ora 14:05; beneficiarul — neacceptat încă.',
    );
    expect(doc.footer.lines[1]).toBe(
      'Versiunea 1: transportatorul — Ștefan Țurcanu, 23.09.2026, ora 11:15; beneficiarul — Ioana Bălășescu, 23.09.2026, ora 12:02.',
    );
  });

  it('never shows on a version an acceptance given to a later one', () => {
    const v1 = { ...structuredClone(SAMPLE_RENDER_DATA), version: 1 };
    const f = contractFacts(v1);
    expect(f.acceptances.every((a) => a.version <= 1)).toBe(true);
    expect(f.thisVersion.client?.name).toBe('Ioana Bălășescu');
  });

  it('draws the same document from the same data every time', () => {
    const a = templateFor('1.0').build(contractFacts(SAMPLE_RENDER_DATA), null);
    const b = templateFor('1.0').build(contractFacts(structuredClone(SAMPLE_RENDER_DATA)), null);
    expect(a).toEqual(b);
  });
});

describe('what the contract says about itself', () => {
  const text = allText(SAMPLE_RENDER_DATA);

  it('calls the acceptance what it is, and never a qualified signature', () => {
    expect(text).toContain('Acceptarea electronică în platformă');
    expect(text).toContain('nu este o semnătură electronică calificată');
    expect(text).toContain('Regulamentului (UE) nr. 910/2014 (eIDAS)');
    for (const recorded of ['data și ora', 'adresa IP', 'browserul', 'amprenta lui digitală (SHA-256)']) {
      expect(text).toContain(recorded);
    }
    expect(text).not.toMatch(/semnătur[aă] electronic[aă] calificat[aă] (a|al) părților/);
  });

  it('says the platform is an intermediary and not a party', () => {
    expect(text).toContain('Platforma este intermediar. Nu este parte la acest contract de transport');
    expect(text).toContain('nu încasează prețul');
  });

  it('is marked as a draft for legal review', () => {
    expect(text).toContain('Proiect de contract, în curs de verificare juridică');
  });

  it('writes ș and ț with the comma below, never the cedilla look-alikes', () => {
    expect(text).toMatch(/[șțȘȚ]/);
    expect(text).not.toMatch(/[şţŞŢ]/);
  });

  it('has no emoji and no pictographs', () => {
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('never calls a request an „anunț"', () => {
    expect(text).not.toMatch(/(?<![a-zăâîșț])anunț(ul|uri|urile|ului)?(?![a-zăâîșț])/i);
  });
});
