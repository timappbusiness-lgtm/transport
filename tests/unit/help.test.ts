import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS } from '@/content/ajutor';
import {
  CONTEXT_HELP,
  audienceOf,
  countAnswers,
  findAnswer,
  fold,
  forAudience,
  helpHref,
  search,
  type HelpSection,
} from '@/lib/help';

/**
 * Ajutorul din cont.
 *
 * Două teste de aici sunt cele care contează: fiecare semn de întrebare
 * de pe un ecran trebuie să ducă la un răspuns care chiar există, iar
 * fiecare răspuns trebuie să aibă un public. Un răspuns fără public nu
 * apare nicăieri, ceea ce este mai rău decât să nu fie scris.
 */

const SECTIONS: HelpSection[] = [
  {
    id: 'unu',
    title: 'Unu',
    answers: [
      {
        id: 'a',
        question: 'Cum public o cerere?',
        answer: ['Din butonul de publicare.'],
        audience: ['client'],
        keywords: ['marfă'],
      },
      {
        id: 'b',
        question: 'Ce înseamnă întârziere?',
        answer: ['Când ajunge mai târziu.'],
        audience: ['toti'],
      },
    ],
  },
  {
    id: 'doi',
    title: 'Doi',
    answers: [
      {
        id: 'c',
        question: 'Cum public o plecare?',
        answer: ['Din trasee.'],
        audience: ['transportator'],
      },
    ],
  },
];

describe('cine vede ce', () => {
  it('un client vede ale lui și pe cele comune', () => {
    const shown = forAudience(SECTIONS, 'client');
    expect(countAnswers(shown)).toBe(2);
    expect(shown.map((s) => s.id)).toEqual(['unu']);
  });

  it('un transportator vede altele', () => {
    const shown = forAudience(SECTIONS, 'transportator');
    expect(countAnswers(shown)).toBe(2);
    expect(shown.map((s) => s.id)).toEqual(['unu', 'doi']);
  });

  it('un șofer vede numai ce este pentru toți', () => {
    expect(countAnswers(forAudience(SECTIONS, 'sofer'))).toBe(1);
  });

  it('și o secțiune rămasă goală nu se desenează', () => {
    expect(forAudience(SECTIONS, 'sofer').map((s) => s.id)).toEqual(['unu']);
  });
});

describe('căutarea', () => {
  it('găsește după un cuvânt din întrebare', () => {
    expect(countAnswers(search(SECTIONS, 'plecare'))).toBe(1);
  });

  it('și după unul din răspuns', () => {
    expect(countAnswers(search(SECTIONS, 'trasee'))).toBe(1);
  });

  it('și după un cuvânt-cheie care nu apare în text', () => {
    expect(countAnswers(search(SECTIONS, 'marfă'))).toBe(1);
  });

  it('fără diacritice găsește cu diacritice', () => {
    expect(countAnswers(search(SECTIONS, 'intarziere'))).toBe(1);
    expect(countAnswers(search(SECTIONS, 'marfa'))).toBe(1);
  });

  it('toate cuvintele trebuie să se potrivească, nu unul', () => {
    // Cu „sau", „cum plecare" ar fi adus și cererea.
    expect(countAnswers(search(SECTIONS, 'cum plecare'))).toBe(1);
    expect(countAnswers(search(SECTIONS, 'cum cerere'))).toBe(1);
  });

  it('un cuvânt care nu există nu aduce nimic', () => {
    expect(search(SECTIONS, 'elicopter')).toEqual([]);
  });

  it('o căutare goală aduce tot', () => {
    expect(countAnswers(search(SECTIONS, ''))).toBe(3);
    expect(countAnswers(search(SECTIONS, '  '))).toBe(3);
  });

  it('o singură literă nu filtrează', () => {
    expect(countAnswers(search(SECTIONS, 'a'))).toBe(3);
  });

  it('fold scoate și ș-ul cu virgulă, și pe cel cu sedilă', () => {
    expect(fold('Întârziere')).toBe('intarziere');
    expect(fold('mesaj ș ţ')).toBe('mesaj s t');
  });
});

describe('tipul de cont', () => {
  it('un șofer este un șofer, orice firmă ar avea', () => {
    expect(audienceOf({ activeRole: 'driver', companyType: 'transport' })).toBe('sofer');
  });

  it('o firmă de transport este transportator', () => {
    expect(audienceOf({ activeRole: 'owner', companyType: 'transport' })).toBe('transportator');
    expect(audienceOf({ activeRole: 'owner', companyType: 'both' })).toBe('transportator');
  });

  it('restul sunt clienți', () => {
    expect(audienceOf({ activeRole: 'owner', companyType: 'expeditie' })).toBe('client');
    expect(audienceOf({ activeRole: null, companyType: null })).toBe('client');
  });
});

// ---------------------------------------------------------------------
// Conținutul adevărat
// ---------------------------------------------------------------------
describe('răspunsurile scrise', () => {
  it('fiecare semn de întrebare de pe un ecran duce undeva real', () => {
    for (const [key, id] of Object.entries(CONTEXT_HELP)) {
      expect(findAnswer(HELP_SECTIONS, id), `${key} → ${id}`).not.toBeNull();
    }
  });

  it('și linkul are forma pe care o citește pagina', () => {
    expect(helpHref('messages')).toBe('/cont/ajutor?raspuns=de-ce-nu-vad-numarul-de-telefon');
  });

  it('fiecare răspuns are un public', () => {
    for (const section of HELP_SECTIONS) {
      for (const answer of section.answers) {
        expect(answer.audience.length, answer.id).toBeGreaterThan(0);
      }
    }
  });

  it('id-urile sunt unice', () => {
    const ids = HELP_SECTIONS.flatMap((s) => s.answers.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('niciun răspuns nu este gol', () => {
    for (const section of HELP_SECTIONS) {
      for (const answer of section.answers) {
        expect(answer.answer.length, answer.id).toBeGreaterThan(0);
        expect(answer.question.trim().length, answer.id).toBeGreaterThan(5);
      }
    }
  });

  it('fiecare tip de cont are ce citi', () => {
    for (const audience of ['transportator', 'client', 'sofer'] as const) {
      expect(countAnswers(forAudience(HELP_SECTIONS, audience)), audience)
        .toBeGreaterThan(0);
    }
  });

  it('scrise cu diacritice, nu cu sedile', () => {
    const all = HELP_SECTIONS
      .flatMap((s) => s.answers.flatMap((a) => [a.question, ...a.answer]))
      .join(' ');
    expect(/[ăâîșț]/.test(all)).toBe(true);
    expect(/[şţ]/.test(all)).toBe(false);
  });
});
