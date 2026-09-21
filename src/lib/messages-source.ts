import 'server-only';
import type { Conversation, Message } from './messages';
import { isSupabaseConfigured } from './supabase/env';
import { createClient } from './supabase/server';

/**
 * Ce citesc ecranele de mesaje.
 *
 * Fiecare funcție verifică singură cine întreabă: `my_conversations()`
 * pleacă de la `auth.uid()`, `conversation_messages()` refuză pe loc pe
 * cine nu este parte, iar cele de administrare cer echipa. Fișierul ăsta
 * nu adaugă nicio regulă de acces.
 */

function report(where: string, error: { message: string } | null) {
  if (error) console.error(`[mesaje:${where}]`, error.message);
}

export async function loadConversations(
  box: string = 'toate',
  search: string | null = null,
): Promise<Conversation[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_conversations', {
    p_box: box,
    p_search: search ?? undefined,
  });
  report('my_conversations', error);
  return (data ?? []) as Conversation[];
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const rows = await loadConversations('toate');
  return rows.find((row) => row.id === id) ?? null;
}

export async function countUnread(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unread_message_count');
  report('unread_message_count', error);
  return Number(data ?? 0);
}

export async function loadMessages(conversationId: string): Promise<Message[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('conversation_messages', {
    p_conversation_id: conversationId,
  });
  report('conversation_messages', error);
  return (data ?? []) as Message[];
}

/**
 * Legături semnate pentru atașamente.
 *
 * O oră: destul cât să se deschidă o imagine și să se uite cineva la ea,
 * destul de puțin cât un link copiat dintr-un istoric de navigare să nu
 * mai meargă mâine.
 */
export async function signAttachments(paths: readonly string[]): Promise<Record<string, string>> {
  if (!isSupabaseConfigured() || paths.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('message-attachments')
    .createSignedUrls([...new Set(paths)], 3600);
  report('sign', error);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

export interface BlockRow {
  id: string;
  created_at: string;
  blocked_user_id: string | null;
  blocked_company_id: string | null;
  reason: string | null;
}

export async function loadBlocks(): Promise<BlockRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('message_blocks')
    .select('id, created_at, blocked_user_id, blocked_company_id, reason')
    .order('created_at', { ascending: false });
  report('blocks', error);
  return (data ?? []) as BlockRow[];
}

// ---------------------------------------------------------------------
// Echipa
// ---------------------------------------------------------------------

export interface AdminConversation {
  id: string;
  kind: string;
  created_at: string;
  last_message_at: string | null;
  order_id: string | null;
  report_count: number;
  disputed: boolean;
  participants: string;
  message_count: number;
  total_count: number;
}

export async function loadAdminConversations(
  page = 1,
): Promise<{ rows: AdminConversation[]; total: number; error: string | null }> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, error: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_conversations', {
    p_limit: 50,
    p_offset: (Math.max(1, page) - 1) * 50,
  });
  if (error) return { rows: [], total: 0, error: error.message };
  const rows = (data ?? []) as AdminConversation[];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error: null };
}

export interface AdminListing {
  id: string;
  created_at: string;
  title: string | null;
  status: string;
  from_city: string | null;
  to_city: string | null;
  owner_name: string | null;
  company_id: string | null;
  company_name: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  photo_count: number;
  report_count: number;
  total_count: number;
}

export interface AdminListingQuery {
  kind: 'cereri' | 'trasee';
  status: string | null;
  companyId: string | null;
  hidden: boolean | null;
  reported: boolean | null;
  from: string | null;
  to: string | null;
  page: number;
}

export const ADMIN_LISTINGS_PAGE_SIZE = 50;

export async function loadAdminListings(
  query: AdminListingQuery,
): Promise<{ rows: AdminListing[]; total: number; error: string | null }> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, error: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_listings', {
    p_kind: query.kind,
    p_status: query.status ?? undefined,
    p_company_id: query.companyId ?? undefined,
    p_hidden: query.hidden ?? undefined,
    p_reported: query.reported ?? undefined,
    p_from: query.from ?? undefined,
    p_to: query.to ?? undefined,
    p_limit: ADMIN_LISTINGS_PAGE_SIZE,
    p_offset: (Math.max(1, query.page) - 1) * ADMIN_LISTINGS_PAGE_SIZE,
  });
  if (error) return { rows: [], total: 0, error: error.message };
  const rows = (data ?? []) as AdminListing[];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error: null };
}

/** Firul unei comenzi, pentru butonul de pe pagina ei. */
export async function loadOrderConversationId(orderId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('transport_id', orderId)
    .maybeSingle();
  report('order conversation', error);
  return data?.id ?? null;
}
