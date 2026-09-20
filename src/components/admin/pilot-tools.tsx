'use client';

import { useActionState } from 'react';
import {
  markTestAccountAction,
  verifyPhoneAction,
  type StaffToolState,
} from '@/app/admin/pilot/actions';
import { buttonClasses } from '@/components/ui/button';

const EMPTY: StaffToolState = {};
const CONTROL = 'rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

/**
 * The two things a person on the team does during a pilot.
 *
 * Both are here rather than scattered: confirming a number by hand is a
 * pilot-period workaround for the missing SMS provider, and marking an
 * account as ours is what keeps this page's own numbers honest.
 */
export function PilotTools() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VerifyPhone />
      <MarkTest />
    </div>
  );
}

function VerifyPhone() {
  const [state, action, pending] = useActionState(verifyPhoneAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h3 className="text-[0.9375rem]">Confirmă un număr de telefon</h3>
        <p className="mt-1 max-w-[58ch] text-sm text-muted">
          Singura cale, cât timp nu avem furnizor de SMS. Fără număr confirmat, o persoană fizică
          poate publica, dar nu poate deschide datele de contact ale unui transportator.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        Contul (id)
        <input name="user_id" required autoComplete="off" className={CONTROL} />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        Cum ai confirmat
        <input
          name="note"
          required
          autoComplete="off"
          placeholder="sunat 20.09, a răspuns Maria Ion"
          className={CONTROL}
        />
        <span className="text-xs text-muted">
          Se scrie în jurnalul de audit. „Verificat” fără să spui cum este exact afirmația pe care
          o criticăm la concurență.
        </span>
      </label>

      <Result state={state} pending={pending} label="Confirmă" />
    </form>
  );
}

function MarkTest() {
  const [state, action, pending] = useActionState(markTestAccountAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h3 className="text-[0.9375rem]">Marchează un cont ca al nostru</h3>
        <p className="mt-1 max-w-[58ch] text-sm text-muted">
          Iese din panourile publice, din lista de firme, din numerele de pe prima pagină și din
          toate cifrele de pe pagina asta.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          Ce este
          <select name="kind" defaultValue="company" className={CONTROL}>
            <option value="company">Firmă</option>
            <option value="user">Cont</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Id
          <input name="id" required autoComplete="off" className={CONTROL} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_test" value="yes" defaultChecked className="size-4" />
        Este contul nostru de test
      </label>

      <Result state={state} pending={pending} label="Salvează" />
    </form>
  );
}

function Result({
  state,
  pending,
  label,
}: {
  state: StaffToolState;
  pending: boolean;
  label: string;
}) {
  return (
    <>
      <button type="submit" disabled={pending} className={buttonClasses('secondary', 'md')}>
        {pending ? 'Se salvează…' : label}
      </button>
      {state.error !== undefined ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.notice !== undefined ? (
        <p role="status" className="text-sm text-muted">
          {state.notice}
        </p>
      ) : null}
    </>
  );
}
