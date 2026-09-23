import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { PublishMenu } from '@/components/app/publish-menu';
import { appCopy } from '@/content/app';
import { ROUTES } from '@/config/routes';
import type { PublishAction } from '@/lib/navigation';

const c = appCopy.shell;

export interface Crumb {
  href: string;
  label: string;
}

/**
 * The title of the page, and the one action that belongs everywhere.
 *
 * Breadcrumbs appear only on a detail page — a single crumb above a page
 * title repeats the title, which is how breadcrumb trails end up ignored.
 */
export function TopBar({
  title,
  crumbs = [],
  actions,
}: {
  title: string;
  crumbs?: readonly Crumb[];
  actions: readonly PublishAction[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {crumbs.length > 0 ? (
          <nav aria-label="Navigare ierarhică" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-small text-muted">
              {crumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1">
                  <Link href={crumb.href} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                  <Icon as={uiIcon('forward')} size="sm" className="text-border-strong" />
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-h2 leading-tight">{title}</h1>
      </div>

      <div className="flex flex-none items-center gap-2">
        <PublishMenu actions={actions} />
      </div>
    </div>
  );
}

/**
 * The first thing in the tab order, invisible until it has focus.
 *
 * A sidebar with a dozen links in front of the content is exactly the case
 * this exists for.
 */
export function SkipLink() {
  return (
    <a
      href="#continut"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-input focus:border focus:border-border-strong focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
    >
      {c.skipToContent}
    </a>
  );
}

/** Where the account sits in the site, for the sidebar's brand link. */
export const HOME_CRUMB: Crumb = { href: ROUTES.account, label: c.account };
