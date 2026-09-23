'use client';

import { useId, useState } from 'react';
import { grantStaffAction, revokeStaffAction, type TeamState } from '@/app/admin/echipa/actions';
import { buttonClasses } from '@/components/ui/button';
import { teamCopy } from '@/content/echipa';
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffMember } from '@/lib/staff';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: TeamState = {};
const c = teamCopy;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

/** Adding somebody, by the address on an account that already exists. */
export function GrantStaff() {
  const [state, action, pending] = useKeptActionState(grantStaffAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="mt-4 flex flex-col gap-3">
      <label htmlFor={`${id}-email`} className="flex flex-col gap-1.5 text-body">
        {c.add.email}
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          className={CONTROL}
        />
      </label>

      {/* One value today. The select stays because the day a second role
          exists it is one entry in STAFF_ROLES and nothing else. */}
      {STAFF_ROLES.length > 1 ? (
        <label htmlFor={`${id}-role`} className="flex flex-col gap-1.5 text-body">
          {c.add.role}
          <select id={`${id}-role`} name="role" defaultValue="admin" className={CONTROL}>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {STAFF_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="role" value="admin" />
      )}

      <label htmlFor={`${id}-reason`} className="flex flex-col gap-1.5 text-body">
        {c.add.reason}
        <input id={`${id}-reason`} name="reason" required className={CONTROL} />
        <span className="text-small text-muted">{c.add.reasonHint}</span>
      </label>

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {pending ? c.add.submitting : c.add.submit}
        </button>
      </div>

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
    </KeepingForm>
  );
}

/**
 * Taking it away, with the reason typed before the button appears.
 *
 * The reason is mandatory in `set_platform_staff`; asking for it here
 * first means nobody presses a button and then loses the sentence they
 * were about to write.
 */
export function RevokeStaff({ member }: { member: StaffMember }) {
  const [state, action, pending] = useKeptActionState(revokeStaffAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();
  const name = member.full_name ?? member.email ?? member.user_id;

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-body text-danger underline underline-offset-4"
        >
          {c.list.revoke}
        </button>
        {state.notice !== undefined ? (
          <p role="status" className="mt-2 text-body text-muted">
            {state.notice}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <KeepingForm
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(c.revoke.confirm)) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="user_id" value={member.user_id} />
      <input type="hidden" name="name" value={name} />

      <label htmlFor={`${id}-why`} className="flex flex-col gap-1.5 text-body">
        {c.revoke.reason}
        <input id={`${id}-why`} name="reason" required className={CONTROL} />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('secondary', 'sm')}>
          {pending ? c.list.revoking : c.list.revoke}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-body text-muted underline underline-offset-4"
        >
          Renunță
        </button>
      </div>

      {state.error !== undefined ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
    </KeepingForm>
  );
}
