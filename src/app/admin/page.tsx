import Link from 'next/link';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">Administrare</h1>
        <p className="mt-2 max-w-[54ch] text-body text-muted">
          Ecranul de verificare a documentelor vine în etapa următoare. Deocamdată
          aici este doar structura și accesul.
        </p>
      </div>
      <Link
        href={ROUTES.adminDocuments}
        className="rounded-card border border-border bg-surface p-5 hover:border-muted"
      >
        <p className="font-display text-body-lg font-medium">Documente de verificat</p>
        <p className="mt-1 text-body text-muted">Coada de verificare manuală.</p>
      </Link>
    </div>
  );
}
