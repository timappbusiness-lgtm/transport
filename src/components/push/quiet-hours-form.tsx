'use client';

import { useActionState } from 'react';
import {
  setQuietHoursAction,
  type NotificationActionState,
} from '@/app/cont/setari/notificari/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { pushCopy } from '@/content/notificari';
import type { QuietHours } from '@/lib/notifications-source';

const EMPTY: NotificationActionState = {};
const c = pushCopy.settings.quiet;

export function QuietHoursForm({ quiet }: { quiet: QuietHours }) {
  const [state, action] = useActionState(setQuietHoursAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="text-h3">{c.title}</h2>
        <p className="mt-1.5 max-w-[60ch] text-sm text-muted">{c.lede}</p>
      </div>

      <FormError>{state.error}</FormError>
      {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="quietHoursEnabled"
          defaultChecked={quiet.enabled}
          className="mt-0.5 size-4 accent-foreground"
        />
        {c.enable}
      </label>

      <div className="grid gap-4 sm:grid-cols-[8rem_8rem_minmax(0,12rem)]">
        <Field label={c.from} name="quietFrom" type="time" defaultValue={quiet.from} />
        <Field label={c.to} name="quietTo" type="time" defaultValue={quiet.to} />
        <Field
          label={c.cap}
          name="maxPerHour"
          inputMode="numeric"
          defaultValue={String(quiet.maxPerHour)}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">
        {c.zone} {c.capHint}
      </p>

      <SubmitButton className="sm:w-auto sm:px-8 sm:self-start">Salvează</SubmitButton>
    </form>
  );
}
