import type { Metadata } from 'next';
import Link from 'next/link';
import { ConsentForm } from '@/components/onboarding/consent-form';
import { Card, EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { onboardingCopy } from '@/content/inscrieri';

export const metadata: Metadata = { title: onboardingCopy.wizard.meta.title };
export const dynamic = 'force-dynamic';

const c = onboardingCopy.wizard;

/**
 * Pasul zero, care nu este un pas.
 *
 * Nimic nu se creează până nu declară cineva că firma a fost de acord,
 * cu data și cu felul în care s-a vorbit. Ecranul începe cu asta
 * dinadins: o declarație cerută la sfârșit, după ce ai completat
 * douăzeci de câmpuri, este o declarație pe care o bifează toată lumea
 * fără să o citească.
 */
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link
            href={ROUTES.adminOnboardings}
            className="text-muted underline-offset-4 hover:underline"
          >
            ← {c.back}
          </Link>
        </p>
        <EyebrowPill>{onboardingCopy.admin.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[68ch] text-sm text-muted">{c.lede}</p>
      </div>

      <Card className="p-5">
        <h2 className="text-[1.0625rem]">{c.consent.title}</h2>
        <p className="mt-1 max-w-[66ch] text-sm text-muted">{c.consent.lede}</p>
        <div className="mt-5">
          <ConsentForm />
        </div>
      </Card>
    </div>
  );
}
