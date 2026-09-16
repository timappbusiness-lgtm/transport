import Link from 'next/link';
import { BrandMark } from '@/components/icons';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';

export function AuthPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="app-surface flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <main className="w-full max-w-[420px]">
        <Link href={ROUTES.home} className="mb-8 inline-flex items-center gap-2 font-display font-extrabold">
          <BrandMark />
          {BRAND_NAME}
        </Link>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{intro}</p>
        {children}
      </main>
    </div>
  );
}
