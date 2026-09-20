import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import type { Profile } from '@/lib/auth/account';

/**
 * Two things about the account itself, above everything about the firm.
 *
 * Neither is dismissible and neither is a warning in the ordinary sense:
 * one says this is not a real account, the other says we cannot reach you.
 * Both are facts somebody needs before they read anything else on the
 * screen, which is why they sit above `StatusBanner` rather than
 * competing with it for the one slot it allows itself.
 */
export function AccountNotices({ profile }: { profile: Profile | null }) {
  if (profile === null) return null;

  return (
    <>
      {profile.is_test ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border-strong bg-ground-alt px-4 py-3 text-sm"
        >
          <span className="rounded-full border border-border-strong px-2 py-0.5 font-mono text-xs uppercase tracking-[0.08em]">
            Cont de test
          </span>
          <span className="text-muted">
            Ce faci aici nu apare pe panourile publice, în lista de firme sau în numerele de pe
            prima pagină.
          </span>
        </div>
      ) : null}

      {profile.email_undeliverable_at !== null ? (
        <div
          role="alert"
          className="mb-4 rounded-card border border-danger/45 bg-danger/8 px-4 py-3 text-sm"
        >
          <p>
            <strong>Nu putem trimite e-mailuri la adresa ta.</strong> Furnizorul ne-a spus că
            adresa <span className="font-mono">{profile.email}</span> nu poate primi mesaje, așa
            că am oprit trimiterile către ea — inclusiv memento-urile pentru documente care
            expiră.
          </p>
          <p className="mt-2 text-muted">
            Schimbă adresa din <Link href={ROUTES.accountProfile} className="underline underline-offset-4">Profil</Link>{' '}
            sau scrie-ne și o reactivăm.
          </p>
        </div>
      ) : null}
    </>
  );
}
