/**
 * Realtime peste temporizator, nu în locul lui.
 *
 * Evenimentul de la Postgres este doar un semnal: „uită-te din nou".
 * Nimic nu se desenează din el, ecranul recitește prin
 * `conversation_messages()`, care verifică încă o dată cine întreabă.
 * Asta înseamnă că un canal căzut, o publicație lipsă sau un WebSocket
 * blocat de o rețea de firmă nu strică nimic — rămâne polling-ul de
 * cincisprezece secunde, exact cum era înainte.
 *
 * O singură abonare pe pagină: cine cere același fir a doua oară
 * primește același canal, iar canalul se închide la ultimul care pleacă.
 * Fără numărătoarea asta, un inbox cu trei fire deschise ar ține trei
 * WebSocket-uri pentru aceleași rânduri.
 *
 * Fără React și fără `@supabase/ssr` în semnătură: clientul se dă din
 * afară, deci numărătoarea se poate testa cu un obiect de două linii.
 */

export interface RealtimeChannelLike {
  on: (
    event: 'postgres_changes',
    filter: { event: string; schema: string; table: string; filter: string },
    handler: () => void,
  ) => RealtimeChannelLike;
  subscribe: () => unknown;
}

export interface RealtimeClientLike {
  channel: (name: string) => RealtimeChannelLike;
  removeChannel: (channel: RealtimeChannelLike) => unknown;
}

interface Entry {
  channel: RealtimeChannelLike;
  listeners: Set<() => void>;
}

const OPEN = new Map<string, Entry>();

export function subscribeToConversation(
  client: RealtimeClientLike,
  conversationId: string,
  onChange: () => void,
): () => void {
  let entry = OPEN.get(conversationId);

  if (entry === undefined) {
    const listeners = new Set<() => void>();
    const channel = client
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        // Copiat întâi: un ascultător care se dezabonează în propriul
        // apel ar schimba mulțimea în timp ce este parcursă.
        () => {
          for (const listener of [...listeners]) listener();
        },
      );
    channel.subscribe();
    entry = { channel, listeners };
    OPEN.set(conversationId, entry);
  }

  entry.listeners.add(onChange);
  const open = entry;
  let done = false;

  return () => {
    // Chemată de două ori — React în mod strict o face — nu are voie să
    // închidă nimic a doua oară. Și mai ales nu canalul altcuiva:
    // `OPEN` poate să aibă deja o intrare nouă pentru același fir, de
    // la cineva care s-a abonat între timp.
    if (done) return;
    done = true;

    open.listeners.delete(onChange);
    if (open.listeners.size > 0) return;
    if (OPEN.get(conversationId) === open) OPEN.delete(conversationId);
    client.removeChannel(open.channel);
  };
}

/** Câte canale sunt deschise. Pentru teste, și pentru nimic altceva. */
export function openChannelCount(): number {
  return OPEN.size;
}
