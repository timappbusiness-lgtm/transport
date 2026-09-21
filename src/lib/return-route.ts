/**
 * Returul dintr-o comandă.
 *
 * După ce ai dus o mașină la Timișoara, ești la Timișoara cu o
 * platformă goală. Momentul în care asta contează este când programezi
 * livrarea sau imediat după ea — nu peste trei zile, când ai plecat
 * deja gol.
 *
 * Ce face funcția de aici este **numai** să pregătească un formular:
 * întoarce ruta, alege o dată după livrarea estimată și păstrează
 * vehiculul. Publicarea trece prin formularul obișnuit de plecare, cu
 * toate gărzile lui. Nimic nu se publică singur — un anunț apărut fără
 * ca omul să apese este un anunț pe care nu îl caută nimeni când vrea
 * să îl retragă.
 */

export interface OrderForReturn {
  /** Unde s-a livrat: de acolo pleacă returul. */
  toCity: string;
  toCountry: string;
  toCounty: string | null;
  /** De unde a plecat marfa: destinația implicită a returului. */
  fromCity: string;
  fromCountry: string;
  fromCounty: string | null;
  vehicleId: string | null;
  /** Livrarea estimată sau cea reală, oricare există. */
  deliveryDate: string | null;
}

export interface ReturnPrefill {
  direction: 'retur';
  fromCity: string;
  fromCountry: string;
  fromCounty: string | null;
  toCity: string;
  toCountry: string;
  toCounty: string | null;
  vehicleId: string | null;
  availableFrom: string;
}

/**
 * Baza firmei, când o are. Altfel ne întoarcem de unde a plecat marfa —
 * care este cel mai bun lucru pe care îl putem ghici, pentru că acolo
 * era camionul acum două zile.
 */
export interface CarrierBase {
  city: string | null;
  county: string | null;
  country: string | null;
}

/** Ziua de după livrare, sau mâine dacă nu știm data livrării. */
export function returnDate(order: OrderForReturn, today: string): string {
  const base = order.deliveryDate !== null && order.deliveryDate >= today
    ? order.deliveryDate
    : today;
  const ms = Date.parse(`${base}T12:00:00.000Z`) + 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function buildReturn(
  order: OrderForReturn,
  today: string,
  base: CarrierBase | null = null,
): ReturnPrefill {
  const hasBase = base !== null && base.city !== null && base.city.trim() !== '';

  return {
    direction: 'retur',
    // Pleacă de unde s-a livrat. Asta este singura parte care nu se
    // ghicește: camionul chiar este acolo.
    fromCity: order.toCity,
    fromCountry: order.toCountry,
    fromCounty: order.toCounty,
    // Se întoarce spre bază dacă firma și-a trecut una, altfel spre
    // locul din care a plecat marfa.
    toCity: hasBase ? base.city!.trim() : order.fromCity,
    toCountry: hasBase ? (base.country ?? 'RO') : order.fromCountry,
    toCounty: hasBase ? base.county : order.fromCounty,
    vehicleId: order.vehicleId,
    availableFrom: returnDate(order, today),
  };
}

/** Ce se pune în adresa formularului de plecare. */
export function returnQuery(prefill: ReturnPrefill): string {
  const params = new URLSearchParams({
    directie: prefill.direction,
    de_la: prefill.fromCity,
    tara_de_la: prefill.fromCountry,
    pana_la: prefill.toCity,
    tara_pana_la: prefill.toCountry,
    din: prefill.availableFrom,
  });
  if (prefill.fromCounty !== null) params.set('judet_de_la', prefill.fromCounty);
  if (prefill.toCounty !== null) params.set('judet_pana_la', prefill.toCounty);
  if (prefill.vehicleId !== null) params.set('vehicul', prefill.vehicleId);
  return params.toString();
}
