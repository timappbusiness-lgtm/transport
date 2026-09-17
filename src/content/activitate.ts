/**
 * Romanian copy for the staff screen that sets the homepage thresholds.
 *
 * Kept out of `home.ts`, which is what a visitor reads. No figure is
 * written here either: the defaults live in the migration and the current
 * values come from the database.
 */
export const activityAdminCopy = {
  title: 'Activitate pe prima pagină',
  lede:
    'Cât de multă activitate trebuie să existe înainte ca prima pagină să o arate. Sub aceste praguri, secțiunea afișează mesajul că primele cereri urmează, fără cifre și fără carduri.',

  statsMin: 'Prag pentru statistici',
  statsMinHint:
    'Numărul minim de cereri publicate vreodată. Sub el, rândul cu graficul și kilometrii este ascuns complet.',
  feedMin: 'Prag pentru lista de cereri',
  feedMinHint:
    'Numărul minim de cereri active. Sub el, în locul cardurilor apare mesajul de așteptare.',
  save: 'Salvează pragurile',
  saved: 'Praguri salvate.',
  invalidStats: 'Introdu un număr între 0 și 100.000.',
  invalidFeed: 'Introdu un număr de cel puțin 1.',
  noAccess: 'Nu ai drepturi pentru această acțiune.',

  state: {
    title: 'Ce se vede acum',
    publishedTotal: 'Cereri publicate vreodată',
    activeTotal: 'Cereri active acum',
    week: 'Publicate în ultimele 7 zile',
    km: 'Kilometri estimați, în total',
    statsShown: 'Statisticile sunt vizibile',
    statsHidden: 'Statisticile sunt ascunse',
    feedShown: 'Lista de cereri este vizibilă',
    feedHidden: 'Lista de cereri este ascunsă',
    unavailable: 'Nu am putut citi activitatea din baza de date.',
    cached:
      'Cifrele sunt citite o dată pe minut. După salvare, prima pagină se actualizează imediat.',
  },
} as const;
