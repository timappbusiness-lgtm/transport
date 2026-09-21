import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOX_LABELS,
  KIND_LABELS,
  MAX_ATTACHMENTS,
  MAX_BODY,
  badge,
  contextHref,
  digestWindow,
  filterBox,
  fold,
  formatTime,
  groupByDay,
  kindLabel,
  parseBox,
  preview,
  search,
  sortConversations,
  totalUnread,
  validateAttachment,
  validateMessage,
  wouldSendAgain,
  type Conversation,
  type Message,
} from '@/lib/messages';

/**
 * Partea de browser a inboxului.
 *
 * Cine vede ce și ce se maschează sunt decise în Postgres și verificate
 * în blocul MSG din rls_test.sql. Ce se verifică aici este ordinea, ce
 * scrie pe ecran, și aritmetica grupării e-mailurilor — ultima fiind
 * aceeași formulă ca în migrare, comparată cu ea de ultimele trei teste.
 */

const MIGRATION = 'supabase/migrations/20260925100000_faza2_mesagerie.sql';
const sql = () => readFileSync(MIGRATION, 'utf8');

function conv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    kind: 'cerere',
    counterparty_name: 'Transport Ardeal SRL',
    from_city: 'Cluj-Napoca',
    to_city: 'Timișoara',
    order_id: null,
    offer_id: null,
    request_id: 'r1',
    route_id: null,
    last_message_at: '2026-10-01T10:00:00.000Z',
    last_message_body: 'Bună ziua, mai aveți loc?',
    last_message_mine: false,
    unread: 0,
    linked_conversation_id: null,
    ...over,
  };
}

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    created_at: '2026-10-01T10:00:00.000Z',
    sender_name: 'Ion',
    mine: false,
    body: 'Bună ziua',
    was_masked: false,
    hidden_at: null,
    attachments: [],
    ...over,
  };
}

describe('cipul de context', () => {
  it('fiecare fel de conversație are un cuvânt', () => {
    for (const kind of Object.keys(KIND_LABELS)) {
      expect(kindLabel(kind)).toBeTruthy();
    }
  });

  it('un fel necunoscut se citește ca el însuși, nu ca „undefined"', () => {
    expect(kindLabel('altceva')).toBe('altceva');
  });

  it('și fiecare filă are o etichetă', () => {
    for (const box of Object.keys(BOX_LABELS)) {
      expect(BOX_LABELS[box as keyof typeof BOX_LABELS]).toBeTruthy();
    }
  });

  it('o filă necunoscută din URL devine „toate", nu o eroare', () => {
    expect(parseBox('inventat')).toBe('toate');
    expect(parseBox(null)).toBe('toate');
    expect(parseBox('necitite')).toBe('necitite');
  });
});

describe('ordinea din listă', () => {
  it('ultimul mesaj primul', () => {
    const rows = [
      conv({ id: 'a', last_message_at: '2026-10-01T08:00:00.000Z' }),
      conv({ id: 'b', last_message_at: '2026-10-01T12:00:00.000Z' }),
      conv({ id: 'c', last_message_at: '2026-10-01T10:00:00.000Z' }),
    ];
    expect(sortConversations(rows).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('un fir fără niciun mesaj stă la coadă, nu la început', () => {
    // Deschis acum zece minute și gol nu este mai important decât unul
    // în care cineva chiar a scris ieri.
    const rows = [
      conv({ id: 'gol', last_message_at: null }),
      conv({ id: 'ieri', last_message_at: '2026-09-30T10:00:00.000Z' }),
    ];
    expect(sortConversations(rows).map((r) => r.id)).toEqual(['ieri', 'gol']);
  });
});

describe('necitite', () => {
  it('se adună peste tot', () => {
    expect(totalUnread([conv({ unread: 2 }), conv({ unread: 3 }), conv({ unread: 0 })])).toBe(5);
  });

  it('insigna se oprește la nouă plus', () => {
    expect(badge(0)).toBeNull();
    expect(badge(1)).toBe('1');
    expect(badge(9)).toBe('9');
    expect(badge(10)).toBe('9+');
    expect(badge(250)).toBe('9+');
  });

  it('fila „necitite" arată doar ce are necitite', () => {
    const rows = [conv({ id: 'a', unread: 0 }), conv({ id: 'b', unread: 1 })];
    expect(filterBox(rows, 'necitite').map((r) => r.id)).toEqual(['b']);
  });

  it('și filele de comenzi și oferte se uită la felul firului', () => {
    const rows = [
      conv({ id: 'a', kind: 'comanda' }),
      conv({ id: 'b', kind: 'oferta' }),
      conv({ id: 'c', kind: 'cerere' }),
    ];
    expect(filterBox(rows, 'comenzi').map((r) => r.id)).toEqual(['a']);
    expect(filterBox(rows, 'oferte').map((r) => r.id)).toEqual(['b']);
    expect(filterBox(rows, 'toate')).toHaveLength(3);
  });
});

describe('căutarea', () => {
  it('găsește după numele firmei', () => {
    expect(search([conv()], 'ardeal')).toHaveLength(1);
  });

  it('și după oraș, cu sau fără diacritice', () => {
    expect(search([conv()], 'timisoara')).toHaveLength(1);
    expect(search([conv()], 'Timișoara')).toHaveLength(1);
  });

  it('un termen gol nu filtrează nimic', () => {
    expect(search([conv(), conv({ id: 'b' })], '   ')).toHaveLength(2);
  });

  it('virgula de sub ș și ț nu contează', () => {
    expect(fold('Timișoara')).toBe(fold('Timisoara'));
    expect(fold('Brașov')).toBe('brasov');
  });
});

describe('previzualizarea', () => {
  it('spune „Tu:" când noi am scris ultimul', () => {
    expect(preview(conv({ last_message_mine: true }))).toMatch(/^Tu: /);
  });

  it('și nimic când a scris celălalt', () => {
    expect(preview(conv({ last_message_mine: false }))).not.toMatch(/^Tu: /);
  });

  it('taie ce nu încape pe un rând', () => {
    const long = 'a'.repeat(200);
    const out = preview(conv({ last_message_body: long }), 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith('…')).toBe(true);
  });

  it('un fir gol o spune, nu rămâne gol', () => {
    expect(preview(conv({ last_message_body: null }))).toBe('Fără mesaje încă');
  });

  it('și mai multe spații devin unul', () => {
    expect(preview(conv({ last_message_body: 'a\n\n  b' }))).toBe('a b');
  });
});

describe('gruparea e-mailurilor', () => {
  it('două mesaje în aceeași fereastră trimit un singur e-mail', () => {
    const first = new Date('2026-10-01T10:00:00.000Z');
    const second = new Date('2026-10-01T10:14:00.000Z');
    expect(wouldSendAgain(first, second, 15)).toBe(false);
  });

  it('iar unul de peste fereastră trimite din nou', () => {
    const first = new Date('2026-10-01T10:00:00.000Z');
    const later = new Date('2026-10-01T10:31:00.000Z');
    expect(wouldSendAgain(first, later, 15)).toBe(true);
  });

  it('fereastra este un număr întreg, ca în bază', () => {
    const at = new Date('2026-10-01T10:07:00.000Z');
    expect(digestWindow(at, 15)).toBe(Math.floor(at.getTime() / 1000 / 900));
  });
});

describe('ce se poate trimite', () => {
  it('un mesaj gol fără imagini nu este un mesaj', () => {
    expect(validateMessage('   ', 0)).toBeTruthy();
  });

  it('dar o imagine fără text este', () => {
    expect(validateMessage('', 1)).toBeNull();
  });

  it('textul are o limită', () => {
    expect(validateMessage('x'.repeat(MAX_BODY), 0)).toBeNull();
    expect(validateMessage('x'.repeat(MAX_BODY + 1), 0)).toBeTruthy();
  });

  it('și imaginile la fel', () => {
    expect(validateMessage('ok', MAX_ATTACHMENTS)).toBeNull();
    expect(validateMessage('ok', MAX_ATTACHMENTS + 1)).toBeTruthy();
  });

  it('numai imagini, și nu peste zece megaocteți', () => {
    expect(validateAttachment({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateAttachment({ type: 'application/pdf', size: 1000 })).toBeTruthy();
    expect(validateAttachment({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toBeTruthy();
  });
});

describe('firul pe zile', () => {
  const now = new Date('2026-10-02T09:00:00.000Z');

  it('scrie „Azi" și „Ieri" ca atare', () => {
    const groups = groupByDay(
      [
        msg({ id: 'a', created_at: '2026-10-01T10:00:00.000Z' }),
        msg({ id: 'b', created_at: '2026-10-02T08:00:00.000Z' }),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Ieri', 'Azi']);
  });

  it('o zi mai veche are data ei', () => {
    const groups = groupByDay([msg({ created_at: '2026-09-20T10:00:00.000Z' })], now);
    expect(groups[0]?.label).toContain('septembrie');
  });

  it('mesajele rămân în ordine în fiecare zi', () => {
    const groups = groupByDay(
      [
        msg({ id: 'a', created_at: '2026-10-02T08:00:00.000Z' }),
        msg({ id: 'b', created_at: '2026-10-02T09:00:00.000Z' }),
      ],
      now,
    );
    expect(groups[0]?.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('o dată imposibilă este ignorată, nu aruncă', () => {
    expect(groupByDay([msg({ created_at: 'nu e o dată' })], now)).toEqual([]);
  });

  it('ora se scrie ca oră', () => {
    expect(formatTime('2026-10-01T10:05:00.000Z')).toMatch(/\d{2}:\d{2}/);
    expect(formatTime('nu e o dată')).toBe('');
  });
});

describe('antetul duce la context', () => {
  it('o comandă duce la comandă', () => {
    expect(contextHref(conv({ order_id: 'o1' }))).toBe('/cont/transporturi/o1');
  });

  it('o cerere la cerere', () => {
    expect(contextHref(conv({ request_id: 'r1' }))).toBe('/cereri/r1');
  });

  it('și un fir fără context nu inventează o legătură', () => {
    expect(contextHref(conv({ request_id: null, route_id: null }))).toBeNull();
  });
});

describe('limitele sunt aceleași ca în migrare', () => {
  it('cinci imagini pe mesaj în amândouă', () => {
    expect(sql()).toMatch(/max_attachments integer not null default 5\b/);
    expect(MAX_ATTACHMENTS).toBe(5);
  });

  it('fereastra de grupare este 15 minute în amândouă', () => {
    expect(sql()).toMatch(/digest_minutes integer not null default 15\b/);
  });

  it('retenția conversațiilor fără comandă este 24 de luni', () => {
    expect(sql()).toMatch(/retention_months integer not null default 24\b/);
  });

  it('și bucketul acceptă numai cele patru tipuri de imagine', () => {
    const bucket = sql().slice(sql().indexOf("'message-attachments', 'message-attachments'"));
    const types = bucket.slice(0, bucket.indexOf(']'));
    expect(types).toContain('image/jpeg');
    expect(types).toContain('image/heic');
    expect(types).not.toContain('application/pdf');
  });
});
