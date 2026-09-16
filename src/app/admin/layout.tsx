import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app/app-shell';
import { ROUTES } from '@/config/routes';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Administrare' };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <AppShell session={session}>
      <nav aria-label="Administrare" className="mb-6 flex gap-2 text-sm">
        <Link href={ROUTES.adminDocuments} className="rounded-[6px] border border-border bg-surface px-3 py-1.5 hover:border-muted">
          Documente de verificat
        </Link>
        <Link href={ROUTES.adminStaff} className="rounded-[6px] border border-border bg-surface px-3 py-1.5 hover:border-muted">
          Personal
        </Link>
      </nav>
      {children}
    </AppShell>
  );
}
