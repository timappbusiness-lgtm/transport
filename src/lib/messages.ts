import type { Database } from './supabase/database.types';

/**
 * Inboxul, așa cum îl citesc ecranele.
 *
 * Fără React și fără bază de date. Ce se decide aici este ordinea, ce
 * scrie pe cip, și cât de des are voie să plece un e-mail — restul
 * (cine vede ce, ce se maschează) este decis în Postgres și nu se
 * reimplementează.
 */

export type ConversationKind = 'cerere' | 'traseu' | 'oferta' | 'comanda';

/** Ce scrie pe cipul de context, în română. */
export const KIND_LABELS: Record<ConversationKind, string> = {
  cerere: 'Cerere',
  traseu: 'Traseu',
  oferta: 'Ofertă',
  comanda: 'Comandă',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as ConversationKind] ?? kind;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  counterparty_name: string | null;
  from_city: string | null;
  to_city: string | null;
  order_id: string | null;
  offer_id: string | null;
  request_id: string | null;
  route_id: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_mine: boolean | null;
  unread: number;
  linked_conversation_id: string | null;
}

export type Box = 'toate' | 'necitite' | 'comenzi' | 'oferte';

export const BOX_LABELS: Record<Box, string> = {
  toate: 'Toate',
  necitite: 'Necitite',
  comenzi: 'Comenzi',
  oferte: 'Oferte',
};

export function parseBox(value: string | null): Box {
  return value === 'necitite' || value === 'comenzi' || value === 'oferte' ? value : 'toate';
}

/**
 * Ordinea din listă.
 *
 * Ultimul mesaj primul, și o conversație fără niciun mesaj la coadă —
 * nu la început. Un fir gol deschis acum zece minute nu este mai
 * important decât unul în care cineva chiar a scris ieri.
 */
export function sortConversations(rows: readonly Conversation[]): Conversation[] {
  return [...rows].sort((a, b) => {
    if (a.last_message_at === null && b.last_message_at === null) return a.id.localeCompare(b.id);
    if (a.last_message_at === null) return 1;
    if (b.last_message_at === null) return -1;
    return b.last_message_at.localeCompare(a.last_message_at);
  });
}

/** Câte necitite, peste tot. Numărul de pe insigna din meniu. */
export function totalUnread(rows: readonly Conversation[]): number {
  return rows.reduce((sum, row) => sum + (row.unread > 0 ? row.unread : 0), 0);
}

/** „9+” peste nouă: o insignă cu trei cifre nu mai încape și nu mai spune nimic. */
export function badge(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

export function filterBox(rows: readonly Conversation[], box: Box): Conversation[] {
  if (box === 'necitite') return rows.filter((r) => r.unread > 0);
  if (box === 'comenzi') return rows.filter((r) => r.kind === 'comanda');
  if (box === 'oferte') return rows.filter((r) => r.kind === 'oferta');
  return [...rows];
}

/** Căutare după firmă sau după oraș, fără diacritice și fără majuscule. */
export function search(rows: readonly Conversation[], term: string): Conversation[] {
  const needle = fold(term);
  if (needle === '') return [...rows];
  return rows.filter((row) =>
    [row.counterparty_name, row.from_city, row.to_city]
      .filter((v): v is string => v !== null)
      .some((v) => fold(v).includes(needle)),
  );
}

/** „Timișoara" și „timisoara" sunt același oraș pentru o căutare. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-̧̦ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Previzualizarea ultimului mesaj.
 *
 * Tăiată la o lungime care încape pe un rând de telefon, cu „Tu: " în
 * față când l-am scris noi — altfel lista arată ca și cum toată lumea
 * ne-ar fi scris nouă.
 */
export function preview(row: Conversation, max = 70): string {
  const body = (row.last_message_body ?? '').replace(/\s+/g, ' ').trim();
  if (body === '') return 'Fără mesaje încă';
  const prefix = row.last_message_mine === true ? 'Tu: ' : '';
  const room = max - prefix.length;
  return prefix + (body.length > room ? body.slice(0, room - 1).trimEnd() + '…' : body);
}

// ---------------------------------------------------------------------
// Gruparea e-mailurilor
// ---------------------------------------------------------------------

/**
 * Fereastra în care două mesaje din aceeași conversație dau un singur
 * e-mail.
 *
 * Exact aritmetica din `queue_message_notification()`: numărul întreg al
 * ferestrei de la epocă. Nu este o a doua implementare — este aceeași
 * formulă, ca ecranul de test din `/admin/notificari` să poată spune ce
 * va face baza, iar un test o compară cu migrarea.
 */
export function digestWindow(at: Date, minutes: number): number {
  return Math.floor(at.getTime() / 1000 / (minutes * 60));
}

/** Adevărat când al doilea mesaj ar mai trimite un e-mail. */
export function wouldSendAgain(first: Date, second: Date, minutes: number): boolean {
  return digestWindow(first, minutes) !== digestWindow(second, minutes);
}

// ---------------------------------------------------------------------
// Compunerea
// ---------------------------------------------------------------------

export const MAX_BODY = 1000;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/**
 * Un mesaj are nevoie de text, chiar și când poartă imagini.
 *
 * Nu este o preferință a formularului: `guard_message_contacts()` refuză
 * un corp gol din faza 2, iar regula are un test care o spune pe nume.
 * Am încercat s-o slăbesc ca să meargă o poză fără legendă; regula a
 * fost scrisă intenționat, așa că a rămas, și aici se spune omului
 * dinainte în loc să afle dintr-un refuz al bazei.
 */
export function validateMessage(body: string, attachments: number): string | null {
  const trimmed = body.trim();
  if (trimmed === '') return 'Scrie un mesaj, chiar și scurt, alături de imagini.';
  if (trimmed.length > MAX_BODY) return `Mesajul poate avea cel mult ${MAX_BODY} de caractere.`;
  if (attachments > MAX_ATTACHMENTS) return `Cel mult ${MAX_ATTACHMENTS} imagini pe mesaj.`;
  return null;
}

export function validateAttachment(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return 'Doar imagini: JPG, PNG, WebP sau HEIC.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Imaginea depășește 10 MB.';
  return null;
}

// ---------------------------------------------------------------------
// Firul
// ---------------------------------------------------------------------

export interface Message {
  id: string;
  created_at: string;
  sender_name: string | null;
  mine: boolean;
  body: string | null;
  was_masked: boolean;
  hidden_at: string | null;
  attachments: string[];
}

export interface DayGroup {
  /** ISO, ziua. */
  day: string;
  label: string;
  messages: Message[];
}

const DAY_FMT = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

export function formatTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : TIME_FMT.format(d);
}

/** Mesajele pe zile, cu „Azi" și „Ieri" scrise ca atare. */
export function groupByDay(messages: readonly Message[], now: Date = new Date()): DayGroup[] {
  const groups = new Map<string, Message[]>();
  for (const message of messages) {
    const d = new Date(message.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.toISOString().slice(0, 10);
    const list = groups.get(day);
    if (list) list.push(message);
    else groups.set(day, [message]);
  }

  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, list]) => ({
      day,
      label: day === today ? 'Azi' : day === yesterday ? 'Ieri' : DAY_FMT.format(new Date(day)),
      messages: list,
    }));
}

/** Legătura către contextul conversației, pentru antet. */
export function contextHref(row: Conversation): string | null {
  if (row.order_id !== null) return `/cont/transporturi/${row.order_id}`;
  if (row.offer_id !== null) return `/cont/oferte`;
  if (row.request_id !== null) return `/cereri/${row.request_id}`;
  if (row.route_id !== null) return `/trasee`;
  return null;
}

export type MessageRow = Database['public']['Tables']['messages']['Row'];
