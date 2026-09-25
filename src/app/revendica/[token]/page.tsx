import type { Metadata } from 'next';
import Link from 'next/link';
import { ClaimForm } from '@/components/onboarding/claim-form';
import { Card, EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { BRAND_NAME } from '@/config/brand';
import { onboardingCopy } from '@/content/inscrieri';
import { expiryLabel } from '@/lib/onboarding';
import { loadClaimPreview } from '@/lib/onboarding-source';

export const metadata: Metadata = {
  title: onboardingCopy.claim.meta.title,
  robots: { index: false, follow: false },
};

/** A bearer link. Nothing here may ever be cached or prerendered. */
export const dynamic = 'force-dynamic';

const c = onboardingCopy.claim;

/**
 * Pagina pe care o deschide cineva care a primit un link pe WhatsApp.
 *
 * Scrisă pentru un om suspicios, pentru că are dreptate să fie: i-a
 * apărut un cont pe care nu l-a făcut. Deci spune, în ordine, ce am
 * pregătit, cine, ce nu am făcut (nicio parolă), și ce se întâmplă dacă
 * nu a cerut el asta.
 *
 * Un token greșit, unul folosit și unul expirat arată toate trei
 * aceeași pagină: baza le răspunde identic dinadins, iar ecranul nu are
 * de unde să inventeze o distincție pe care ea nu o face.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await loadClaimPreview(token);

  if (preview === null) {
    return (
      <main className="mx-auto flex w-full max-w-[34rem] flex-col gap-4 px-4 py-16">
        <h1 className="text-h2">{c.invalid}</h1>
        <p className="text-body text-muted">{c.invalidBody}</p>
        <p className="text-body">
          <Link href={ROUTES.contact} className="link-accent">
            Scrie-ne
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[34rem] flex-col gap-6 px-4 py-12">
      <div>
        <EyebrowPill>{BRAND_NAME}</EyebrowPill>
        <h1 className="mt-2 text-h2">
          {c.title(preview.company_name)}
        </h1>
        <p className="mt-2 text-body text-muted">{c.lede}</p>
      </div>

      <Card className="p-4">
        <h2 className="text-body font-medium">{c.filled}</h2>
        <ul className="mt-2 flex flex-col gap-1 text-small text-muted">
          <li>· {c.nothingYet}</li>
          {preview.documents_count > 0 ? <li>· {c.documents(preview.documents_count)}</li> : null}
          {preview.vehicles_count > 0 ? <li>· {c.vehicles(preview.vehicles_count)}</li> : null}
        </ul>
        <p className="mt-3 text-small text-muted">{c.expires(expiryLabel(preview.expires_at))}</p>
      </Card>

      <ClaimForm
        token={token}
        emailHint={preview.email_hint}
        fullName={preview.contact_name}
      />

      <Card className="p-4">
        <h2 className="text-body font-medium">{c.notYou}</h2>
        <p className="mt-1 text-small text-muted">
          {c.notYouBody}{' '}
          <Link href={ROUTES.contact} className="underline underline-offset-2 hover:text-foreground">
            {c.notYouLink}
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
