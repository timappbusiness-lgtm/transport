// What we take from an ANAF record, and how.
//
// Kept free of Deno and Supabase imports so it runs under `deno test`
// without network or credentials, and so the rules for "inactive" and
// "struck off" can be read in one place.
//
// The record is the `found[0]` element of PlatitorTvaRest v9. Every field
// is optional here: ANAF leaves strings empty rather than absent, and has
// renamed fields between versions before.

export interface AnafLookup {
  found: true;
  cui: number;
  legal_name: string | null;
  address: string | null;
  county: string | null;
  city: string | null;
  postal_code: string | null;
  reg_com: string | null;
  phone: string | null;
  caen_code: string | null;
  status_text: string | null;
  vat_payer: boolean;
  /** Declared inactive by ANAF (art. 92 Cod procedură fiscală). */
  is_inactive: boolean;
  /** Struck off the trade register: a date of striking off, or a status that says so. */
  is_struck_off: boolean;
  checked_at: string;
}

type Text = string | null | undefined;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * „RADIERE din data 12.03.2019", „radiată", or a `dataRadiere` on the
 * inactive block. The first spelling is ANAF's; the old check looked only
 * for „radiat" and so never saw it.
 */
export function isStruckOff(statusText: Text, strikeOffDate: Text): boolean {
  if (clean(strikeOffDate) !== null) return true;
  const status = clean(statusText);
  return status !== null && /radi(at|ere)/i.test(status);
}

/**
 * ANAF writes counties in capitals with the old cedilla letters
 * („MUNICIPIUL BUCUREŞTI", „CLUJ"). Returned as a person would write it:
 * „București", „Cluj". Matching it to the app's own list is the app's job.
 */
export function tidyCounty(raw: Text): string | null {
  const value = clean(raw);
  if (value === null) return null;
  const modern = value.replace(/Ş/g, "Ș").replace(/ş/g, "ș").replace(/Ţ/g, "Ț").replace(/ţ/g, "ț");
  if (/bucure[sș]ti/i.test(modern)) return "București";
  return titleCase(modern);
}

/**
 * „Mun. Cluj-Napoca", „Oraş Otopeni", „Com. Florești", „Mun. Bucureşti Sec. 6":
 * the locality without its administrative prefix or the sector.
 */
export function tidyCity(raw: Text): string | null {
  const value = clean(raw);
  if (value === null) return null;
  const modern = value.replace(/Ş/g, "Ș").replace(/ş/g, "ș").replace(/Ţ/g, "Ț").replace(/ţ/g, "ț");
  const bare = modern
    .replace(/^(mun\.?|municipiul|or\.?|ora[sș]\.?|ora[sș]ul|com\.?|comuna|sat|satul)\s+/i, "")
    .replace(/\s+sec(\.|torul)?\s*\d+$/i, "")
    .trim();
  if (bare === "") return null;
  if (/bucure[sș]ti/i.test(bare)) return "București";
  return titleCase(bare);
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s-])(\p{L})/gu, (_match, sep: string, letter: string) => sep + letter.toLocaleUpperCase("ro-RO"));
}

/** `found[0]` of an ANAF v9 answer, in the shape the app reads. */
export function mapAnafRecord(record: Record<string, unknown>, cui: number, now: Date): AnafLookup {
  const general = (record.date_generale ?? {}) as Record<string, unknown>;
  const inactive = (record.stare_inactiv ?? {}) as Record<string, unknown>;
  const vat = (record.inregistrare_scop_Tva ?? {}) as Record<string, unknown>;
  const seat = (record.adresa_sediu_social ?? {}) as Record<string, unknown>;

  const statusText = clean(general.stare_inregistrare);

  return {
    found: true,
    cui,
    legal_name: clean(general.denumire),
    address: clean(general.adresa),
    county: tidyCounty(seat.sdenumire_Judet as Text),
    city: tidyCity(seat.sdenumire_Localitate as Text),
    postal_code: clean(seat.scod_Postal) ?? clean(general.codPostal),
    reg_com: clean(general.nrRegCom),
    phone: clean(general.telefon),
    caen_code: clean(general.cod_CAEN),
    status_text: statusText,
    vat_payer: vat.scpTVA === true,
    is_inactive: inactive.statusInactivi === true,
    is_struck_off: isStruckOff(statusText, inactive.dataRadiere as Text),
    checked_at: now.toISOString(),
  };
}
