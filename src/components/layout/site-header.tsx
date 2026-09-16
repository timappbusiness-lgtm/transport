import Link from 'next/link';
import { BrandMark } from '@/components/icons';
import { buttonClasses } from '@/components/ui/button';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { cn } from '@/lib/utils';
import { Container } from './container';

const SECTIONS = [
  { href: '#cereri', label: 'Cereri' },
  { href: '#preturi', label: 'Prețuri' },
  { href: '#platforme', label: 'Platforme' },
  { href: '#transportatori', label: 'Transportatori' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <Container className="flex h-[60px] items-center gap-6">
        <Link
          href={ROUTES.home}
          className="mr-auto flex items-center gap-2.5 font-display text-[1.0625rem] font-extrabold tracking-[-0.02em]"
        >
          <BrandMark className="flex-none" />
          {BRAND_NAME}
        </Link>
        <nav aria-label="Principal" className="hidden gap-6 text-sm text-muted min-[900px]:flex">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className="hover:text-foreground">
              {s.label}
            </a>
          ))}
        </nav>
        <Link href={ROUTES.signIn} className="text-sm text-muted hover:text-foreground">
          Intră în cont
        </Link>
        <Link href={ROUTES.newRequest} className={cn(buttonClasses('primary', 'sm'), 'text-[0.8125rem]')}>
          Adaugă cerere
        </Link>
      </Container>
    </header>
  );
}
