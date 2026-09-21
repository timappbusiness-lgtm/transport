import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { Card } from '@/components/ui/primitives';
import { OPERATOR, has } from '@/config/company';
import { ROUTES } from '@/config/routes';
import { HELP_SECTIONS, helpCopy } from '@/content/ajutor';
import { requireAccountContext } from '@/lib/auth/account';
import { audienceOf, countAnswers, forAudience, search } from '@/lib/help';

export const metadata: Metadata = { title: helpCopy.meta.title };
export const dynamic = 'force-dynamic';

const c = helpCopy;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
}

/**
 * Ajutorul, în cont.
 *
 * Ce se vede depinde de tipul de cont: un șofer nu are ce face cu
 * „cum public o cerere", iar o pagină în care patru cincimi nu te
 * privesc este o pagină pe care oamenii o închid.
 *
 * `?raspuns=` deschide un anume răspuns — de acolo vin semnele de
 * întrebare de pe celelalte ecrane. Deschiderea se face cu `open` pe
 * `<details>`, deci funcționează și fără JavaScript.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await requireAccountContext(ROUTES.accountHelp);
  const params = await searchParams;

  const query = one(params, 'q');
  const wanted = one(params, 'raspuns');

  const audience = audienceOf({
    activeRole: context.activeRole,
    companyType: context.activeCompany?.company_type ?? null,
  });

  const mine = forAudience(HELP_SECTIONS, audience);
  const sections = query === null ? mine : search(mine, query);

  return (
    <div className="flex flex-col gap-6">
      <TopBar title={c.title} actions={[]} />
      <p className="max-w-[62ch] text-sm text-muted">{c.lede}</p>

      <form method="get" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          {c.search}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query ?? ''}
          placeholder={c.search}
          className="min-w-0 flex-1 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-input border border-border-strong px-3 py-2 text-sm"
        >
          {c.searchAction}
        </button>
        {query !== null ? (
          <Link
            href={ROUTES.accountHelp}
            className="rounded-input border border-border-strong px-3 py-2 text-sm"
          >
            {c.clear}
          </Link>
        ) : null}
      </form>

      {query !== null ? (
        <p className="text-sm text-muted">{c.results(countAnswers(sections))}</p>
      ) : null}

      {sections.length === 0 ? (
        <Card className="p-6">
          <p className="text-[1.0625rem]">{c.empty}</p>
          <p className="mt-1 max-w-[54ch] text-sm text-muted">{c.emptyBody}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.id} className="flex flex-col gap-2">
              <h2 className="text-[1.0625rem]">{section.title}</h2>
              <ul className="flex flex-col gap-2">
                {section.answers.map((answer) => (
                  <li key={answer.id}>
                    <details
                      id={answer.id}
                      open={answer.id === wanted || query !== null}
                      className="rounded-card border border-border bg-surface p-4"
                    >
                      <summary className="cursor-pointer text-[0.9375rem] font-medium">
                        {answer.question}
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        {answer.answer.map((paragraph) => (
                          <p key={paragraph} className="max-w-[64ch] text-sm text-muted">
                            {paragraph}
                          </p>
                        ))}
                        {answer.link !== undefined ? (
                          <p className="text-sm">
                            <Link
                              href={answer.link.href}
                              className="underline underline-offset-4"
                            >
                              {answer.link.label} →
                            </Link>
                          </p>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-[1.0625rem]">{c.support.title}</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted">{c.support.lede}</p>

        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{c.support.email}:</dt>
            <dd>
              {has('email') ? (
                <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-4">
                  {OPERATOR.email}
                </a>
              ) : (
                <span className="text-warning">{c.support.missing}</span>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{c.support.phone}:</dt>
            <dd>
              {has('phone') ? (
                <a href={`tel:${OPERATOR.phone}`} className="underline underline-offset-4">
                  {OPERATOR.phone}
                </a>
              ) : (
                <span className="text-warning">{c.support.missing}</span>
              )}
            </dd>
          </div>
        </dl>

        {/* Un marcaj vizibil, nu un rând gol. O pagină de ajutor care
            arată un e-mail inventat este mai rea decât una care spune
            că nu are încă unul. */}
        {!has('email') || !has('phone') ? (
          <p className="mt-3 max-w-[60ch] rounded-input border border-warning/45 bg-warning/8 p-3 text-[0.8125rem]">
            {c.support.missingHint}{' '}
            <Link href={ROUTES.contact} className="underline underline-offset-4">
              {c.support.contactPage}
            </Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
