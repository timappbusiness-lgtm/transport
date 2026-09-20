import { BRAND_NAME } from '@/config/brand';

/**
 * Romanian copy for the authentication flows. Components never contain
 * hardcoded text, so a wording change is one edit here.
 */
export const authCopy = {
  signIn: {
    title: 'Autentificare',
    lede: 'Intră în contul tău pentru a-ți vedea cererile, documentele și firma.',
    email: 'Adresă de e-mail',
    password: 'Parolă',
    submit: 'Intră în cont',
    forgot: 'Ai uitat parola?',
    noAccount: 'Nu ai cont încă?',
    createAccount: 'Creează un cont',
  },
  chooseType: {
    title: 'Ce fel de cont îți trebuie?',
    lede: 'Poți schimba mai târziu, dar alegerea de acum stabilește ce documente îți cerem.',
    individual: {
      title: 'Persoană fizică',
      body: 'Vrei să muți o mașină. Publici o cerere și primești oferte de la transportatori.',
      cta: 'Continuă ca persoană fizică',
      note: 'Fără documente de firmă.',
    },
    company: {
      title: 'Firmă',
      body: 'Transportator, casă de expediții sau ambele. Ai nevoie de documentele firmei ca să poți oferta.',
      cta: 'Continuă ca firmă',
      note: 'Îți cerem CUI-ul și documentele de transport.',
    },
  },
  individualSignUp: {
    title: 'Cont persoană fizică',
    lede: 'Nume, e-mail, telefon și o parolă. Atât — publici imediat ce confirmi e-mailul.',
    fullName: 'Nume și prenume',
    email: 'Adresă de e-mail',
    phone: 'Telefon',
    // Said plainly, because the alternative is somebody waiting for an SMS
    // that is not coming. The number is what a carrier rings; it is not
    // confirmed by code, and we do not imply that it is.
    phoneHint: 'Numărul la care te sună transportatorul. Nu îți trimitem niciun cod prin SMS.',
    password: 'Parolă',
    passwordHint: 'Cel puțin 8 caractere.',
    terms: 'Am citit și accept',
    termsLink: 'Termenii și condițiile',
    and: 'și',
    privacyLink: 'Politica de confidențialitate',
    submit: 'Creează contul',
    hasAccount: 'Ai deja cont?',
    signIn: 'Autentifică-te',
  },
  companySignUp: {
    title: 'Cont de firmă',
    lede: 'Începem cu contul tău. Datele firmei le completezi imediat după ce confirmi e-mailul.',
    stepLabel: 'Pasul 1 din 2',
    stepTitle: 'Datele tale',
    nextStep: 'Pasul 2, după confirmarea e-mailului: CUI-ul și datele firmei.',
    verifyIntro: 'Documentele firmei sunt verificate de echipa noastră înainte de prima ofertă.',
    verifyLink: 'Cum verificăm firmele',
    fullName: 'Nume și prenume',
    email: 'Adresă de e-mail de serviciu',
    password: 'Parolă',
    passwordHint: 'Cel puțin 8 caractere.',
    terms: 'Am citit și accept',
    submit: 'Continuă',
    hasAccount: 'Ai deja cont?',
    signIn: 'Autentifică-te',
  },
  confirmEmail: {
    title: 'Verifică-ți e-mailul',
    lede: `Ți-am trimis un link de confirmare. Deschide-l ca să îți activezi contul ${BRAND_NAME}.`,
    noEmail: 'Nu a ajuns niciun e-mail?',
    checkSpam: 'Verifică și folderul de spam — uneori ajunge acolo.',
    resend: 'Trimite din nou',
    resent: 'Am trimis din nou e-mailul de confirmare.',
    emailLabel: 'Adresa de e-mail',
  },
  resetPassword: {
    title: 'Resetare parolă',
    lede: 'Îți trimitem un link prin care îți poți alege o parolă nouă.',
    email: 'Adresă de e-mail',
    submit: 'Trimite linkul',
    sent: 'Dacă există un cont cu această adresă, ți-am trimis un link de resetare.',
    backToSignIn: 'Înapoi la autentificare',
  },
  newPassword: {
    title: 'Alege o parolă nouă',
    lede: 'Introdu parola nouă. După salvare te autentificăm automat.',
    password: 'Parolă nouă',
    passwordHint: 'Cel puțin 8 caractere.',
    submit: 'Salvează parola',
    invalidLink:
      'Linkul de resetare a expirat sau a fost deja folosit. Cere unul nou.',
    requestNew: 'Cere un link nou',
  },
} as const;
