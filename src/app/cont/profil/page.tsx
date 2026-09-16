import type { Metadata } from 'next';
import { PhoneVerification } from '@/components/account/phone-verification';
import {
  EmailForm,
  NameForm,
  PasswordForm,
  SignOutEverywhere,
} from '@/components/account/profile-forms';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { requireAccountContext } from '@/lib/auth/account';

export const metadata: Metadata = { title: accountCopy.profile.title };

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountProfile);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Cont</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{accountCopy.profile.title}</h1>
      </div>

      <NameForm fullName={context.profile?.full_name ?? ''} />

      <PhoneVerification
        phone={context.profile?.phone ?? ''}
        verified={context.profile?.phone_verified ?? false}
      />

      <EmailForm email={context.user.email ?? ''} />
      <PasswordForm />
      <SignOutEverywhere />
    </div>
  );
}
