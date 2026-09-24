import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES, contractCardRoute, contractFileRoute, transportRoute } from '@/config/routes';
import { withNext } from '@/lib/auth/next-path';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return new NextResponse('Nu există.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Opening or downloading one version of a transport contract.
 *
 * The address is stable and safe to share — it is the one on the card
 * and in the documents list — and it is worth nothing without a session
 * that may see the order. The PDF itself is drawn by the `contract-pdf`
 * edge function, which asks the database with the caller's own token and
 * answers with a storage link that lives sixty seconds; this route only
 * redirects to it.
 *
 * Somebody who may not see the contract gets the same 404 as for an id
 * that does not exist. Somebody who may, when drawing fails, goes back to
 * the card with a sentence rather than to an error page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> },
): Promise<Response> {
  const { id, contractId } = await params;
  if (!UUID.test(id) || !UUID.test(contractId)) return notFound();

  const download = request.nextUrl.searchParams.get('descarca') === '1';
  const here = contractFileRoute(id, contractId, download);

  if (!isSupabaseConfigured()) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.redirect(new URL(withNext(ROUTES.signIn, here), request.nextUrl.origin));
  }

  // The contract has to be one of this order's, and the order one the
  // caller may see: `order_contract_versions()` returns nothing otherwise.
  const { data: versions } = await supabase.rpc('order_contract_versions', { p_order_id: id });
  if (!Array.isArray(versions) || !versions.some((v) => v.contract_id === contractId)) return notFound();

  const { data, error } = await supabase.functions.invoke('contract-pdf', {
    body: { contract_id: contractId, disposition: download ? 'attachment' : 'inline' },
  });

  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response && response.status === 404) return notFound();
    console.error('[contracts.file] contract-pdf failed', {
      status: response instanceof Response ? response.status : null,
    });
    return NextResponse.redirect(
      new URL(`${transportRoute(id)}?contract=indisponibil#contract`, request.nextUrl.origin),
    );
  }

  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    return NextResponse.redirect(new URL(contractCardRoute(id), request.nextUrl.origin));
  }

  const redirect = NextResponse.redirect(url, 303);
  redirect.headers.set('Cache-Control', 'no-store');
  return redirect;
}
