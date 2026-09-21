import { describe, expect, it } from 'vitest';
import {
  openChannelCount,
  subscribeToConversation,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from '@/lib/message-realtime';

/**
 * Numărătoarea canalelor.
 *
 * Un fir deschis de două ori — ecranul și, într-o zi, o listă care
 * arată ultimul mesaj — nu are voie să țină două WebSocket-uri pentru
 * aceleași rânduri, iar când pleacă amândouă nu are voie să rămână
 * niciunul. Abonările scăpate sunt exact felul de defect care nu se
 * vede în dezvoltare și umple conexiunile în producție.
 */

function fakeClient() {
  const removed: string[] = [];
  const created: string[] = [];
  let fire: (() => void) | null = null;

  const client: RealtimeClientLike = {
    channel(name) {
      created.push(name);
      const channel: RealtimeChannelLike = {
        on(_event, _filter, handler) {
          fire = handler;
          return channel;
        },
        subscribe: () => channel,
      };
      Object.defineProperty(channel, 'name', { value: name });
      return channel;
    },
    removeChannel(channel) {
      removed.push((channel as unknown as { name: string }).name);
    },
  };

  return { client, created, removed, fire: () => fire?.() };
}

describe('abonarea la un fir', () => {
  it('deschide un singur canal pentru doi ascultători și îl închide la ultimul', () => {
    const { client, created, removed } = fakeClient();
    expect(openChannelCount()).toBe(0);

    const offA = subscribeToConversation(client, 'c1', () => {});
    const offB = subscribeToConversation(client, 'c1', () => {});

    expect(created).toEqual(['messages:c1']);
    expect(openChannelCount()).toBe(1);

    offA();
    expect(removed).toEqual([]);
    expect(openChannelCount()).toBe(1);

    offB();
    expect(removed).toEqual(['messages:c1']);
    expect(openChannelCount()).toBe(0);
  });

  it('ține canale separate pentru fire separate', () => {
    const { client, created, removed } = fakeClient();
    const off1 = subscribeToConversation(client, 'c1', () => {});
    const off2 = subscribeToConversation(client, 'c2', () => {});

    expect(created).toEqual(['messages:c1', 'messages:c2']);
    expect(openChannelCount()).toBe(2);

    off1();
    off2();
    expect(removed).toEqual(['messages:c1', 'messages:c2']);
    expect(openChannelCount()).toBe(0);
  });

  it('dezabonarea de două ori nu închide canalul altcuiva', () => {
    const { client, removed } = fakeClient();
    const offA = subscribeToConversation(client, 'c1', () => {});
    offA();
    offA();

    const offB = subscribeToConversation(client, 'c1', () => {});
    expect(openChannelCount()).toBe(1);
    offB();
    expect(removed).toEqual(['messages:c1', 'messages:c1']);
    expect(openChannelCount()).toBe(0);
  });

  it('anunță fiecare ascultător când vine un rând', () => {
    const { client, fire } = fakeClient();
    const seen: string[] = [];
    const offA = subscribeToConversation(client, 'c1', () => seen.push('a'));
    const offB = subscribeToConversation(client, 'c1', () => seen.push('b'));

    fire();
    expect(seen).toEqual(['a', 'b']);

    offA();
    fire();
    expect(seen).toEqual(['a', 'b', 'b']);
    offB();
  });

  it('un ascultător care se dezabonează în propriul apel nu sare peste următorul', () => {
    const { client, fire } = fakeClient();
    const seen: string[] = [];
    const offA = subscribeToConversation(client, 'c1', () => {
      seen.push('a');
      offA();
    });
    const offB = subscribeToConversation(client, 'c1', () => seen.push('b'));

    fire();
    expect(seen).toEqual(['a', 'b']);
    offB();
  });
});

describe('publicația', () => {
  it('adaugă `messages` la supabase_realtime, și numai dacă publicația există', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/20260925100000_faza2_mesagerie.sql', 'utf8');

    expect(sql).toContain('alter publication supabase_realtime add table public.messages');
    // Baza de probă din `pnpm db:test` nu are publicația; pasul trebuie
    // să fie un no-op acolo, nu o migrare căzută.
    expect(sql).toMatch(/if exists \(select 1 from pg_publication where pubname = 'supabase_realtime'\)/);
  });
});
