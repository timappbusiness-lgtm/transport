import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { AuthCard, TextLink } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { safeNextPath, withNext } from '@/lib/auth/next-path';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Înregistrare' };

const c = authCopy.chooseType;

function Choice({
  href,
  icon,
  title,
  body,
  cta,
  note,
  variant,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  note: string;
  variant: 'primary' | 'secondary';
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="text-muted">
          {icon}
        </span>
        <h2 className="text-h3">{title}</h2>
      </div>
      <p className="text-body text-muted">{body}</p>
      <Link href={href} className={cn(buttonClasses(variant, 'md'), 'w-full')}>
        {cta}
      </Link>
      <p className="text-center font-mono text-label text-muted">{note}</p>
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; next?: string }>;
}) {
  const { tip, next: rawNext } = await searchParams;
  // Somebody sent here from the middle of a form goes back to it, which
  // ever account they choose — so both choices, and the sign-in link,
  // carry the place.
  const next = safeNextPath(rawNext, '');
  const companyHref = withNext(
    tip ? `${ROUTES.signUpCompany}?tip=${encodeURIComponent(tip)}` : ROUTES.signUpCompany,
    next,
  );

  return (
    <AuthCard
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          {authCopy.individualSignUp.hasAccount}{' '}
          <TextLink href={withNext(ROUTES.signIn, next)}>{authCopy.individualSignUp.signIn}</TextLink>
        </p>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice
          href={withNext(ROUTES.signUpIndividual, next)}
          icon={<Icon as={uiIcon('person')} size="md" />}
          title={c.individual.title}
          body={c.individual.body}
          cta={c.individual.cta}
          note={c.individual.note}
          variant="primary"
        />
        <Choice
          href={companyHref}
          icon={<Icon as={uiIcon('company')} size="md" />}
          title={c.company.title}
          body={c.company.body}
          cta={c.company.cta}
          note={c.company.note}
          variant="secondary"
        />
      </div>
    </AuthCard>
  );
}
