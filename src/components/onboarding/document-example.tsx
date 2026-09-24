/**
 * A drawn example of a document, small enough to sit at the start of its
 * row, with the one place the carrier looks for marked: the expiry date.
 *
 * Drawn rather than photographed, for the reason `PhotoExample` gives: a
 * real licence is somebody's data. Nothing on it is legible, and nothing
 * on it looks like a stamp or a seal (`docs/13-iconuri.md`): the mark is
 * a plain outline around a line of writing.
 */

type Shape = 'licence' | 'insurance' | 'card' | 'certificate' | 'copy';

const SHAPES: Record<string, Shape> = {
  licenta_comunitara: 'licence',
  certificat_casa_expeditii: 'licence',
  certificat_inregistrare_onrc: 'certificate',
  asigurare_cmr: 'insurance',
  asigurare_raspundere_expeditor: 'insurance',
  rca: 'insurance',
  carte_verde: 'insurance',
  itp: 'card',
  copie_conforma: 'copy',
  autorizatie_adr: 'licence',
};

/** Where the date is, said for a person who cannot see the drawing. */
const WHERE: Record<Shape, string> = {
  licence: 'titlul sus, data de valabilitate jos',
  insurance: 'perioada asigurată în tabelul din mijloc',
  card: 'data următoarei inspecții în chenarul din dreapta',
  certificate: 'fără dată de expirare',
  copy: 'numărul vehiculului și data de valabilitate',
};

export function DocumentExample({ kind, label, className }: { kind: string; label: string; className?: string }) {
  const shape = SHAPES[kind] ?? 'licence';
  return (
    <svg
      viewBox="0 0 96 72"
      role="img"
      aria-label={`Exemplu de ${label}: ${WHERE[shape]}`}
      className={className}
      data-document-example={shape}
    >
      <rect x="0" y="0" width="96" height="72" rx="8" className="fill-ground-alt" />
      {shape === 'card' ? (
        <g>
          <rect x="10" y="16" width="76" height="42" rx="4" className="fill-surface stroke-border-strong" strokeWidth="1" />
          <rect x="16" y="23" width="30" height="4" rx="1.5" className="fill-ink-soft" />
          <rect x="16" y="32" width="36" height="3" rx="1.5" className="fill-border-strong" />
          <rect x="16" y="39" width="28" height="3" rx="1.5" className="fill-border-strong" />
          <rect x="58" y="26" width="22" height="18" rx="2" className="fill-surface stroke-accent" strokeWidth="1.5" />
          <rect x="62" y="33" width="14" height="3" rx="1.5" className="fill-ink-soft" />
        </g>
      ) : (
        <g>
          <rect x="26" y="6" width="44" height="60" rx="3" className="fill-surface stroke-border-strong" strokeWidth="1" />
          <rect x="31" y="12" width={shape === 'certificate' ? 26 : 22} height="4" rx="1.5" className="fill-ink-soft" />
          <rect x="31" y="21" width="34" height="2.5" rx="1" className="fill-border-strong" />
          <rect x="31" y="26" width="34" height="2.5" rx="1" className="fill-border-strong" />
          {shape === 'insurance' ? (
            <g>
              <rect x="31" y="32" width="34" height="14" rx="1" className="fill-none stroke-border-strong" strokeWidth="0.75" />
              <line x1="31" y1="39" x2="65" y2="39" className="stroke-border-strong" strokeWidth="0.75" />
              <rect x="29" y="37" width="38" height="11" rx="2" className="fill-none stroke-accent" strokeWidth="1.5" />
            </g>
          ) : (
            <rect x="31" y="31" width="26" height="2.5" rx="1" className="fill-border-strong" />
          )}
          {shape === 'copy' ? (
            <g>
              <rect x="31" y="38" width="18" height="7" rx="1" className="fill-none stroke-ink-soft" strokeWidth="1" />
              <rect x="29" y="52" width="30" height="8" rx="2" className="fill-none stroke-accent" strokeWidth="1.5" />
              <rect x="32" y="55" width="24" height="2.5" rx="1" className="fill-ink-soft" />
            </g>
          ) : shape === 'licence' ? (
            <g>
              <rect x="29" y="52" width="30" height="8" rx="2" className="fill-none stroke-accent" strokeWidth="1.5" />
              <rect x="32" y="55" width="24" height="2.5" rx="1" className="fill-ink-soft" />
            </g>
          ) : shape === 'certificate' ? (
            <rect x="31" y="54" width="20" height="2.5" rx="1" className="fill-border-strong" />
          ) : null}
        </g>
      )}
    </svg>
  );
}
