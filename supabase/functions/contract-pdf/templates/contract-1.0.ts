/**
 * Contract de transport, model 1.0.
 *
 * DRAFT FOR LEGAL REVIEW. Written by the team from how the platform
 * actually works; a lawyer has not yet read it. `docs/09-verificare-juridica.md`
 * lists the clauses to check. Until then every contract drawn from this
 * model says so on its first page.
 *
 * This file never changes once a contract has been generated from it: a
 * contract generated in September must read in December exactly as it
 * read in September. A wording change is a new file, `contract-1.1.ts`,
 * registered in `index.ts`, with `contract_template_version()` bumped in
 * a migration. Versions already generated keep pointing at this one.
 *
 * Plain Romanian, short sentences, one obligation per line. The values
 * come from `model.ts`; nothing here formats a date or a price.
 */

import type { Block, ContractDocument, ContractTemplate } from '../document.ts';
import type { AcceptanceFacts, ContractFacts, PartyFacts } from '../model.ts';

const VERSION = '1.0';

function partyBlocks(number: string, party: PartyFacts): Block[] {
  const blocks: Block[] = [{ kind: 'subheading', text: `${number} ${party.role}: ${party.name}` }];
  if (party.kind === 'missing') {
    blocks.push({ kind: 'paragraph', text: 'Datele acestei părți lipsesc din comandă.', muted: true });
    return blocks;
  }
  blocks.push({ kind: 'rows', rows: party.rows });
  if (party.kind === 'individual') {
    blocks.push({
      kind: 'paragraph',
      muted: true,
      text:
        'Persoană fizică. Platforma nu cere și nu păstrează codul numeric personal sau adresa de domiciliu. ' +
        'La predare și la primire, identitatea persoanei se poate verifica după actul de identitate, fără ca datele lui să fie trecute în contract.',
    });
  }
  return blocks;
}

function acceptanceState(facts: ContractFacts, side: 'carrier' | 'client'): string {
  const a = facts.thisVersion[side];
  return a ? `${a.line}.` : 'Neacceptat încă.';
}

/** The earlier version whose acceptances the footer repeats: the newest one that has any. */
function previousAccepted(facts: ContractFacts): AcceptanceFacts[] {
  const earlier = facts.acceptances.filter((a) => a.version < facts.version);
  if (earlier.length === 0) return [];
  const newest = Math.max(...earlier.map((a) => a.version));
  return earlier.filter((a) => a.version === newest);
}

function footerLines(facts: ContractFacts): string[] {
  const state = (side: 'carrier' | 'client') => {
    const a = facts.thisVersion[side];
    return a ? `${a.sideLabel} — ${a.name}, ${a.at}` : `${side === 'carrier' ? 'transportatorul' : 'beneficiarul'} — neacceptat încă`;
  };
  const lines = [`Acceptări versiunea ${facts.version}: ${state('carrier')}; ${state('client')}.`];
  const previous = previousAccepted(facts);
  if (previous.length > 0) {
    const v = previous[0]!.version;
    lines.push(
      `Versiunea ${v}: ${previous.map((a) => `${a.sideLabel} — ${a.name}, ${a.at}`).join('; ')}.`,
    );
  }
  return lines;
}

function build(facts: ContractFacts, createdAt: string | null): ContractDocument {
  const b: Block[] = [];

  b.push({
    kind: 'notice',
    title: 'Proiect de contract, în curs de verificare juridică',
    text:
      'Modelul acestui contract a fost scris de echipa platformei și nu a fost încă verificat de un avocat. ' +
      'Datele din el sunt cele înregistrate în platformă la data generării. Părțile pot cere oricând ca înțelegerea lor să fie completată cu un contract redactat separat.',
  });
  if (facts.superseded) {
    b.push({
      kind: 'notice',
      title: `Versiune înlocuită de versiunea ${facts.latestVersion}`,
      text:
        'După generarea acestei versiuni s-a generat una mai nouă. Aceasta rămâne disponibilă, neschimbată, ca istoric. ' +
        'Acceptarea se face numai pe ultima versiune.',
    });
  }
  if (facts.redacted) {
    b.push({
      kind: 'notice',
      title: 'Date anonimizate',
      text:
        'O parte și-a exercitat dreptul la ștergerea datelor. Numele și datele ei de contact au fost înlocuite în acest document; restul conținutului a rămas cel generat.',
    });
  }

  const offerLine = facts.offerAcceptedAt
    ? `oferta transportatorului, acceptată de beneficiar la ${facts.offerAcceptedAt}`
    : 'oferta transportatorului, acceptată de beneficiar';
  b.push({
    kind: 'paragraph',
    text:
      `Prezentul contract se încheie prin platforma ${facts.brand}, pe baza cererii de transport publicate de beneficiar și a ${offerLine}. ` +
      'Toate datele de mai jos sunt cele înregistrate și verificate în platformă la data generării acestei versiuni și nu se mai schimbă.',
  });

  // 1. Părțile
  b.push({ kind: 'heading', text: '1. Părțile contractului' });
  b.push(...partyBlocks('1.1', facts.carrier));
  b.push(...partyBlocks('1.2', facts.client));

  // 2. Platforma
  b.push({ kind: 'heading', text: '2. Rolul platformei' });
  b.push({
    kind: 'paragraph',
    text: `${facts.brand} este o platformă online operată de ${facts.operator.name}:`,
  });
  b.push({ kind: 'rows', rows: facts.operator.rows });
  b.push({
    kind: 'paragraph',
    text:
      'Platforma pune în legătură beneficiari cu transportatori ale căror documente le verifică, și păstrează înregistrarea ofertei, a comenzii și a acestui contract.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Platforma este intermediar. Nu este parte la acest contract de transport, nu execută transportul, nu încasează prețul și nu răspunde pentru obligațiile pe care și le asumă părțile. ' +
      'Verificarea unui document de către platformă arată că documentul a fost prezentat și aprobat la data trecută în dreptul lui; nu garantează conduita transportatorului.',
  });

  // 3. Obiectul
  b.push({ kind: 'heading', text: '3. Obiectul contractului' });
  b.push({
    kind: 'paragraph',
    text:
      'Transportatorul se obligă să preia vehiculul descris la punctul 5.2 de la locul de încărcare și să îl predea la locul de descărcare, în intervalele convenite. ' +
      'Beneficiarul se obligă să predea vehiculul, să asigure primirea lui la destinație și să plătească prețul convenit.',
  });

  // 4. Acte verificate
  b.push({ kind: 'heading', text: '4. Transportatorul: documente verificate' });
  b.push({
    kind: 'paragraph',
    text:
      'Documentele de mai jos au fost încărcate de transportator și aprobate de echipa platformei. Sunt reproduse cu numărul, valabilitatea și data verificării, așa cum erau la generarea acestei versiuni.',
  });
  b.push({ kind: 'subheading', text: '4.1 Documentele firmei' });
  if (facts.companyCredentials.length > 0) {
    b.push({
      kind: 'table',
      columns: ['Document', 'Număr', 'Valabilitate', 'Verificare'],
      widths: [0.28, 0.2, 0.27, 0.25],
      rows: facts.companyCredentials.map((c) => [c.label, c.number, c.validity, c.checked]),
    });
  }
  if (facts.missingCompanyCredentials.length > 0) {
    b.push({
      kind: 'paragraph',
      text: `La data generării nu exista în platformă un document aprobat pentru: ${facts.missingCompanyCredentials.join(', ')}.`,
    });
  }

  b.push({ kind: 'subheading', text: '4.2 Vehiculul care execută transportul' });
  if (facts.vehicle) {
    b.push({
      kind: 'rows',
      rows: [
        { label: 'Număr de înmatriculare', value: facts.vehicle.plate },
        { label: 'Vehicul', value: facts.vehicle.description },
        { label: 'Sursa', value: facts.vehicle.source },
      ],
    });
    if (facts.vehicle.documents.length > 0) {
      b.push({
        kind: 'table',
        columns: ['Document', 'Număr', 'Valabilitate', 'Verificare'],
        widths: [0.28, 0.2, 0.27, 0.25],
        rows: facts.vehicle.documents.map((c) => [c.label, c.number, c.validity, c.checked]),
      });
    }
    b.push({ kind: 'paragraph', text: facts.vehicle.copieConforma });
    const missing = facts.vehicle.missing.filter((m) => m !== 'copie conformă');
    if (missing.length > 0) {
      b.push({
        kind: 'paragraph',
        text: `La data generării nu exista în platformă un document aprobat pentru vehicul: ${missing.join(', ')}.`,
      });
    }
    b.push({
      kind: 'paragraph',
      text:
        'Transportatorul poate executa transportul cu alt vehicul de aceeași categorie, cu documente valabile, dacă îl anunță pe beneficiar înainte de încărcare. ' +
        'O schimbare de vehicul se poate consemna într-o versiune nouă a contractului.',
    });
  } else {
    b.push({
      kind: 'paragraph',
      text:
        'La data generării transportatorul nu alocase încă un vehicul comenzii. Vehiculul și documentele lui apar într-o versiune generată după alocare.',
    });
  }

  // 5. Transportul
  b.push({ kind: 'heading', text: '5. Transportul' });
  b.push({ kind: 'subheading', text: '5.1 Traseul și intervalele' });
  b.push({
    kind: 'rows',
    rows: [
      { label: 'Traseu', value: facts.route.line },
      { label: 'Locul de încărcare', value: facts.route.from },
      { label: 'Locul de descărcare', value: facts.route.to },
      { label: 'Încărcare', value: facts.pickupWindow },
      { label: 'Livrare', value: facts.deliveryWindow },
      {
        label: 'Nivel de serviciu',
        value: facts.service
          ? facts.service.note
            ? `${facts.service.label} — ${facts.service.note}`
            : facts.service.label
          : 'nemenționat',
      },
      { label: 'Tipul transportului', value: facts.route.international ? 'internațional' : 'intern' },
      { label: 'Scrisoare de transport (CMR)', value: facts.cmrNumber ?? 'se completează la încărcare' },
    ],
  });
  b.push({ kind: 'subheading', text: `5.2 Vehiculul transportat: ${facts.cargo?.title ?? 'nemenționat'}` });
  if (facts.cargo) {
    b.push({ kind: 'rows', rows: facts.cargo.rows });
    b.push({
      kind: 'paragraph',
      muted: true,
      text: 'Starea vehiculului este cea declarată de beneficiar în cerere. Ea se verifică la încărcare, după punctul 9.',
    });
  }
  if (facts.requestDescription) {
    b.push({ kind: 'paragraph', text: `Din cererea beneficiarului: „${facts.requestDescription}"` });
  }

  // 6. Prețul
  b.push({ kind: 'heading', text: '6. Prețul și plata' });
  b.push({
    kind: 'rows',
    rows: [
      { label: 'Preț convenit', value: facts.price },
      { label: 'Termen de plată', value: facts.paymentTerm ?? 'nemenționat' },
    ],
  });
  b.push({
    kind: 'paragraph',
    text:
      'Prețul este cel din oferta acceptată și acoperă transportul de la locul de încărcare la locul de descărcare, cu încărcarea și descărcarea vehiculului. ' +
      'Un cost în plus se datorează numai dacă ambele părți l-au convenit în scris înainte să fie făcut.',
  });
  b.push({
    kind: 'paragraph',
    text: facts.paymentTerm
      ? `Beneficiarul plătește prețul direct transportatorului, în ${facts.paymentTerm} de la primirea facturii, pe care transportatorul o emite după livrare.`
      : 'Beneficiarul plătește prețul direct transportatorului, la livrare, dacă părțile nu convin altfel în scris.',
  });
  b.push({
    kind: 'paragraph',
    text: 'Platforma nu încasează prețul și nu garantează plata lui.',
  });
  b.push({ kind: 'subheading', text: '6.1 Condiții speciale din ofertă' });
  b.push({
    kind: 'paragraph',
    text: facts.conditions ? `„${facts.conditions}"` : 'Oferta acceptată nu conține condiții speciale.',
  });

  // 7. Transportatorul
  b.push({ kind: 'heading', text: '7. Obligațiile transportatorului' });
  b.push({
    kind: 'list',
    items: [
      'Preia vehiculul în intervalul de încărcare și îl predă în intervalul de livrare convenite.',
      'Are, pe toată durata transportului, licența de transport și asigurarea de răspundere (CMR) valabile.',
      'Constată starea vehiculului la încărcare, împreună cu beneficiarul sau cu persoana desemnată de el, și consemnează orice avarie existentă.',
      'Fixează vehiculul pe platformă după regulile de siguranță a încărcăturii și nu transportă alte bunuri în el.',
      'Îl anunță pe beneficiar, fără întârziere, despre orice întârziere, avarie sau împiedicare.',
      'Folosește datele de contact ale beneficiarului numai pentru executarea acestui contract.',
    ],
  });

  // 8. Beneficiarul
  b.push({ kind: 'heading', text: '8. Obligațiile beneficiarului' });
  b.push({
    kind: 'list',
    items: [
      'Predă vehiculul la locul și în intervalul de încărcare, cu cheile și actele necesare transportului.',
      'Nu lasă în vehicul bunuri personale sau de valoare. Transportatorul nu răspunde pentru ele.',
      'Declară corect starea vehiculului: dacă pornește, dacă frânele și direcția funcționează, ce avarii are.',
      'Asigură primirea vehiculului la destinație, personal sau prin persoana desemnată, și verifică starea lui la primire.',
      'Plătește prețul la termen.',
      'Îl anunță pe transportator din timp despre orice schimbare a locului sau a intervalului.',
    ],
  });

  // 9. Predarea
  b.push({ kind: 'heading', text: '9. Predarea și primirea vehiculului' });
  b.push({
    kind: 'paragraph',
    text:
      'La încărcare și la descărcare, părțile sau persoanele desemnate de ele verifică împreună starea vehiculului și semnează scrisoarea de transport sau un proces-verbal de predare-primire. ' +
      'Fotografiile datate, din toate părțile vehiculului, făcute la încărcare și la livrare, se pot încărca în platformă, în pagina comenzii.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Avariile vizibile se trec pe loc în documentul semnat la descărcare. O avarie care nu putea fi văzută la primire se comunică transportatorului în scris, cu fotografii, în cel mult 7 zile de la livrare.',
  });
  b.push({
    kind: 'paragraph',
    text: 'Primirea fără obiecții consemnate arată, până la proba contrară, că vehiculul a fost livrat în starea în care a fost preluat.',
  });

  // 10. Avarii
  b.push({ kind: 'heading', text: '10. Avarii, pierderi și întârzieri' });
  b.push({
    kind: 'paragraph',
    text:
      'Transportatorul răspunde pentru pierderea sau avarierea vehiculului produsă între preluare și predare, precum și pentru depășirea intervalului de livrare. ' +
      'Nu răspunde dacă dovedește că paguba vine dintr-un viciu propriu al vehiculului, dintr-o faptă a beneficiarului sau dintr-o împrejurare pe care nu o putea evita și ale cărei urmări nu le putea împiedica.',
  });
  b.push({
    kind: 'paragraph',
    text: facts.route.international
      ? 'Transportul este internațional: răspunderea transportatorului, cu limitele și termenele ei, este cea din Convenția privind contractul de transport internațional de mărfuri pe șosele (CMR, Geneva, 1956).'
      : 'Transportul este intern: răspunderea transportatorului este cea din Codul civil pentru contractul de transport de bunuri.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Asigurarea de răspundere a transportatorului (punctul 4.1) acoperă paguba în limitele poliței. Beneficiarul poate încheia, pe cheltuiala lui, o asigurare a vehiculului pentru valoarea lui întreagă. ' +
      'O reclamație se face în scris, cu descrierea pagubei și dovezile ei; transportatorul o transmite asigurătorului său când paguba intră sub asigurare.',
  });

  // 11. Forța majoră și anularea
  b.push({ kind: 'heading', text: '11. Forța majoră și anularea' });
  b.push({
    kind: 'paragraph',
    text:
      'Nicio parte nu răspunde pentru neexecutarea cauzată de forța majoră, dovedită în condițiile legii, dacă a anunțat-o celeilalte fără întârziere. ' +
      'Dacă împiedicarea durează mai mult de 5 zile, oricare parte poate renunța la contract, fără despăgubiri.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Anularea comenzii se face din platformă, cu motivul ei, și rămâne înregistrată. Partea care anulează după ce cealaltă a făcut cheltuieli pentru executare îi datorează cheltuielile dovedite.',
  });

  // 12. Litigii
  b.push({ kind: 'heading', text: '12. Neînțelegeri și litigii' });
  b.push({
    kind: 'paragraph',
    text:
      'Părțile încearcă întâi să rezolve orice neînțelegere direct, în scris, în 15 zile de la sesizare. ' +
      'La cererea oricăreia, platforma pune la dispoziția părților înregistrările comenzii — oferta, mesajele, dovezile de predare și acest contract, cu acceptările lui —, dar nu judecă și nu decide în litigiu.',
  });
  b.push({
    kind: 'paragraph',
    text: 'Dacă nu se ajunge la o înțelegere, litigiul se soluționează de instanțele competente din România.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Dacă beneficiarul este consumator — o persoană fizică ce nu acționează în scop profesional —, el păstrează toate drepturile pe care i le dă legea, ' +
      'inclusiv pe acela de a se adresa Autorității Naționale pentru Protecția Consumatorilor, unei entități de soluționare alternativă a litigiilor (SAL) și instanței de la domiciliul său.',
  });

  // 13. Date personale
  b.push({ kind: 'heading', text: '13. Date personale' });
  b.push({
    kind: 'paragraph',
    text:
      'Fiecare parte primește datele de contact ale celeilalte numai pentru executarea acestui contract și le prelucrează ca operator independent, potrivit Regulamentului (UE) 2016/679 (GDPR).',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Operatorul platformei păstrează contractul, versiunile lui și înregistrarea acceptărilor cât timp păstrează datele transportului, după politica de confidențialitate a platformei. ' +
      'O cerere de ștergere a datelor anonimizează numele și datele de contact din aceste înregistrări, fără să șteargă faptul că au existat.',
  });

  // 14. Legea
  b.push({ kind: 'heading', text: '14. Legea aplicabilă' });
  b.push({
    kind: 'paragraph',
    text: facts.route.international
      ? 'Contractul este guvernat de legea română și, pentru ce ține de transportul internațional, de Convenția CMR. Se încheie în limba română.'
      : 'Contractul este guvernat de legea română. Se încheie în limba română.',
  });

  // 15. Acceptarea
  b.push({ kind: 'heading', text: '15. Acceptarea electronică în platformă' });
  b.push({
    kind: 'paragraph',
    text:
      'Contractul se încheie când ambele părți acceptă aceeași versiune, fiecare din contul ei în platformă, după autentificare.',
  });
  b.push({ kind: 'paragraph', text: 'La fiecare acceptare, platforma înregistrează:' });
  b.push({
    kind: 'list',
    items: [
      'contul și numele persoanei care acceptă și firma în numele căreia acceptă;',
      'data și ora acceptării;',
      'adresa IP și browserul de pe care s-a acceptat;',
      'versiunea contractului și amprenta lui digitală (SHA-256), care arată că textul acceptat este exact cel generat.',
    ],
  });
  b.push({
    kind: 'paragraph',
    text:
      'Înregistrarea nu mai poate fi modificată și apare în jurnalul platformei. Adresa IP și browserul sunt vizibile numai echipei platformei.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Acceptarea electronică în platformă nu este o semnătură electronică calificată în sensul Regulamentului (UE) nr. 910/2014 (eIDAS). ' +
      'Este modul în care fiecare parte își exprimă acordul, iar părțile o recunosc ca dovadă a încheierii contractului. ' +
      'Oricare parte poate cere ca, în plus, contractul să fie semnat olograf sau cu semnătură electronică calificată.',
  });
  b.push({
    kind: 'paragraph',
    text:
      'Dacă datele comenzii se schimbă după generare, se poate genera o versiune nouă. Versiunile anterioare rămân disponibile și neschimbate; se acceptă numai ultima versiune.',
  });

  // Acceptări
  b.push({ kind: 'heading', text: 'Acceptări' });
  b.push({
    kind: 'rows',
    rows: [
      { label: `Transportatorul (versiunea ${facts.version})`, value: acceptanceState(facts, 'carrier') },
      { label: `Beneficiarul (versiunea ${facts.version})`, value: acceptanceState(facts, 'client') },
    ],
  });
  const earlier = facts.acceptances.filter((a) => a.version < facts.version);
  if (earlier.length > 0) {
    b.push({ kind: 'subheading', text: 'Versiunile anterioare' });
    b.push({ kind: 'list', items: earlier.map((a) => `Versiunea ${a.version}: ${a.line}.`) });
  }

  return {
    title: 'Contract de transport',
    subtitle: `nr. ${facts.contractNumber} · versiunea ${facts.version}`,
    meta: [
      { label: 'Număr', value: facts.contractNumber },
      {
        label: 'Versiune',
        value: facts.superseded ? `${facts.version} (înlocuită de ${facts.latestVersion})` : String(facts.version),
      },
      { label: 'Generat la', value: facts.generatedAt },
      { label: 'Generat de', value: facts.generatedBy },
      { label: 'Model de contract', value: VERSION },
      { label: 'Amprentă (SHA-256)', value: facts.snapshotHash },
    ],
    blocks: b,
    footer: {
      left: `Contract ${facts.contractNumber} · versiunea ${facts.version} · generat la ${facts.generatedAt}`,
      lines: footerLines(facts),
    },
    info: {
      title: `Contract de transport ${facts.contractNumber}, versiunea ${facts.version}`,
      subject: `Transport ${facts.route.line}`,
      author: facts.brand,
      keywords: `contract de transport, ${facts.contractNumber}, v${facts.version}, model ${VERSION}`,
      createdAt,
    },
  };
}

export const CONTRACT_1_0: ContractTemplate = { version: VERSION, build };
