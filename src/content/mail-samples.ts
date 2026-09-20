/**
 * Sample values for a test e-mail.
 *
 * The templates themselves live in the edge function
 * (`supabase/functions/outbox-dispatcher/templates.ts`) because that is
 * where they are rendered. This file is the other half of the test-send
 * button: a name for each one in the words a person on the team would
 * use, and a realistic value for every variable they take.
 *
 * The duplication is real and deliberate — the two are separate
 * deployment units and neither can import the other. What keeps them
 * honest is `tests/unit/mail-samples.test.ts`, which reads the template
 * file and fails when a template is added here and not there, or there
 * and not here.
 *
 * The values are deliberately recognisable as samples when they land in
 * somebody's inbox: „Transport Exemplu SRL", not a real customer's name.
 */

export interface MailTemplate {
  /** The name the database writes into `notification_outbox.template`. */
  id: string;
  /** What it is, for the dropdown. */
  label: string;
}

export const MAIL_TEMPLATES: readonly MailTemplate[] = [
  { id: 'document_expiry_reminder', label: 'Memento: un document expiră' },
  { id: 'document_rejected', label: 'Document respins la verificare' },
  { id: 'vehicle_suspended', label: 'Vehicul scos de pe panou' },
  { id: 'account_suspended', label: 'Cont suspendat' },
  { id: 'account_reactivated', label: 'Cont reactivat' },
  { id: 'company_verified', label: 'Firmă verificată' },
  { id: 'company_rejected', label: 'Firmă respinsă' },
  { id: 'company_invitation', label: 'Invitație în echipă' },
  { id: 'request_match_alert', label: 'Cerere nouă pe traseul tău' },
  { id: 'listing_expiring_soon', label: 'Cererea iese curând de pe panou' },
  { id: 'reservation_created', label: 'Rezervare nouă pe traseu' },
  { id: 'reservation_confirmed', label: 'Rezervare confirmată' },
  { id: 'reservation_rejected', label: 'Rezervare respinsă' },
  { id: 'reservation_expired', label: 'Rezervare expirată' },
  { id: 'subscription_request_received', label: 'Cerere de abonament primită' },
  { id: 'subscription_activated', label: 'Abonament activat' },
  { id: 'account_deletion_scheduled', label: 'Ștergere programată' },
  { id: 'account_deletion_blocked', label: 'Ștergere blocată' },
  { id: 'account_deletion_cancelled', label: 'Ștergere anulată' },
  { id: 'account_deletion_completed', label: 'Ștergere finalizată' },
] as const;

/**
 * One payload that covers every variable any template uses.
 *
 * Sent whole rather than per template: an extra key renders as nothing,
 * a missing one fails the row with its own name, and one object is one
 * thing to keep correct instead of twenty.
 */
export const MAIL_SAMPLE_PAYLOAD: Record<string, string> = {
  company_name: 'Transport Exemplu SRL',
  document_label: 'Asigurare RCA',
  days_left: '7',
  valid_until: '12 octombrie 2026',
  reason: 'Exemplu de motiv: documentul era ilizibil în zona datei de expirare.',
  plate_number: 'CJ 12 ABC',
  invited_by: 'Un coleg',
  role: 'dispecer',
  from_city: 'Cluj-Napoca',
  to_city: 'Timișoara',
  from_country: 'RO',
  to_country: 'RO',
  request_id: '00000000-0000-4000-8000-000000000001',
  listing_title: 'Volkswagen Golf 2015, Cluj-Napoca — Arad',
  listing_id: '00000000-0000-4000-8000-000000000002',
  departure_date: '24 septembrie 2026',
  plan: 'Transportator',
  period_end: '24 octombrie 2026',
  what: 'contul de exemplu',
  scheduled_for: '4 octombrie 2026',
  cancel_token: '00000000-0000-4000-8000-000000000003',
};

export function mailTemplateLabel(id: string): string {
  return MAIL_TEMPLATES.find((t) => t.id === id)?.label ?? id;
}
