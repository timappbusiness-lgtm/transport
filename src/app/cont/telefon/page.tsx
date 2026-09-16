import type { Metadata } from 'next';
import { Badge, Card, PageHeader } from '@/components/app/badge';
import { PhoneVerification } from '@/components/app/phone-forms';
import { ROUTES } from '@/config/routes';
import { requireSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Confirmă telefonul' };

export default async function Page() {
  const { profile } = await requireSession(ROUTES.phone);
  return (
    <div className="max-w-[520px]">
      <PageHeader
        title="Confirmă telefonul"
        description="Transportatorii te sună pe acest număr. Îl confirmăm o singură dată, prin SMS."
      />
      <Card>
        {profile.phone_verified ? (
          <p className="mb-4 text-sm">
            <Badge tone="ok">Confirmat</Badge> <span className="ml-2 font-mono">{profile.phone}</span>. Dacă schimbi numărul, îl
            confirmi din nou.
          </p>
        ) : null}
        <PhoneVerification currentPhone={profile.phone} />
      </Card>
    </div>
  );
}
