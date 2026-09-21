/**
 * Ajutorul din cont, ca date.
 *
 * Conținutul stă în `src/content/ajutor.ts`; aici sunt numai căutarea
 * și potrivirea cu tipul de cont. Separate pentru că textul se schimbă
 * des și de către altcineva decât cine schimbă codul.
 *
 * Fiecare răspuns are un `id` stabil, pentru că ecranele trimit către
 * el cu `?raspuns=`. Un id care se schimbă rupe un semn de întrebare de
 * pe un ecran fără ca nimeni să observe, deci un test ține lista celor
 * la care se face trimitere.
 */

export type Audience = 'transportator' | 'client' | 'sofer' | 'toti';

export interface HelpAnswer {
  id: string;
  question: string;
  /** Un paragraf pe element. */
  answer: string[];
  audience: readonly Audience[];
  /** Cuvinte pe care le-ar tasta cineva, dar care nu apar în text. */
  keywords?: readonly string[];
  link?: { href: string; label: string };
}

export interface HelpSection {
  id: string;
  title: string;
  answers: readonly HelpAnswer[];
}

/** Ce vede un cont de tipul dat. „toti" apare la toată lumea. */
export function forAudience(
  sections: readonly HelpSection[],
  audience: Audience,
): HelpSection[] {
  return sections
    .map((section) => ({
      ...section,
      answers: section.answers.filter(
        (a) => a.audience.includes('toti') || a.audience.includes(audience),
      ),
    }))
    .filter((section) => section.answers.length > 0);
}

/** Diacriticele scoase, ca „intarziere" să găsească „întârziere". */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[șşś]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toLowerCase();
}

/**
 * Căutarea.
 *
 * Fiecare cuvânt tastat trebuie să apară undeva în întrebare, în
 * răspuns sau în cuvintele-cheie — „și", nu „sau". Cu „sau", a doua
 * jumătate a unei propoziții aduce înapoi jumătate din pagină, iar
 * oamenii încetează să mai caute.
 */
export function search(sections: readonly HelpSection[], query: string): HelpSection[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return [...sections];

  return sections
    .map((section) => ({
      ...section,
      answers: section.answers.filter((answer) => {
        const haystack = fold(
          [answer.question, ...answer.answer, ...(answer.keywords ?? [])].join(' '),
        );
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((section) => section.answers.length > 0);
}

export function countAnswers(sections: readonly HelpSection[]): number {
  return sections.reduce((total, section) => total + section.answers.length, 0);
}

export function findAnswer(
  sections: readonly HelpSection[],
  id: string,
): HelpAnswer | null {
  for (const section of sections) {
    const found = section.answers.find((a) => a.id === id);
    if (found !== undefined) return found;
  }
  return null;
}

/** Tipul de cont, din contextul pe care îl are deja aplicația. */
export function audienceOf(input: {
  activeRole: string | null;
  companyType: string | null;
}): Audience {
  if (input.activeRole === 'driver') return 'sofer';
  if (input.companyType === 'transport' || input.companyType === 'both') {
    return 'transportator';
  }
  return 'client';
}

/**
 * Semnele de întrebare de pe ecrane trimit aici.
 *
 * Ținute într-o hartă, nu împrăștiate prin componente, ca un test să
 * poată verifica faptul că fiecare țintă chiar există.
 */
export const CONTEXT_HELP = {
  requestForm: 'cum-public-o-cerere',
  routeForm: 'cum-public-o-plecare',
  series: 'cum-repet-o-plecare',
  offers: 'cum-functioneaza-ofertele',
  order: 'ce-se-intampla-dupa-acceptare',
  documents: 'ce-documente-imi-trebuie',
  expiry: 'ce-se-intampla-la-expirare',
  suspension: 'ce-inseamna-suspendare',
  proof: 'cum-se-face-dovada-livrarii',
  ratings: 'cum-evaluez',
  messages: 'de-ce-nu-vad-numarul-de-telefon',
  privateRequests: 'ce-este-o-cerere-privata',
  favourites: 'ce-sunt-transportatorii-favoriti',
} as const;

export type ContextHelpKey = keyof typeof CONTEXT_HELP;

export function helpHref(key: ContextHelpKey): string {
  return `/cont/ajutor?raspuns=${CONTEXT_HELP[key]}`;
}
