import { FileSearch } from 'lucide-react';
import { EyebrowPill } from '@/components/ui/primitives';

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">Documente de verificat</h1>
      </div>
      <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface px-5 py-14 text-center">
        <span aria-hidden="true" className="text-muted">
          <FileSearch size={22} />
        </span>
        <p className="text-sm">Nu există documente în așteptare.</p>
        <p className="font-mono text-[0.6875rem] text-muted">
          Ecranul de verificare vine în etapa a doua.
        </p>
      </div>
    </div>
  );
}
