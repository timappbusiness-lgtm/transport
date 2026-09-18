import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from '@/config/routes';
import { createClient } from '@/lib/supabase/server';

/**
 * Handing the archive over, once.
 *
 * The link could have been a signed storage URL, and then „once" would
 * have been a promise about a URL rather than a fact. `claim_data_export`
 * marks the row used inside a transaction and refuses the second call, so
 * the guarantee is a row in a table; this route only carries the bytes.
 *
 * It signs the object for sixty seconds and redirects rather than
 * streaming: a redirect to storage keeps a large archive off the Node
 * runtime's memory, and a minute is long enough for a browser that has
 * already decided to download and short enough to be worth nothing to
 * anybody else.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get('t') ?? '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.redirect(new URL(ROUTES.signIn, request.nextUrl.origin));
  }

  const { data: path, error } = await supabase.rpc('claim_data_export', {
    p_id: id,
    p_token: token,
  });

  if (error || typeof path !== 'string' || path === '') {
    // The reason is deliberately not repeated here: the row has already
    // been checked, and telling a caller which of "wrong token", "wrong
    // person" and "already used" applies is telling them something.
    return NextResponse.redirect(
      new URL(`${ROUTES.accountPersonalData}?export=expirat`, request.nextUrl.origin),
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('exports')
    .createSignedUrl(path, 60, { download: true });

  if (signError || signed === null) {
    return NextResponse.redirect(
      new URL(`${ROUTES.accountPersonalData}?export=eroare`, request.nextUrl.origin),
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
