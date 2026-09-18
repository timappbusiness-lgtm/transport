'use client';

import { useActionState } from 'react';
import {
  setPreferenceAction,
  type NotificationActionState,
} from '@/app/cont/setari/notificari/actions';
import { pushCopy } from '@/content/notificari';
import type { NotificationType } from '@/lib/notifications-source';

const EMPTY: NotificationActionState = {};
const c = pushCopy.settings.channels;

/**
 * One kind of notification, with a switch per channel.
 *
 * A mandatory type shows its two locked channels as text rather than as a
 * disabled checkbox. A greyed-out tick that will not move invites people
 * to keep clicking it; a sentence says why once.
 */
export function PreferenceRow({ type }: { type: NotificationType }) {
  const [state, action] = useActionState(setPreferenceAction, EMPTY);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-[14rem] flex-1">
        <p className="text-[0.9375rem]">{type.label}</p>
        {type.description ? (
          <p className="mt-0.5 text-xs text-muted">{type.description}</p>
        ) : null}
        {type.isMandatory ? <p className="mt-1 text-xs text-muted">{c.lockedHint}</p> : null}
        {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Channel
          action={action}
          type={type.code}
          channel="inapp"
          label={c.inapp}
          checked={type.inapp}
          locked={type.isMandatory}
        />
        <Channel
          action={action}
          type={type.code}
          channel="email"
          label={c.email}
          checked={type.email}
          locked={type.isMandatory}
        />
        <Channel
          action={action}
          type={type.code}
          channel="push"
          label={c.push}
          checked={type.push}
          locked={false}
        />
      </div>
    </li>
  );
}

function Channel({
  action,
  type,
  channel,
  label,
  checked,
  locked,
}: {
  action: (formData: FormData) => void;
  type: string;
  channel: string;
  label: string;
  checked: boolean;
  locked: boolean;
}) {
  if (locked) {
    return (
      <span className="flex flex-col gap-0.5 text-xs text-muted">
        <span>{label}</span>
        <span className="text-[0.6875rem]">{c.locked}</span>
      </span>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-0.5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="enabled" value={checked ? 'false' : 'true'} />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="size-4 accent-[#1C262B]"
        />
        {label}
      </label>
    </form>
  );
}
