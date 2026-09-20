/**
 * „Jurnal" — the audit log, read by the people it holds to account.
 *
 * Nothing here promises more than the table holds: it says what was
 * recorded, not that everything was, and the note about what is missing
 * is part of the screen rather than a thing somebody has to know.
 */
export const auditCopy = {
  meta: { title: 'Jurnal' },
  hero: {
    eyebrow: 'Staff',
    title: 'Jurnal de acțiuni',
    lede: 'Fiecare decizie luată prin platformă: cine, ce, pe ce și de ce. Se citește, nu se modifică — nimeni nu are drept de scriere pe tabelul ăsta, nici noi.',
  },
  filters: {
    title: 'Filtre',
    actor: 'Cine a făcut',
    actorHint: 'Id-ul contului. Îl găsești pe orice rând din listă.',
    action: 'Ce acțiune',
    entity: 'Pe ce',
    from: 'De la',
    to: 'Până la',
    any: 'Oricare',
    apply: 'Caută',
    clear: 'Șterge filtrele',
    export: 'Descarcă CSV',
    exportHint: 'Exact rândurile filtrate acum, până la 5000.',
  },
  list: {
    /** Takes "120". */
    total: (n: string) => `${n} înregistrări`,
    page: (current: number, last: number) => `Pagina ${current} din ${last}`,
    previous: 'Înapoi',
    next: 'Înainte',
    actor: 'Autor',
    system: 'Sistem',
    reason: 'Motiv',
    changes: 'Ce s-a schimbat',
    noChanges: 'Fără modificări de câmpuri.',
    before: 'Înainte',
    after: 'După',
    show: 'Vezi diferențele',
    hide: 'Ascunde',
  },
  empty: {
    title: 'Nicio înregistrare pentru filtrele astea.',
    body: 'Jurnalul se scrie singur, la fiecare decizie luată prin platformă. Dacă lista e goală, fie filtrele sunt prea strânse, fie nu s-a întâmplat nimic în intervalul ales.',
    action: 'Vezi tot jurnalul',
  },
} as const;
