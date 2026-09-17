import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';
import type { BillingMonths } from './plans';

/**
 * What a company's subscription looks like from inside the account.
 *
 * Read with the session client, not the sessionless one: this is the
 * company's own row, so RLS is what decides whether it comes back at all.
 * Nothing here is cached for the same reason.
 */

export interface PendingRequest {
  id: string;
  planCode: string;
  months: BillingMonths;
  status: 'new' | 'contacted';
  createdAt: string;
}

export interface CompanySubscription {
  planCode: string;
  status: string;
  /** True while the company is inside the free period. */
  isTrial: boolean;
  periodEnd: string;
  /**
   * Whole days until the period ends, negative once it has. Computed here
   * rather than in the page: reading the clock during render is exactly the
   * kind of unstable result React's purity rule is about.
   */
  daysLeft: number;
  /** The request the company is waiting on, if any. */
  pendingRequest: PendingRequest | null;
}

export interface SubscriptionUsage {
  /** Contacts revealed since the first of the month. */
  contactsThisMonth: number;
  activeTruckListings: number;
  members: number;
}

/**
 * What the company has used of its plan this month.
 *
 * Counted rather than stored: `contact_reveals` is both the audit trail and
 * the quota counter, so the number here is the same one the database checks
 * before it refuses the next reveal.
 */
export async function loadSubscriptionUsage(
  companyId: string | null,
): Promise<SubscriptionUsage | null> {
  if (!companyId || !isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [contacts, trucks, members] = await Promise.all([
    supabase
      .from('contact_reveals')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('truck_listings')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active'),
    supabase
      .from('company_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  for (const [label, result] of [
    ['contacts', contacts],
    ['trucks', trucks],
    ['members', members],
  ] as const) {
    if (result.error) {
      console.error(`[abonament] ${label} count failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  return {
    contactsThisMonth: contacts.count ?? 0,
    activeTruckListings: trucks.count ?? 0,
    members: members.count ?? 0,
  };
}

export async function loadCompanySubscription(
  companyId: string | null,
): Promise<CompanySubscription | null> {
  if (!companyId || !isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const [subscription, request] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan_code,status,current_period_end')
      .eq('company_id', companyId)
      .in('status', ['trialing', 'active', 'past_due'])
      .maybeSingle(),
    supabase
      .from('subscription_requests')
      .select('id,plan_code,months,status,created_at')
      .eq('company_id', companyId)
      .in('status', ['new', 'contacted'])
      .order('created_at', { ascending: false })
      .maybeSingle(),
  ]);

  for (const [label, result] of [
    ['subscription', subscription],
    ['request', request],
  ] as const) {
    if (result.error) {
      console.error(`[abonament] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const pendingRequest: PendingRequest | null =
    request.data && (request.data.status === 'new' || request.data.status === 'contacted')
      ? {
          id: request.data.id,
          planCode: request.data.plan_code,
          months: request.data.months as BillingMonths,
          status: request.data.status,
          createdAt: request.data.created_at,
        }
      : null;

  // A company with no subscription but an open request still has something
  // to show on /cont/abonament, so the request is not hidden behind one.
  if (!subscription.data) {
    return pendingRequest
      ? {
          planCode: 'free',
          status: 'none',
          isTrial: false,
          periodEnd: '',
          daysLeft: 0,
          pendingRequest,
        }
      : null;
  }

  const end = new Date(subscription.data.current_period_end);

  return {
    planCode: subscription.data.plan_code,
    status: subscription.data.status,
    isTrial: subscription.data.status === 'trialing',
    periodEnd: subscription.data.current_period_end,
    daysLeft: Math.ceil((end.getTime() - Date.now()) / 86_400_000),
    pendingRequest,
  };
}
