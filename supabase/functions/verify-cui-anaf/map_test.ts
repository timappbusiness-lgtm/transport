import { isStruckOff, mapAnafRecord, tidyCity, tidyCounty } from "./map.ts";
import { hasValidControlDigit } from "./authorize.ts";

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? "assertEquals"}: expected ${e}, got ${a}`);
}

const NOW = new Date("2026-09-24T09:00:00Z");

/** The shape of `found[0]` in PlatitorTvaRest v9, trimmed to what we read. */
function record(overrides: {
  general?: Record<string, unknown>;
  inactive?: Record<string, unknown>;
  vat?: Record<string, unknown>;
  seat?: Record<string, unknown>;
} = {}): Record<string, unknown> {
  return {
    date_generale: {
      cui: 14399840,
      denumire: "TRANSPORT  ARDEAL SRL",
      adresa: "JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. FABRICII, NR.12",
      nrRegCom: "J12/1234/2010",
      telefon: "0264123456",
      codPostal: "",
      cod_CAEN: "4941",
      stare_inregistrare: "INREGISTRAT din data 14.03.2010",
      ...overrides.general,
    },
    inregistrare_scop_Tva: { scpTVA: true, ...overrides.vat },
    stare_inactiv: {
      dataInactivare: "",
      dataReactivare: "",
      dataPublicare: "",
      dataRadiere: "",
      statusInactivi: false,
      ...overrides.inactive,
    },
    adresa_sediu_social: {
      sdenumire_Judet: "CLUJ",
      sdenumire_Localitate: "Mun. Cluj-Napoca",
      scod_Postal: "400641",
      ...overrides.seat,
    },
  };
}

Deno.test("an active company: name, address, county, city, reg. com., VAT", () => {
  const mapped = mapAnafRecord(record(), 14399840, NOW);
  assertEquals(mapped.legal_name, "TRANSPORT ARDEAL SRL");
  assertEquals(mapped.address, "JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. FABRICII, NR.12");
  assertEquals(mapped.county, "Cluj");
  assertEquals(mapped.city, "Cluj-Napoca");
  assertEquals(mapped.postal_code, "400641");
  assertEquals(mapped.reg_com, "J12/1234/2010");
  assertEquals(mapped.vat_payer, true);
  assertEquals(mapped.is_inactive, false);
  assertEquals(mapped.is_struck_off, false);
  assertEquals(mapped.checked_at, "2026-09-24T09:00:00.000Z");
});

Deno.test("declared inactive by ANAF", () => {
  const mapped = mapAnafRecord(
    record({ inactive: { statusInactivi: true, dataInactivare: "2025-02-01" } }),
    14399840,
    NOW,
  );
  assertEquals(mapped.is_inactive, true);
  assertEquals(mapped.is_struck_off, false);
});

Deno.test("struck off, spelled the way ANAF spells it", () => {
  // The old check looked for „radiat" and never matched this.
  const mapped = mapAnafRecord(
    record({ general: { stare_inregistrare: "RADIERE din data 12.03.2019" } }),
    14399840,
    NOW,
  );
  assertEquals(mapped.is_struck_off, true);
});

Deno.test("struck off by date alone, with a status that does not say so", () => {
  const mapped = mapAnafRecord(record({ inactive: { dataRadiere: "2019-03-12" } }), 14399840, NOW);
  assertEquals(mapped.is_struck_off, true);
});

Deno.test("not a VAT payer, and empty strings read as missing", () => {
  const mapped = mapAnafRecord(
    record({ vat: { scpTVA: false }, general: { nrRegCom: "", telefon: "  " } }),
    14399840,
    NOW,
  );
  assertEquals(mapped.vat_payer, false);
  assertEquals(mapped.reg_com, null);
  assertEquals(mapped.phone, null);
});

Deno.test("a record with nothing in it maps to nulls, never throws", () => {
  const mapped = mapAnafRecord({}, 12, NOW);
  assertEquals(mapped.legal_name, null);
  assertEquals(mapped.county, null);
  assertEquals(mapped.is_inactive, false);
  assertEquals(mapped.is_struck_off, false);
});

Deno.test("Bucharest and its sectors", () => {
  assertEquals(tidyCounty("MUNICIPIUL BUCUREŞTI"), "București");
  assertEquals(tidyCity("Mun. Bucureşti Sec. 6"), "București");
});

Deno.test("administrative prefixes and old cedillas", () => {
  assertEquals(tidyCity("Oraş Otopeni"), "Otopeni");
  assertEquals(tidyCity("Com. Floreşti"), "Florești");
  assertEquals(tidyCounty("BISTRIŢA-NĂSĂUD"), "Bistrița-Năsăud");
  assertEquals(tidyCounty("  "), null);
});

Deno.test("isStruckOff reads both signals and nothing else", () => {
  assertEquals(isStruckOff("radiată", null), true);
  assertEquals(isStruckOff("INREGISTRAT din data 01.01.2000", ""), false);
  assertEquals(isStruckOff(null, undefined), false);
});

Deno.test("the CUI control digit", () => {
  assertEquals(hasValidControlDigit(14399840), true);
  assertEquals(hasValidControlDigit(361579), true);
  assertEquals(hasValidControlDigit(14399841), false);
  assertEquals(hasValidControlDigit(1), false);
});
