/**
 * From the snapshot to the facts a contract states, formatted in Romanian.
 *
 * Everything the template prints comes through here, so that the text of
 * a template is words and the values are decided in one place, with a
 * unit test on each. Nothing is invented: a value the snapshot does not
 * hold prints as „nemenționat" or, for the operator's own details that
 * are filled in before launch, „[de completat]".
 *
 * Pure TypeScript: the Next unit tests import this file.
 */

import {
  formatDate,
  formatDateTime,
  formatDays,
  formatKg,
  formatMoney,
  formatPlate,
  formatWindow,
  NOT_STATED,
  orNotStated,
  yesNo,
} from './format.ts';
import { CARGO_CATEGORY, countryLabel, label, SERVICE_TYPE, SERVICE_TYPE_NOTE, VEHICLE_TYPE } from './labels.ts';
import {
  amount,
  type ContractSnapshot,
  type RenderAcceptance,
  type RenderData,
  type Side,
  type SnapshotCompany,
  type SnapshotDocument,
  type SnapshotParty,
  type SnapshotPlace,
  text,
} from './snapshot.ts';

/** What the contract prints where one of our own details is not filled in yet. */
export const TO_BE_FILLED = '[de completat]';

export interface Row {
  label: string;
  value: string;
}

export interface PartyFacts {
  /** „Transportatorul", „Beneficiarul". */
  role: string;
  kind: 'company' | 'individual' | 'missing';
  name: string;
  rows: Row[];
}

export interface CredentialFacts {
  label: string;
  number: string;
  validity: string;
  checked: string;
}

export interface VehicleFacts {
  plate: string;
  description: string;
  source: string;
  documents: CredentialFacts[];
  /** The sentence about the copie conformă: needed or not, present or not. */
  copieConforma: string;
  missing: string[];
}

export interface AcceptanceFacts {
  version: number;
  side: Side;
  sideLabel: string;
  name: string;
  company: string | null;
  at: string;
  /** One line: „Acceptat de Ion Popescu, în numele firmei Trans SRL (transportatorul), la 24.09.2026, ora 14:05". */
  line: string;
}

export interface ContractFacts {
  contractNumber: string;
  version: number;
  latestVersion: number;
  templateVersion: string;
  generatedAt: string;
  generatedBy: string;
  snapshotHash: string;
  shortHash: string;
  redacted: boolean;
  superseded: boolean;
  brand: string;
  operator: { name: string; rows: Row[] };
  carrier: PartyFacts;
  client: PartyFacts;
  companyCredentials: CredentialFacts[];
  missingCompanyCredentials: string[];
  vehicle: VehicleFacts | null;
  route: { from: string; to: string; line: string; international: boolean };
  pickupWindow: string;
  deliveryWindow: string;
  service: { label: string; note: string | null } | null;
  cargo: { title: string; rows: Row[] } | null;
  price: string;
  paymentTerm: string | null;
  conditions: string | null;
  /** When the client accepted the offer this contract comes from. */
  offerAcceptedAt: string | null;
  requestTitle: string | null;
  requestDescription: string | null;
  cmrNumber: string | null;
  acceptances: AcceptanceFacts[];
  thisVersion: { carrier: AcceptanceFacts | null; client: AcceptanceFacts | null };
}

export const SIDE_LABEL: Record<Side, string> = {
  carrier: 'transportatorul',
  client: 'beneficiarul',
};

const GENERATOR_LABEL: Record<string, string> = {
  carrier: 'transportatorul',
  client: 'beneficiarul',
  staff: 'echipa platformei',
};

function row(labelText: string, value: string | null): Row {
  return { label: labelText, value: orNotStated(value) };
}

/** `Timișoara, jud. Timiș, România`. */
export function placeLine(place: SnapshotPlace | null | undefined): string {
  if (!place) return NOT_STATED;
  const city = text(place.city);
  const county = text(place.county);
  const country = countryLabel(text(place.country));
  // „jud." only in Romania; abroad the field holds a region's name.
  const region = county ? (country && country !== 'România' ? county : `jud. ${county}`) : null;
  const parts = [city, region, country].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : NOT_STATED;
}

function companyAddress(c: SnapshotCompany): string | null {
  const address = text(c.address);
  const city = text(c.city);
  const county = text(c.county);
  const country = countryLabel(text(c.country));
  const tail = [city, county ? `jud. ${county}` : null, country && country !== 'România' ? country : null]
    .filter((p): p is string => p !== null);
  // Addresses are often written out in full already; don't repeat the city.
  const parts = address ? [address, ...tail.filter((t) => !address.includes(t))] : tail;
  return parts.length > 0 ? parts.join(', ') : null;
}

function partyFacts(role: string, party: SnapshotParty | null | undefined): PartyFacts {
  if (!party) return { role, kind: 'missing', name: NOT_STATED, rows: [] };
  if (party.kind === 'individual') {
    return {
      role,
      kind: 'individual',
      name: orNotStated(text(party.full_name)),
      rows: [
        { label: 'Calitate', value: 'persoană fizică' },
        row('E-mail', text(party.email)),
        row('Telefon', text(party.phone)),
      ],
    };
  }
  const cui = text(party.cui);
  const vat = party.vat_payer === true && cui && !/^RO/i.test(cui) ? `RO${cui}` : cui;
  return {
    role,
    kind: 'company',
    name: orNotStated(text(party.legal_name) ?? text(party.display_name)),
    rows: [
      row('CUI', vat),
      row('Nr. registrul comerțului', text(party.reg_com)),
      row('Sediul', companyAddress(party)),
      {
        label: 'Reprezentant legal',
        value: text(party.legal_representative) ?? `${TO_BE_FILLED} (se completează în profilul firmei)`,
      },
      row('E-mail', text(party.contact_email)),
      row('Telefon', text(party.contact_phone)),
    ],
  };
}

function credential(doc: SnapshotDocument): CredentialFacts {
  const until = formatDate(text(doc.valid_until));
  const from = formatDate(text(doc.valid_from));
  const issued = formatDate(text(doc.issued_at));
  let validity: string;
  if (until && from) validity = `valabil ${from} – ${until}`;
  else if (until) validity = `valabil până la ${until}`;
  else if (issued) validity = `emis la ${issued}, fără dată de expirare declarată`;
  else validity = 'fără dată de expirare declarată';
  const reviewed = formatDate(text(doc.reviewed_at));
  return {
    label: orNotStated(text(doc.label) ?? text(doc.kind)),
    number: orNotStated(text(doc.number)),
    validity,
    checked: reviewed ? `verificat în platformă la ${reviewed}` : 'aprobat în platformă',
  };
}

function hasKind(docs: SnapshotDocument[], kind: string): boolean {
  return docs.some((d) => d.kind === kind);
}

function vehicleFacts(snapshot: ContractSnapshot): VehicleFacts | null {
  const v = snapshot.credentials?.vehicle;
  if (!v) return null;
  const docs = Array.isArray(v.documents) ? v.documents : [];
  const makeModel = [text(v.make), text(v.model)].filter(Boolean).join(' ');
  const description = [
    makeModel || null,
    v.year ? String(v.year) : null,
    label(VEHICLE_TYPE, text(v.vehicle_type)),
  ].filter((p): p is string => p !== null).join(', ');
  const missing: string[] = [];
  if (!hasKind(docs, 'itp')) missing.push('ITP');
  if (!hasKind(docs, 'rca')) missing.push('RCA');
  let copieConforma: string;
  if (v.copie_conforma_required === true) {
    if (hasKind(docs, 'copie_conforma')) {
      copieConforma = 'Copia conformă este necesară pentru acest tip de vehicul și este în dosar (mai sus).';
    } else {
      copieConforma = 'Copia conformă este necesară pentru acest tip de vehicul și nu era aprobată în platformă la data generării.';
      missing.push('copie conformă');
    }
  } else {
    copieConforma = 'Pentru acest tip de vehicul platforma nu cere copie conformă.';
  }
  return {
    plate: orNotStated(formatPlate(text(v.plate_number))),
    description: orNotStated(description || null),
    source: v.source === 'order' ? 'vehiculul alocat comenzii' : 'vehiculul propus în ofertă (încă nealocat comenzii)',
    documents: docs.map(credential),
    copieConforma,
    missing,
  };
}

function cargoFacts(snapshot: ContractSnapshot): ContractFacts['cargo'] {
  const c = snapshot.cargo;
  if (!c) return null;
  const category = label(CARGO_CATEGORY, text(c.category));
  const makeModel = [text(c.make), text(c.model)].filter(Boolean).join(' ') || null;
  const title = [makeModel, c.year ? String(c.year) : null].filter(Boolean).join(', ') || category || NOT_STATED;
  const running = yesNo(c.is_running);
  const rows: Row[] = [
    row('Categorie', category),
    row('Marcă și model', makeModel),
    row('An de fabricație', c.year ? String(c.year) : null),
    row('Număr de înmatriculare', formatPlate(text(c.plate_number))),
    row('Serie șasiu (VIN)', text(c.vin)),
    row('Masă', formatKg(c.weight_kg)),
    row('Pornește și merge', running),
  ];
  if (c.is_running === false) {
    rows.push(
      row('Roțile se învârt', yesNo(c.wheels_turn)),
      row('Direcția funcționează', yesNo(c.steering_works)),
      row('Frânele funcționează', yesNo(c.brakes_work)),
    );
  }
  rows.push(row('Are chei', yesNo(c.has_keys)), row('Necesită troliu', yesNo(c.needs_winch)));
  rows.push(
    row(
      'Avariat la predare',
      c.is_damaged === true
        ? `da${text(c.damage_notes) ? ` — ${text(c.damage_notes)}` : ''}`
        : yesNo(c.is_damaged),
    ),
  );
  return { title, rows };
}

function acceptanceFacts(a: RenderAcceptance): AcceptanceFacts {
  const name = orNotStated(text(a.name));
  const company = text(a.company_name);
  const at = formatDateTime(a.accepted_at) ?? a.accepted_at;
  const who = company ? `${name}, în numele firmei ${company}` : name;
  return {
    version: a.version,
    side: a.side,
    sideLabel: SIDE_LABEL[a.side],
    name,
    company,
    at,
    line: `Acceptat de ${who} (${SIDE_LABEL[a.side]}), la ${at}`,
  };
}

function windowOr(
  from: string | null,
  to: string | null,
  fallbackFrom: string | null,
  fallbackTo: string | null,
  estimate: string | null,
): string {
  const exact = formatWindow(from, to);
  if (exact) return exact;
  const fallback = formatWindow(fallbackFrom, fallbackTo);
  if (fallback) return fallback;
  const estimated = formatDate(estimate);
  if (estimated) return `${estimated} (estimare din ofertă)`;
  return NOT_STATED;
}

/** The operator, from the block the application passed when the version was generated. */
function operatorFacts(snapshot: ContractSnapshot): ContractFacts['operator'] {
  const op = snapshot.operator ?? {};
  const filled = (value: unknown) => text(value) ?? TO_BE_FILLED;
  return {
    name: filled(op.legal_name),
    rows: [
      { label: 'CUI', value: filled(op.cui) },
      { label: 'Nr. registrul comerțului', value: filled(op.reg_com) },
      { label: 'Sediul', value: filled(op.address) },
      { label: 'E-mail', value: filled(op.email) },
    ],
  };
}

/**
 * The facts of one version.
 *
 * `acceptances` are every acceptance recorded on this order for this
 * version and the ones before it — a later version shows in its footer
 * that the earlier one was accepted, and by whom.
 */
export function contractFacts(data: RenderData): ContractFacts {
  const s = data.snapshot;
  const order = s.order ?? {};
  const offer = s.offer ?? null;
  const request = s.request ?? null;

  const from = request?.loading ?? null;
  const to = request?.unloading ?? null;
  const fromCity = text(from?.city) ?? NOT_STATED;
  const toCity = text(to?.city) ?? NOT_STATED;
  const fromCountry = text(from?.country)?.toUpperCase() ?? 'RO';
  const toCountry = text(to?.country)?.toUpperCase() ?? 'RO';

  const priceValue = amount(order.agreed_price) ?? amount(offer?.price_amount);
  const currency = text(order.currency) ?? text(offer?.currency);
  const termDays = order.payment_term_days ?? offer?.payment_term_days ?? null;

  const listed = s.credentials?.company_documents;
  const companyDocs = Array.isArray(listed) ? listed : [];
  const missingCompany: string[] = [];
  if (!hasKind(companyDocs, 'licenta_comunitara') && !hasKind(companyDocs, 'licenta_transport_national')) {
    missingCompany.push('licență de transport');
  }
  if (!hasKind(companyDocs, 'asigurare_cmr')) missingCompany.push('asigurare CMR');

  const serviceCode = text(request?.service_type);
  const acceptances = [...data.acceptances]
    .filter((a) => a.version <= data.version)
    .sort((a, b) => a.version - b.version || a.accepted_at.localeCompare(b.accepted_at))
    .map(acceptanceFacts);
  const mine = (side: Side) => acceptances.find((a) => a.version === data.version && a.side === side) ?? null;

  const generatorName = text(s.generated_by?.name);
  const generatorSide = GENERATOR_LABEL[text(s.generated_by?.side) ?? ''] ?? null;

  return {
    contractNumber: data.contract_number,
    version: data.version,
    latestVersion: data.latest_version,
    templateVersion: data.template_version,
    generatedAt: formatDateTime(text(s.generated_at)) ?? NOT_STATED,
    generatedBy: [generatorName, generatorSide ? `(${generatorSide})` : null].filter(Boolean).join(' ') || NOT_STATED,
    snapshotHash: data.snapshot_hash,
    shortHash: data.snapshot_hash.slice(0, 16),
    redacted: data.redacted,
    superseded: data.version < data.latest_version,
    brand: text(s.operator?.brand) ?? 'platforma',
    operator: operatorFacts(s),
    carrier: partyFacts('Transportatorul', s.carrier ?? null),
    client: partyFacts('Beneficiarul', s.client ?? null),
    companyCredentials: companyDocs.map(credential),
    missingCompanyCredentials: missingCompany,
    vehicle: vehicleFacts(s),
    route: {
      from: placeLine(from),
      to: placeLine(to),
      line: `${fromCity} — ${toCity}`,
      international: fromCountry !== toCountry,
    },
    pickupWindow: windowOr(
      text(order.pickup_from), text(order.pickup_to),
      text(request?.loading_from), text(request?.loading_to),
      text(offer?.estimated_pickup_date),
    ),
    deliveryWindow: windowOr(
      text(order.delivery_from), text(order.delivery_to),
      text(request?.unloading_from), text(request?.unloading_to),
      text(offer?.estimated_delivery_date),
    ),
    service: serviceCode
      ? { label: label(SERVICE_TYPE, serviceCode) ?? serviceCode, note: SERVICE_TYPE_NOTE[serviceCode] ?? null }
      : null,
    cargo: cargoFacts(s),
    price: formatMoney(priceValue, currency) ?? NOT_STATED,
    paymentTerm: formatDays(termDays),
    conditions: text(offer?.conditions),
    offerAcceptedAt: formatDateTime(text(offer?.accepted_at)),
    requestTitle: text(request?.title),
    requestDescription: text(request?.description),
    cmrNumber: text(order.cmr_number),
    acceptances,
    thisVersion: { carrier: mine('carrier'), client: mine('client') },
  };
}
