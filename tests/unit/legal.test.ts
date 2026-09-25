import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENTS,
  needsTermsAcceptance,
  type LegalDocument,
} from '@/content/legal';
import {
  OPERATOR,
  REQUIRED_FIELDS,
  fiscalCode,
  missingLegalFields,
  operatorField,
  operatorLine,
  operatorPhoneHref,
  operatorShortLine,
} from '@/config/company';
import { RETIRED_REDRESS } from '@/config/consumer-redress';
import { ACTIVE_COMPANY_COOKIE, ACTIVE_COMPANY_COOKIE_DAYS } from '@/lib/auth/account';

const DOCUMENTS = Object.values(LEGAL_DOCUMENTS) as LegalDocument[];

describe('every legal document', () => {
  it('carries a version the database will accept', () => {
    // `terms_acceptances.version` has the same check. A document whose
    // version the column refuses is a document nobody can accept.
    for (const doc of DOCUMENTS) {
      expect(doc.version, doc.slug).toMatch(/^[0-9]+\.[0-9]+$/);
    }
  });

  it('carries a real date', () => {
    for (const doc of DOCUMENTS) {
      expect(doc.effectiveFrom, doc.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(doc.effectiveFrom)), doc.slug).toBe(false);
    }
  });

  it('is filed under the slug its page uses', () => {
    for (const [key, doc] of Object.entries(LEGAL_DOCUMENTS)) {
      expect(doc.slug).toBe(key);
    }
  });

  it('is Romanian, with its diacritics and without the Turkish cedilla', () => {
    for (const doc of DOCUMENTS) {
      const all = [doc.lede, ...doc.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])])]
        .join(' ');
      expect(/[ăâîșț]/i.test(all), doc.slug).toBe(true);
      // ş and ţ render close enough that nobody notices and break search,
      // sorting and screen readers.
      expect(/[şţŞŢ]/.test(all), doc.slug).toBe(false);
    }
  });

  it('has no English left in it', () => {
    for (const doc of DOCUMENTS) {
      const all = [doc.lede, ...doc.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])])]
        .join(' ');
      expect(
        /\b(Terms|Privacy|Cookie Policy|Please|Company|hereby|shall)\b/.test(all),
        doc.slug,
      ).toBe(false);
    }
  });

  it('says something in every section', () => {
    for (const doc of DOCUMENTS) {
      expect(doc.sections.length, doc.slug).toBeGreaterThan(2);
      for (const section of doc.sections) {
        expect(section.title.length, `${doc.slug}/${section.title}`).toBeGreaterThan(3);
        expect(section.body.length, `${doc.slug}/${section.title}`).toBeGreaterThan(0);
        for (const paragraph of section.body) {
          expect(paragraph.trim().length, `${doc.slug}/${section.title}`).toBeGreaterThan(20);
        }
      }
    }
  });

  it('never carries a placeholder somebody forgot to replace', () => {
    for (const doc of DOCUMENTS) {
      const all = JSON.stringify(doc);
      expect(/lorem ipsum|TODO|FIXME|XXX/i.test(all), doc.slug).toBe(false);
    }
  });
});

describe('the terms', () => {
  const terms = LEGAL_DOCUMENTS.termeni;
  const text = terms.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])]).join(' ');

  it('says we are not a party to the transport', () => {
    // The single most important sentence on the page: everything about
    // our liability follows from it.
    expect(text).toContain('Nu suntem parte în contractul de transport');
  });

  it('says what verification does not guarantee', () => {
    expect(text).toContain('nu garantăm că transportul va decurge bine');
  });

  it('says we never hold anybody money', () => {
    expect(text).toContain('Nu încasăm și nu ținem banii nimănui');
  });

  it('covers every subject the brief listed', () => {
    const titles = terms.sections.map((s) => s.title).join(' | ');
    for (const subject of [
      'Cine suntem',
      'Ce este platforma',
      'Cine își poate face cont',
      'Ce își asumă transportatorii',
      'Ce își asumă clienții',
      'firmă verificată',
      'Abonamente',
      'Ce nu se face aici',
      'Suspendare',
      'răspundem',
      'Reclamații',
      'Legea aplicabilă',
    ]) {
      expect(titles, subject).toContain(subject);
    }
  });

  it('is the version the account area gates on', () => {
    expect(CURRENT_TERMS_VERSION).toBe(terms.version);
  });
});

describe('the privacy notice', () => {
  const privacy = LEGAL_DOCUMENTS.confidentialitate;
  const text = privacy.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])]).join(' ');

  it('states the retention the database actually enforces', () => {
    // 24 months is the default in `deletion_settings.contact_reveal_months`
    // and the interval `purge_contact_reveals` deletes by.
    expect(text).toContain('24 de luni');
  });

  it('names every processor', () => {
    for (const processor of ['Supabase', 'Vercel', 'Anthropic']) {
      expect(text, processor).toContain(processor);
    }
  });

  it('says where the data lives', () => {
    expect(text).toContain('Uniunea Europeană');
  });

  it('admits what survives deletion', () => {
    // The one thing a privacy notice is tempted to leave out.
    expect(text).toContain('identificatorul tău intern');
    expect(text).toContain('Jurnalul deciziilor platformei rămâne');
  });

  it('points at the page where deletion actually happens', () => {
    const links = privacy.sections.flatMap((s) => (s.link ? [s.link.href] : []));
    expect(links).toContain('/cont/setari/date-personale');
  });
});

describe('the cookie notice', () => {
  const cookies = LEGAL_DOCUMENTS.cookies;
  const text = cookies.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])]).join(' ');

  it('names exactly the two cookies the application sets', () => {
    // If a third ever appears, this fails and somebody has to decide
    // whether it is necessary — which is the moment a banner becomes
    // mandatory rather than a decision made months later.
    expect(text).toContain('sb-');
    expect(text).toContain(`„${ACTIVE_COMPANY_COOKIE}"`);
  });

  it('says how long each lasts, and the code agrees', () => {
    // 1.0 said 30 days while the cookie was set for 365; the session
    // cookie „lasted the session" while the library keeps it 400 days.
    expect(ACTIVE_COMPANY_COOKIE_DAYS).toBe(30);
    expect(text).toContain(`Durează ${ACTIVE_COMPANY_COOKIE_DAYS} de zile`);
    expect(text).toContain('cel mult 400 de zile');
  });

  it('says there is no advertising and no analytics', () => {
    expect(text).toContain('Niciun cookie de publicitate');
    expect(text).toContain('Google Analytics');
  });

  it('explains why there is no banner', () => {
    expect(text).toContain('nu am avea ce să îți cerem');
  });

  it('mentions what sits in browser storage instead, all of it', () => {
    // Drafts (and their copy on the account), unsent short texts, files
    // waiting to upload, where you were on a board, the message id, a
    // dismissed note: 1.0 listed two of these and said none reached us.
    for (const kept of [
      'Ciorna unui formular lung',
      'o copie stă și în contul tău',
      'Textul scurt pe care nu l-ai trimis',
      'Pozele și documentele alese pentru încărcare',
      'Mai multe filtre',
      'Un identificator pentru următorul mesaj',
      'nota despre notificări',
    ]) {
      expect(text, kept).toContain(kept);
    }
    expect(text).not.toContain('nu ajung niciodată la noi');
  });
});

describe('needsTermsAcceptance', () => {
  it('asks somebody who has never accepted', () => {
    expect(needsTermsAcceptance(null)).toBe(true);
    expect(needsTermsAcceptance(undefined)).toBe(true);
    expect(needsTermsAcceptance('')).toBe(true);
  });

  it('asks again when the version moves', () => {
    expect(needsTermsAcceptance('0.9')).toBe(true);
  });

  it('leaves alone somebody who is current', () => {
    expect(needsTermsAcceptance(CURRENT_TERMS_VERSION)).toBe(false);
  });
});

describe('the operator details', () => {
  it('are the ones the owner gave, on 25 September 2026', () => {
    expect(OPERATOR).toEqual({
      legalName: 'MRO WEMAX SRL',
      cui: '41150110',
      vatPayer: true,
      regCom: 'J16/1561/2019',
      euid: 'ROONRC.J16/1561/2019',
      address: 'Str. Brăila 230, Craiova, jud. Dolj, cod poștal 200641, România',
      email: expect.stringMatching(/^[a-z]+@gmail\.com$/),
      privacyEmail: OPERATOR.email,
      phone: '0771 502 007',
    });
    // The mailbox is named after the brand, so it is not spelled out here:
    // tests/unit/brand.test.ts allows the name in one place only.
  });

  it('leave nothing for the legal pages to mark as missing', () => {
    expect(missingLegalFields()).toEqual([]);
    for (const field of REQUIRED_FIELDS) expect(operatorField(field), field).not.toContain('[de completat]');
  });

  it('write the fiscal code with RO, because the company pays VAT', () => {
    expect(fiscalCode()).toBe('RO 41150110');
    expect(operatorField('cui')).toBe('RO 41150110');
  });

  it('read as one sentence, and as one line for the footer and the e-mails', () => {
    expect(operatorLine()).toBe(
      'MRO WEMAX SRL, CUI RO 41150110, înregistrată la registrul comerțului sub J16/1561/2019, ' +
        'EUID ROONRC.J16/1561/2019, cu sediul în Str. Brăila 230, Craiova, jud. Dolj, cod poștal 200641, România',
    );
    expect(operatorShortLine()).toContain('MRO WEMAX SRL · CUI RO 41150110 · J16/1561/2019 · EUID ROONRC.J16/1561/2019');
  });

  it('dial as a tel: link with no spaces, on every page that shows the number', () => {
    // /cont/ajutor linked `tel:0771 502 007`; RFC 3966 allows no spaces.
    expect(operatorPhoneHref()).toBe('tel:0771502007');
    for (const page of ['src/app/contact/page.tsx', 'src/app/cont/ajutor/page.tsx']) {
      const source = readFileSync(page, 'utf8');
      expect(source, page).toContain('href={operatorPhoneHref()}');
      expect(source, page).not.toContain('tel:${OPERATOR.phone}');
    }
  });

  it('mark the Gmail addresses as temporary, in the code', () => {
    // Both addresses are to move to our own domain once it exists; the
    // comment is what reminds whoever opens the file.
    const source = readFileSync('src/config/company.ts', 'utf8');
    expect(source).toMatch(/TEMPORARY: both addresses are a Gmail mailbox until the platform's own\s+\/\/ domain is registered/);
  });
});

describe('consumer redress in the documents in force', () => {
  const all = Object.values(LEGAL_DOCUMENTS)
    .flatMap((d) => d.sections.flatMap((s) => [s.title, ...s.body, ...(s.list ?? []), s.link?.href ?? '']))
    .join(' ');

  it('no document sends a consumer to the closed European platform', () => {
    // It closed on 20 July 2025; terms 1.0 still pointed at it.
    expect(all).not.toContain('platforma europeană de soluționare online');
    expect(all).not.toContain(RETIRED_REDRESS.sol.href);
  });

  it('the terms name the ANPC platform the footer links to', () => {
    const terms = LEGAL_DOCUMENTS.termeni.sections.flatMap((s) => s.body).join(' ');
    expect(terms).toContain('reclamatiisal.anpc.ro');
  });

  it('the privacy policy says where an IP address is kept as it is', () => {
    const privacy = LEGAL_DOCUMENTS.confidentialitate.sections.flatMap((s) => [...s.body, ...(s.list ?? [])]).join(' ');
    expect(privacy).toContain('când accepți un contract de transport, păstrăm adresa IP și browserul așa cum sunt');
    expect(privacy).toContain('24 de luni, apoi se șterge');
  });
});
