import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { Container } from './container';

/**
 * Stand-in for a route in UNBUILT_ROUTES, so no link on the site is a 404.
 * Replace the page file when the real screen is built, and drop the route
 * from UNBUILT_ROUTES.
 */
export function PlaceholderPage({
  title,
  children,
  extra,
}: {
  title: string;
  children: React.ReactNode;
  /** Rendered under the lede: anything that is not a sentence. */
  extra?: React.ReactNode;
}) {
  return (
    <>
        <Container className="flex min-h-[60vh] flex-col justify-center py-20">
          <EyebrowPill>Pagină în lucru</EyebrowPill>
          <h1 className="mt-4 text-h1">{title}</h1>
          <Lede className="mt-4">{children}</Lede>
          {extra ? <div className="mt-6">{extra}</div> : null}
          <div className="mt-8">
            <Link href={ROUTES.home} className={buttonClasses('secondary', 'md')}>
              Înapoi la prima pagină
            </Link>
          </div>
        </Container>
    </>
  );
}
