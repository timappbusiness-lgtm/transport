import Link from 'next/link';
import { Eyebrow } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Eyebrow>Staff</Eyebrow>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">Administrare</h1>
        <p className="mt-2 max-w-[54ch] text-sm text-muted">
          Ecranul de verificare a documentelor vine în etapa următoare. Deocamdată
          aici este doar structura și accesul.
        </p>
      </div>
      <Link
        href={ROUTES.adminDocuments}
        className="rounded-[8px] border border-border bg-surface p-5 hover:border-muted"
      >
        <p className="font-display text-[1.0625rem] font-bold">Documente de verificat</p>
        <p className="mt-1 text-sm text-muted">Coada de verificare manuală.</p>
      </Link>
    </div>
  );
}
