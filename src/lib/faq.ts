import { CARGO_CATEGORY_LABELS, FILTERABLE_CATEGORIES } from './departures';
import { pluralRo } from './requests';
import { exemptVehicles, remindersLabel, requiredDocuments, type PublicRequirement } from './trust';
import { STATIC_FAQ, type FaqEntry, type FaqGroup, type FaqGroupId } from '@/content/faq';
import { ROUTES } from '@/config/routes';
import { formatLei, type Plan } from './plans';

/**
 * The answers that describe a rule are built from the rule.
 *
 * "Ce documente îmi trebuie" is not a paragraph somebody remembers to
 * update when the requirements change — it is `document_requirements` read
 * back as a sentence. The same holds for the price, the trial and the
 * review time. When the data behind a question is missing, the question is
 * left out rather than answered with a guess: a missing answer is a gap, a
 * wrong one is a promise.
 *
 * Free of React and of SQL, so every sentence below is testable without either.
 */

export interface FaqInput {
  requirements: PublicRequirement[];
  /** The recommended carrier plan, or null when there is none to read. */
  plan: Plan | null;
  trialDays: number;
  reviewTimeLabel: string | null;
}

/** How many the homepage shows, and which ones it prefers. */
export const HOMEPAGE_FAQ_COUNT = 6;

const HOMEPAGE_ORDER: readonly string[] = [
  'cost-cerere',
  'acte-in-regula',
  'acte-vehicul',
  'pe-sens-expres',
  'abonament',
  'documente-inscriere',
  'date-contact',
  'vehicule',
  'expirare-document',
];

export function buildFaq(input: FaqInput): FaqGroup[] {
  const clients: FaqEntry[] = [...STATIC_FAQ.clienti];
  const vehicles = vehiclesEntry();
  if (vehicles) clients.push(vehicles);

  const carriers: FaqEntry[] = [];
  const documents = documentsEntry(input.requirements);
  if (documents) carriers.push(documents);

  const price = priceEntry(input.plan, input.trialDays);
  if (price) carriers.push(price);

  const expiry = expiryEntry(input.requirements);
  if (expiry) carriers.push(expiry);

  const review = reviewEntry(input.reviewTimeLabel);
  if (review) carriers.push(review);

  carriers.push(...STATIC_FAQ.transportatori);

  const groups: FaqGroup[] = [
    { id: 'clienti', title: groupTitle('clienti'), entries: clients },
    { id: 'transportatori', title: groupTitle('transportatori'), entries: carriers },
  ];
  return groups.filter((group) => group.entries.length > 0);
}

function groupTitle(id: FaqGroupId): string {
  return id === 'clienti' ? 'Pentru clienți' : 'Pentru transportatori';
}

/**
 * Six for the homepage, taken in a preferred order and topped up from
 * whatever is left. A question that was left out because its data is
 * missing simply does not appear, and the next one moves up.
 */
export function homepageFaq(groups: FaqGroup[], count: number = HOMEPAGE_FAQ_COUNT): FaqEntry[] {
  const all = groups.flatMap((group) => group.entries);
  const byId = new Map(all.map((entry) => [entry.id, entry]));

  const picked: FaqEntry[] = [];
  for (const id of HOMEPAGE_ORDER) {
    const entry = byId.get(id);
    if (entry && !picked.includes(entry)) picked.push(entry);
    if (picked.length === count) return picked;
  }
  for (const entry of all) {
    if (!picked.includes(entry)) picked.push(entry);
    if (picked.length === count) break;
  }
  return picked;
}

/** The categories the forms actually offer, so the answer cannot overstate. */
function vehiclesEntry(): FaqEntry | null {
  if (FILTERABLE_CATEGORIES.length === 0) return null;
  const labels = FILTERABLE_CATEGORIES.map((c) => CARGO_CATEGORY_LABELS[c].toLowerCase());
  return {
    id: 'vehicule',
    question: 'Ce vehicule pot transporta?',
    answer: [
      `Categoriile disponibile în formular sunt: ${joinRo(labels)}.`,
      'Poți cere transport și pentru un vehicul care nu pornește: bifezi asta în cerere, iar transportatorii care au troliu sau platformă potrivită îți trimit ofertă.',
    ],
  };
}

/**
 * Which documents, split the way the rules are: what every firm brings,
 * what only a carrier brings, what only a forwarder brings, and what each
 * vehicle brings — with the exemption where a rule has one.
 */
function documentsEntry(requirements: PublicRequirement[]): FaqEntry | null {
  const required = requiredDocuments(requirements);
  if (required.length === 0) return null;

  const company = required.filter((r) => r.scope === 'company');
  const vehicle = required.filter((r) => r.scope === 'vehicle');

  const everyone = company.filter((r) => !r.for_company_types || r.for_company_types.length === 0);
  const transport = company.filter((r) => onlyFor(r, 'transport'));
  const forwarder = company.filter((r) => onlyFor(r, 'expeditie'));

  const answer: string[] = [];
  if (everyone.length > 0) answer.push(`Pentru orice firmă: ${names(everyone)}.`);
  if (transport.length > 0) answer.push(`Pentru firmele de transport, în plus: ${names(transport)}.`);
  if (forwarder.length > 0) {
    answer.push(`Pentru casele de expediții, în plus: ${names(forwarder)}.`);
  }
  if (vehicle.length > 0) answer.push(`Pentru fiecare vehicul: ${vehicleNames(vehicle)}.`);
  if (answer.length === 0) return null;

  answer.push('Documentele se încarcă din contul firmei și sunt verificate de echipa noastră.');

  return {
    id: 'documente-inscriere',
    question: 'Ce documente îmi trebuie la înscriere?',
    answer,
    link: { href: ROUTES.verification, label: 'Lista completă' },
  };
}

function onlyFor(requirement: PublicRequirement, type: 'transport' | 'expeditie'): boolean {
  const types = requirement.for_company_types;
  return !!types && types.length > 0 && types.includes(type) && !types.includes(other(type));
}

function other(type: 'transport' | 'expeditie'): 'transport' | 'expeditie' {
  return type === 'transport' ? 'expeditie' : 'transport';
}

function names(requirements: PublicRequirement[]): string {
  return joinRo(requirements.map((r) => r.label_ro));
}

/** Same, with "(nu se cere pentru …)" after a rule that has an exemption. */
function vehicleNames(requirements: PublicRequirement[]): string {
  return joinRo(
    requirements.map((r) => {
      const exempt = exemptVehicles(r);
      return exempt === null ? r.label_ro : `${r.label_ro} (nu se cere pentru ${exempt.toLowerCase()})`;
    }),
  );
}

/**
 * The price as the database holds it, and the trial as the settings hold
 * it. No plan means no answer: a subscription price is not something to
 * state from memory.
 */
function priceEntry(plan: Plan | null, trialDays: number): FaqEntry | null {
  if (!plan) return null;

  const answer = [`Planul ${plan.name} costă ${formatLei(plan.monthlyPrice)} pe lună.`];
  if (trialDays > 0) {
    answer.push(
      `Perioada gratuită de ${pluralRo(trialDays, 'zi', 'zile')} începe când firma este aprobată, nu când îți faci contul. Nu îți cerem card la înscriere.`,
    );
  }
  // Only what the plan actually includes today. A "în curând" belongs on
  // the pricing page, where it is labelled as one, not in a sentence that
  // reads as a list of what you get.
  const included = plan.features.filter((f) => f.status === 'included');
  if (included.length > 0) {
    answer.push(`Include: ${joinRo(included.map((f) => f.label.toLowerCase()))}.`);
  }

  return {
    id: 'abonament',
    question: 'Cât costă abonamentul?',
    answer,
    link: { href: ROUTES.plans, label: 'Vezi toate planurile' },
  };
}

/** What lapsing costs, split by scope, with the reminder schedule from the rows. */
function expiryEntry(requirements: PublicRequirement[]): FaqEntry | null {
  const required = requiredDocuments(requirements);
  if (required.length === 0) return null;

  // The same phrasing /verificare uses, from the same helper: "30, 14, 7
  // și o zi" rather than a list that ends in "și 1 zile".
  const reminders = remindersLabel([...new Set(required.flatMap((r) => r.reminder_days))]);

  const answer: string[] = [];
  if (reminders) {
    answer.push(`Primești e-mail înainte de expirare, cu ${reminders} înainte.`);
  }
  answer.push(
    'Dacă expiră un document al vehiculului, vehiculul iese de pe bursă până încarci unul nou; celelalte vehicule ale firmei rămân active.',
  );

  const grace = Math.max(0, ...required.filter((r) => r.scope === 'company').map((r) => r.grace_days));
  answer.push(
    grace > 0
      ? `Dacă expiră un document al firmei, firma nu mai poate trimite oferte. Pentru asigurări există o perioadă de grație de ${pluralRo(grace, 'zi', 'zile')}.`
      : 'Dacă expiră un document al firmei, firma nu mai poate trimite oferte până îl reînnoiește.',
  );
  answer.push('Contul rămâne al tău în toate cazurile, iar accesul revine imediat ce documentul este aprobat.');

  return { id: 'expirare-document', question: 'Ce se întâmplă când îmi expiră un document?', answer };
}

function reviewEntry(label: string | null): FaqEntry | null {
  if (!label) return null;
  return {
    id: 'durata-verificare',
    question: 'Cât durează verificarea?',
    answer: [
      `Documentele intră într-o coadă de verificare manuală și sunt confirmate ${label}. Dacă un document este neclar, cerem unul nou și termenul se reia.`,
    ],
  };
}

/** "a, b și c" — the Romanian list, with "și" before the last item. */
export function joinRo(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} și ${items[items.length - 1]}`;
}
