/**
 * The words for keeping somebody's place: a draft restored, a draft
 * saved, a session that ended, a page left with changes on it.
 *
 * Short on purpose. These appear in the middle of somebody's work, and the
 * whole point of them is that the work goes on.
 */
export const continuityCopy = {
  session: {
    expired:
      'Sesiunea ta a expirat. Ce ai completat pe pagina asta a rămas aici — intră din nou în cont într-o filă nouă și revino.',
    restored: 'Ești din nou în cont. Apasă încă o dată pe butonul formularului; totul e cum l-ai lăsat.',
    signInAgain: 'Intră din nou în cont',
    inlineLink: 'Intră din nou în cont (se deschide o filă nouă)',
    close: 'Închide',
  },
  reconnected: {
    title: 'Ești din nou în cont',
    lede: 'Poți închide fila asta. Formularul tău te așteaptă în fila în care lucrai, cu tot ce completaseși — apasă din nou pe buton acolo.',
    notSignedIn: 'Încă nu ești în cont pe acest dispozitiv.',
    signIn: 'Intră în cont',
    account: 'Mergi la contul tău',
  },
  draft: {
    saved: 'Salvat',
    savedOnAccount: 'Salvat în cont',
    saving: 'Se salvează…',
    restored: (when: string) => `Am păstrat ce completaseși ${when}. Continui de unde ai rămas.`,
    startOver: 'Începe din nou',
    startOverConfirm: 'Ștergi tot ce ai completat și începi de la zero?',
  },
  leave: {
    confirm: 'Ai modificări nesalvate pe pagina asta. Pleci fără să le salvezi?',
  },
  upload: {
    retry: 'Încearcă din nou',
    kept: 'Fișierul a rămas ales — încearcă din nou când ai semnal.',
    progress: (percent: number) => `Se încarcă… ${percent}%`,
  },
} as const;

/** „azi la 14:05", „ieri la 09:12", „pe 3 octombrie la 18:40". */
export function whenSaved(savedAt: number, now: number = Date.now()): string {
  const saved = new Date(savedAt);
  const time = saved.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Bucharest',
  });
  const day = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
  if (day(saved) === day(new Date(now))) return `azi la ${time}`;
  if (day(saved) === day(new Date(now - 24 * 60 * 60 * 1000))) return `ieri la ${time}`;
  const date = saved.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Bucharest',
  });
  return `pe ${date} la ${time}`;
}
