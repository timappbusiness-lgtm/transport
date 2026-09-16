import type { Metadata } from 'next';
import { AppShell } from '@/components/app/app-shell';
import { ROUTES } from '@/config/routes';
import { requireSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Contul meu' };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireSession(ROUTES.account);
  return <AppShell session={session}>{children}</AppShell>;
}
