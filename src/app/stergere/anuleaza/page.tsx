import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { personalDataCopy } from '@/content/date-personale';
import { createPublicClient } from '@/lib/supabase/public';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const c = personalDataCopy.cancelPage;

export const metadata: Metadata = { title: c.title, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * „Anulează ștergerea", from the link in the e-mail.
 *
 * Public, and it has to be: the account this rescues is one we held a
 * fortnight ago, so asking it to log in first would be asking somebody to
 * unlock a door with the key that is inside. The token only ever cancels,
 * it stops working the moment it is used, and every destructive direction
 * still needs a session.
 *
 * Cancelling on a GET is a deliberate exception to the rule about safe
 * methods. The alternative is a page with a button, and a link in an
 * e-mail that leads to another button is a link a worried person does not
 * finish pressing.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.t;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  let cancelled = false;
  if (isSupabaseConfigured() && /^[0-9a-f-]{36}$/i.test(token)) {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('cancel_account_deletion_by_token', { p_token: token });
    cancelled = data === true;
  }

  return (
    <main className="mx-auto flex w-full max-w-[52ch] flex-col gap-4 px-4 py-16">
      <h1 className="text-h2">{c.title}</h1>
      <p className="text-body">{cancelled ? c.ok : c.gone}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={ROUTES.signIn} className={buttonClasses('ink', 'md')}>
          {c.signIn}
        </Link>
        <Link href={ROUTES.home} className={buttonClasses('secondary', 'md')}>
          {c.home}
        </Link>
      </div>
    </main>
  );
}
