import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/lib/supabase/database.types';

/**
 * The end-to-end tests that write data run against a real Supabase project.
 * They need the project's secret key to create confirmed test accounts and
 * to clean up afterwards. It is read from the environment of the test run
 * only; the app never sees it.
 */
export function hasSupabaseE2E(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SECRET_KEY,
  );
}

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
}

export async function createUser(
  admin: SupabaseClient<Database>,
  runId: string,
  label: string,
  accountType: 'company' | 'individual' = 'company',
): Promise<TestUser> {
  const email = `e2e-${runId}-${label}@coridor-test.ro`;
  const password = `E2e-${runId}-parola!`;
  const fullName = `E2E ${label}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, account_type: accountType },
  });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  return { id: data.user.id, email, password, fullName };
}

/** Removes everything a run created: files, companies (cascade), accounts. */
export async function cleanup(admin: SupabaseClient<Database>, users: TestUser[], companyIds: string[]): Promise<void> {
  for (const companyId of companyIds) {
    const { data: files } = await admin.storage.from('documents').list(companyId, { limit: 1000 });
    if (files?.length) {
      await admin.storage.from('documents').remove(files.map((f) => `${companyId}/${f.name}`));
    }
    await admin.from('companies').delete().eq('id', companyId);
  }
  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
}
