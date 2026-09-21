import { describe, expect, it } from 'vitest';
import {
  buildReturn,
  returnDate,
  returnQuery,
  type CarrierBase,
  type OrderForReturn,
} from '@/lib/return-route';

/**
 * Returul dintr-o comandă.
 *
 * Singurul lucru care nu se ghicește este de unde pleacă: camionul
 * chiar este acolo unde a livrat. Restul sunt presupuneri, iar testele
 * de aici fixează care presupunere se face și când.
 */

const TODAY = '2026-10-01';

function order(over: Partial<OrderForReturn> = {}): OrderForReturn {
  return {
    fromCity: 'München',
    fromCountry: 'DE',
    fromCounty: null,
    toCity: 'Timișoara',
    toCountry: 'RO',
    toCounty: 'TM',
    vehicleId: 'v1',
    deliveryDate: '2026-10-05',
    ...over,
  };
}

describe('data returului', () => {
  it('este ziua de după livrare', () => {
    expect(returnDate(order(), TODAY)).toBe('2026-10-06');
  });

  it('mâine, dacă nu știm data livrării', () => {
    expect(returnDate(order({ deliveryDate: null }), TODAY)).toBe('2026-10-02');
  });

  it('și tot mâine dacă livrarea a fost deja', () => {
    // O comandă livrată săptămâna trecută nu produce un retur cu data
    // de săptămâna trecută.
    expect(returnDate(order({ deliveryDate: '2026-09-20' }), TODAY)).toBe('2026-10-02');
  });

  it('trece peste sfârșitul lunii fără să se clatine', () => {
    expect(returnDate(order({ deliveryDate: '2026-10-31' }), TODAY)).toBe('2026-11-01');
  });
});

describe('ruta', () => {
  it('pleacă de unde s-a livrat', () => {
    const prefill = buildReturn(order(), TODAY);
    expect(prefill.fromCity).toBe('Timișoara');
    expect(prefill.fromCountry).toBe('RO');
    expect(prefill.fromCounty).toBe('TM');
  });

  it('se întoarce de unde a plecat marfa, dacă firma nu are bază', () => {
    const prefill = buildReturn(order(), TODAY);
    expect(prefill.toCity).toBe('München');
    expect(prefill.toCountry).toBe('DE');
  });

  it('dar spre bază, când firma are una', () => {
    const base: CarrierBase = { city: 'Cluj-Napoca', county: 'CJ', country: 'RO' };
    const prefill = buildReturn(order(), TODAY, base);
    expect(prefill.toCity).toBe('Cluj-Napoca');
    expect(prefill.toCounty).toBe('CJ');
    expect(prefill.toCountry).toBe('RO');
  });

  it('o bază goală nu este o bază', () => {
    const prefill = buildReturn(order(), TODAY, { city: '  ', county: null, country: 'RO' });
    expect(prefill.toCity).toBe('München');
  });

  it('este întotdeauna un retur', () => {
    expect(buildReturn(order(), TODAY).direction).toBe('retur');
  });

  it('păstrează vehiculul comenzii', () => {
    expect(buildReturn(order(), TODAY).vehicleId).toBe('v1');
    expect(buildReturn(order({ vehicleId: null }), TODAY).vehicleId).toBeNull();
  });
});

describe('ce se pune în adresă', () => {
  it('duce tot ce trebuie formularului', () => {
    const query = new URLSearchParams(returnQuery(buildReturn(order(), TODAY)));
    expect(query.get('directie')).toBe('retur');
    expect(query.get('de_la')).toBe('Timișoara');
    expect(query.get('pana_la')).toBe('München');
    expect(query.get('din')).toBe('2026-10-06');
    expect(query.get('vehicul')).toBe('v1');
    expect(query.get('judet_de_la')).toBe('TM');
  });

  it('lasă afară ce nu există, în loc să pună gol', () => {
    const query = new URLSearchParams(
      returnQuery(buildReturn(order({ toCounty: null, vehicleId: null }), TODAY)),
    );
    expect(query.has('judet_de_la')).toBe(false);
    expect(query.has('vehicul')).toBe(false);
  });

  it('și nu inventează o țară pe care comanda nu o spune', () => {
    // `order_detail()` nu întoarce țările. „RO" pentru o livrare la
    // München ar fi o presupunere care se vede abia după publicare.
    const query = new URLSearchParams(
      returnQuery(buildReturn(order({ toCountry: null, fromCountry: null }), TODAY)),
    );
    expect(query.has('tara_de_la')).toBe(false);
    expect(query.has('tara_pana_la')).toBe(false);
  });

  it('scapă diacriticele și spațiile', () => {
    const query = returnQuery(buildReturn(order({ toCity: 'Târgu Mureș' }), TODAY));
    expect(query).toContain('de_la=T');
    expect(new URLSearchParams(query).get('de_la')).toBe('Târgu Mureș');
  });
});
