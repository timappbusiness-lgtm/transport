import type { AccountContext } from './auth/account';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * Reading somebody's notification settings.
 *
 * Every query here is the caller's own row by policy, not by a `where`
 * clause added here — the same reason the SEO loaders carry no
 * `is_published` filter. What this file adds is the join between the type
 * catalogue and the person's overrides, so a screen can render one row per
 * type without knowing how precedence works.
 */

export interface NotificationType {
  code: string;
  label: string;
  description: string | null;
  audience: 'carrier' | 'client' | 'both';
  isMandatory: boolean;
  /** The effective state, override applied over the default. */
  inapp: boolean;
  email: boolean;
  push: boolean;
}

export interface DeviceRow {
  id: string;
  endpoint: string;
  userAgent: string | null;
  platform: string | null;
  lastSeenAt: string;
  disabledAt: string | null;
}

export interface QuietHours {
  enabled: boolean;
  from: string;
  to: string;
  maxPerHour: number;
}

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: true,
  from: '22:00',
  to: '07:00',
  maxPerHour: 10,
};

export interface NotificationSettings {
  types: NotificationType[];
  devices: DeviceRow[];
  quiet: QuietHours;
}

export const NO_NOTIFICATION_SETTINGS: NotificationSettings = {
  types: [],
  devices: [],
  quiet: DEFAULT_QUIET_HOURS,
};

interface TypeRow {
  code: string;
  label_ro: string;
  description_ro: string | null;
  audience: 'carrier' | 'client' | 'both';
  default_inapp: boolean;
  default_email: boolean;
  default_push: boolean;
  is_mandatory: boolean;
  is_available: boolean;
  sort_order: number;
}

interface PreferenceRow {
  type: string;
  inapp: boolean | null;
  email: boolean | null;
  push: boolean | null;
}

interface DeviceDbRow {
  id: string;
  endpoint: string;
  user_agent: string | null;
  platform: string | null;
  last_seen_at: string;
  disabled_at: string | null;
}

export async function loadNotificationSettings(
  context: AccountContext,
): Promise<NotificationSettings> {
  if (!isSupabaseConfigured()) return NO_NOTIFICATION_SETTINGS;

  const supabase = await createClient();
  const [types, preferences, devices, settings] = await Promise.all([
    supabase
      .from('notification_types')
      .select(
        'code, label_ro, description_ro, audience, default_inapp, default_email, default_push, is_mandatory, is_available, sort_order',
      )
      .eq('is_available', true)
      .order('sort_order'),
    supabase.from('notification_preferences').select('type, inapp, email, push'),
    supabase
      .from('push_subscriptions')
      .select('id, endpoint, user_agent, platform, last_seen_at, disabled_at')
      .order('last_seen_at', { ascending: false }),
    supabase
      .from('notification_settings')
      .select('quiet_hours_enabled, quiet_from, quiet_to, max_push_per_hour')
      .maybeSingle(),
  ]);

  if (types.error) {
    console.error('[notificări] types', { message: types.error.message });
    return NO_NOTIFICATION_SETTINGS;
  }

  const overrides = new Map(
    ((preferences.data ?? []) as PreferenceRow[]).map((row) => [row.type, row]),
  );

  // Only the types this person could act on. A dispatcher does not want a
  // row about subscription invoices, and a private individual does not
  // want one about fleet documents.
  const audience: 'carrier' | 'client' = context.activeCompany ? 'carrier' : 'client';

  return {
    types: ((types.data ?? []) as TypeRow[])
      .filter((row) => row.audience === 'both' || row.audience === audience)
      .map((row) => {
        const override = overrides.get(row.code);
        return {
          code: row.code,
          label: row.label_ro,
          description: row.description_ro,
          audience: row.audience,
          isMandatory: row.is_mandatory,
          // Mandatory wins over any stored override, the same precedence
          // `notification_channel_enabled` applies in the database.
          inapp: row.is_mandatory ? true : (override?.inapp ?? row.default_inapp),
          email: row.is_mandatory ? true : (override?.email ?? row.default_email),
          push: override?.push ?? row.default_push,
        };
      }),

    devices: ((devices.data ?? []) as DeviceDbRow[]).map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      userAgent: row.user_agent,
      platform: row.platform,
      lastSeenAt: row.last_seen_at,
      disabledAt: row.disabled_at,
    })),

    quiet: settings.data
      ? {
          enabled: settings.data.quiet_hours_enabled,
          // `time` comes back as HH:MM:SS; the input wants HH:MM.
          from: String(settings.data.quiet_from).slice(0, 5),
          to: String(settings.data.quiet_to).slice(0, 5),
          maxPerHour: settings.data.max_push_per_hour,
        }
      : DEFAULT_QUIET_HOURS,
  };
}
