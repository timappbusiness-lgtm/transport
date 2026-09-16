import type { Database } from '@/lib/supabase/database.types';

type Enums = Database['public']['Enums'];

/** "RO 14 399 840", "ro14399840" -> "14399840". Same rule as create_company(). */
export function normalizeCui(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^RO/, '');
  return /^[0-9]{2,10}$/.test(cleaned) ? cleaned : null;
}

export const COMPANY_TYPE_LABELS: Record<Enums['company_type'], string> = {
  transport: 'Firmă de transport',
  expeditie: 'Casă de expediții',
  both: 'Transport și expediții',
};

export const VERIFICATION_STATUS: Record<
  Enums['company_verification_status'],
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }
> = {
  draft: { label: 'În completare', tone: 'neutral' },
  pending: { label: 'În verificare', tone: 'neutral' },
  verified: { label: 'Verificată', tone: 'ok' },
  rejected: { label: 'Respinsă', tone: 'danger' },
  suspended: { label: 'Suspendată', tone: 'danger' },
};

export const ROLE_LABELS: Record<Enums['company_member_role'], string> = {
  owner: 'Proprietar',
  admin: 'Administrator',
  dispatcher: 'Dispecer',
  driver: 'Șofer',
};

/** Roles a manager may invite. The owner role moves only by transfer. */
export const INVITABLE_ROLES: readonly Exclude<Enums['company_member_role'], 'owner'>[] = ['admin', 'dispatcher', 'driver'];

export function isManagerRole(role: Enums['company_member_role'] | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export const ROMANIAN_COUNTIES: readonly string[] = [
  'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov', 'Brăila', 'București',
  'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu',
  'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt',
  'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vaslui', 'Vâlcea', 'Vrancea',
];
