'use client';

import {
  markTestAccountAction,
  verifyPhoneAction,
  type StaffToolState,
} from '@/app/admin/pilot/actions';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: StaffToolState = {};
const CONTROL = 'rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

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
  const [state, action, pending] = useKeptActionState(verifyPhoneAction, EMPTY);

  return (
    <KeepingForm
      resetOn={state.notice !== undefined && state.error === undefined ? state : null}
      action={action}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div>
        <h3 className="text-body">Confirmă un număr de telefon</h3>
        <p className="mt-1 max-w-[58ch] text-body text-muted">
          Singura cale, cât timp nu avem furnizor de SMS. Fără număr confirmat, o persoană fizică
          poate publica, dar nu poate deschide datele de contact ale unui transportator.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-body">
        Contul (id)
        <input name="user_id" required autoComplete="off" className={CONTROL} />
      </label>

      <label className="flex flex-col gap-1.5 text-body">
        Cum ai confirmat
        <input
          name="note"
          required
          autoComplete="off"
          placeholder="sunat 20.09, a răspuns Maria Ion"
          className={CONTROL}
        />
        <span className="text-small text-muted">
          Se scrie în jurnalul de audit. „Verificat” fără să spui cum este exact afirmația pe care
          o criticăm la concurență.
        </span>
      </label>

      <Result state={state} pending={pending} label="Confirmă" />
    </KeepingForm>
  );
}

function MarkTest() {
  const [state, action, pending] = useKeptActionState(markTestAccountAction, EMPTY);

  return (
    <KeepingForm
      resetOn={state.notice !== undefined && state.error === undefined ? state : null}
      action={action}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div>
        <h3 className="text-body">Marchează un cont ca al nostru</h3>
        <p className="mt-1 max-w-[58ch] text-body text-muted">
          Iese din panourile publice, din lista de firme, din numerele de pe prima pagină și din
          toate cifrele de pe pagina asta.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-body">
          Ce este
          <select name="kind" defaultValue="company" className={CONTROL}>
            <option value="company">Firmă</option>
            <option value="user">Cont</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-body">
          Id
          <input name="id" required autoComplete="off" className={CONTROL} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-body">
        <input type="checkbox" name="is_test" value="yes" defaultChecked className="size-4" />
        Este contul nostru de test
      </label>

      <Result state={state} pending={pending} label="Salvează" />
    </KeepingForm>
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
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      {state.notice !== undefined ? (
        <p role="status" className="text-body text-muted">
          {state.notice}
        </p>
      ) : null}
    </>
  );
}
