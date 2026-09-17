import { ROUTES } from '@/config/routes';

/**
 * Romanian copy for /abonamente.
 *
 * Every figure on that page — a price, a total, a saving, a number of free
 * months — comes from the database and is computed in `src/lib/plans.ts`.
 * Nothing in this file holds one. The sentences that frame a figure take it
 * as an argument, which is what makes it impossible for the copy to state a
 * discount the prices do not support.
 *
 * What the reference site does and this page does not: "cel mai popular",
 * an "insignă premium" that looks like our verified badge, crossed-out
 * prices, and percentages nobody can check.
 */

export const plansCopy = {
  meta: {
    title: 'Abonamente',
    description:
      'Cererile și traseele se consultă gratuit. Abonamentul deblochează contactele, publicarea nelimitată și alertele pe e-mail.',
  },

  header: {
    eyebrow: 'Abonamente',
    strong: 'Plătești pentru contacte,',
    soft: 'nu pentru a vedea bursa.',
    subtitle:
      'Cererile de transport și traseele se consultă gratuit. Abonamentul deblochează contactele clienților, mai multe trasee publicate și alertele pe e-mail.',
    /** Takes the trial as "30 de zile". */
    trust: (days: string) =>
      `Perioada gratuită de ${days} începe când firma este aprobată. Fără card la înscriere.`,
    noTrial: 'Fără card la înscriere.',
  },

  controls: {
    audience: 'Pentru cine',
    billing: 'Perioadă de facturare',
  },

  card: {
    recommended: {
      carrier: 'Recomandat pentru transportatori',
      forwarder: 'Recomandat pentru case de expediții',
    },
    perMonth: 'pe lună',
    /** Takes "1.490 lei la 12 luni". */
    billed: (total: string) => `Facturat ${total}`,
    free: 'Gratuit',
    noPeriod: 'Planul acesta se facturează doar lunar.',
    limits: {
      title: 'Limite',
      contacts: 'contacte pe lună',
      trucks: 'trasee active',
      cargo: 'cereri active',
      searches: 'căutări salvate',
    },
    comingSoon: 'în curând',
    cta: {
      free: 'Înscrie firma',
      signedOut: 'Începe perioada gratuită',
      manager: 'Alege planul',
      current: 'Planul tău actual',
      pending: 'Cerere trimisă',
      notManager: 'Doar administratorii firmei pot alege planul',
    },
  },

  dialog: {
    title: 'Confirmi planul?',
    /** Takes the plan name and the period. */
    summary: (plan: string, period: string) => `${plan}, facturat ${period}.`,
    /** Takes the total. */
    total: (total: string) => `Total: ${total}`,
    manual: 'În perioada de lansare emitem factură, iar plata se face prin transfer bancar. Nu se ia niciun ban acum.',
    notes: 'Mențiuni pentru factură (opțional)',
    notesPlaceholder: 'Date de facturare, persoană de contact, altceva de știut',
    submit: 'Trimite cererea',
    cancel: 'Renunță',
    sent: 'Am primit cererea. Te contactăm pentru factură și activare.',
  },

  comparison: {
    title: 'Compară planurile',
    lede: 'Ce intră în fiecare plan. Ce scrie „în curând” încă nu există în platformă.',
    feature: 'Ce include',
    groups: {
      acces: 'Acces',
      publicare: 'Publicare',
      alerte: 'Alerte',
      echipa: 'Echipă',
      suport: 'Suport',
      altele: 'Altele',
    },
    showPlan: 'Vezi ce include',
  },

  never: {
    title: 'Ce nu plătești niciodată',
    items: [
      {
        title: 'Verificarea documentelor',
        body: 'Documentele firmei și ale vehiculelor sunt verificate de echipa noastră pentru orice plan, inclusiv cel gratuit. Statutul de firmă verificată nu se cumpără.',
      },
      {
        title: 'Consultarea cererilor și traseelor',
        body: 'Bursa se vede fără cont și fără abonament. Plătești când vrei să iei legătura cu cineva.',
      },
      {
        title: 'Comision din transport',
        body: 'Nu luăm procent din prețul transportului. Ce negociezi cu clientul rămâne între voi.',
      },
    ],
  },

  faq: {
    title: 'Întrebări despre facturare',
    items: [
      {
        id: 'cand-incepe',
        question: 'Când începe plata?',
        answerWithTrial: (days: string) =>
          `După perioada gratuită de ${days}, care începe în ziua în care firma este aprobată, nu când îți faci contul. Îți scriem înainte să se încheie.`,
        answerNoTrial:
          'Din momentul în care alegi un plan și noi îl activăm. Îți scriem înainte de fiecare reînnoire.',
      },
      {
        id: 'cum-se-plateste',
        question: 'Cum se face plata?',
        manual:
          'În perioada de lansare emitem factură, iar plata se face prin transfer bancar. Plata cu cardul va fi disponibilă ulterior.',
        automatic:
          'Plata se face cu cardul, la începutul fiecărei perioade. Primești factura pe e-mail.',
      },
      {
        id: 'schimb-planul',
        question: 'Pot schimba planul?',
        answer:
          'Da. Scrie-ne sau alege alt plan din această pagină și îl schimbăm de la perioada următoare. Dacă treci la un plan mai mare în timpul perioadei, facturăm doar diferența.',
      },
      {
        id: 'la-final',
        question: 'Ce se întâmplă la finalul abonamentului?',
        answer:
          'Contul rămâne al tău și istoricul se păstrează: firma, documentele, traseele și comenzile de până atunci. Se blochează contactele noi și revii la limitele planului gratuit.',
      },
      {
        id: 'factura',
        question: 'Primesc factură?',
        answer:
          'Da, factură pe firmă, cu CUI-ul din contul tău. O trimitem pe e-mailul de contact al firmei.',
      },
      {
        id: 'anulare',
        question: 'Pot anula?',
        answer:
          'Da, oricând, fără perioadă minimă de la o perioadă la alta. Abonamentul rămâne activ până la finalul perioadei deja facturate.',
      },
    ],
    links: {
      faq: { href: ROUTES.faq, label: 'Toate întrebările frecvente' },
      verification: { href: ROUTES.verification, label: 'Cum verificăm firmele' },
    },
  },
} as const;
