import Link from 'next/link';
import { helpCopy } from '@/content/ajutor';
import { helpHref, type ContextHelpKey } from '@/lib/help';

/**
 * Semnul de întrebare de lângă un titlu.
 *
 * Duce direct la răspuns, nu la pagina de ajutor. Un link care te lasă
 * în capul unei pagini cu douăzeci de întrebări este un link pe care
 * oamenii îl apasă o dată.
 *
 * Ținta vine din `CONTEXT_HELP`, iar un test verifică faptul că
 * fiecare cheie de acolo are un răspuns scris. Așa nu se poate rupe în
 * tăcere când cineva redenumește un id.
 */
export function HelpLink({ topic, label }: { topic: ContextHelpKey; label?: string }) {
  return (
    <Link
      href={helpHref(topic)}
      className="inline-flex items-center gap-1 text-[0.8125rem] text-muted underline-offset-4 hover:text-foreground hover:underline"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-4 items-center justify-center rounded-full border border-border-strong text-[0.625rem] leading-none"
      >
        ?
      </span>
      {label ?? helpCopy.hint}
    </Link>
  );
}
