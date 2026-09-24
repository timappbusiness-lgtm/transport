import { messagesCopy } from '@/content/mesaje';

const c = messagesCopy.owner;

/**
 * Ce vede proprietarul unui anunț scos de pe panou.
 *
 * Anunțul nu dispare din contul lui — `admin_listings` îl ascunde de pe
 * panoul public, `v_board_*` îl scot din vederi, dar rândul rămâne al
 * lui. Dacă i l-am fi șters din listă, omul ar fi crezut că a greșit
 * ceva la publicare și l-ar fi publicat din nou, identic.
 *
 * Motivul este scris de echipă pentru el, nu pentru noi: indicația de
 * pe `/admin/anunturi` spune asta persoanei care îl scrie.
 */
export function HiddenNotice({ reason }: { reason: string | null }) {
  return (
    <div className="mt-3 rounded-input border border-warning/45 bg-warning/8 p-3 text-small">
      <p className="font-medium">{c.hidden}</p>
      {reason !== null && reason !== '' ? (
        <p className="mt-1 [overflow-wrap:anywhere]">
          <span className="text-muted">{c.hiddenReason}</span> {reason}
        </p>
      ) : null}
      <p className="mt-1 max-w-[54ch] text-muted">{c.hiddenWhat}</p>
    </div>
  );
}
