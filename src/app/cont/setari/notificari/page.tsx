import type { Metadata } from 'next';
import { DevicePanel } from '@/components/push/device-panel';
import { InstallButton } from '@/components/push/install-button';
import { PreferenceRow } from '@/components/push/preference-row';
import { QuietHoursForm } from '@/components/push/quiet-hours-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { pushCopy } from '@/content/notificari';
import { requireAccountContext } from '@/lib/auth/account';
import { loadNotificationSettings } from '@/lib/notifications-source';

const c = pushCopy.settings;

export const metadata: Metadata = { title: c.title };

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountNotificationSettings);
  const { types, devices, quiet } = await loadNotificationSettings(context);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Setări</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-[0.9375rem] text-muted">{c.lede}</p>
        <InstallButton className="mt-4" />
      </div>

      <DevicePanel devices={devices} />

      <section
        aria-labelledby="canale"
        className="rounded-card border border-border bg-surface px-5 py-2"
      >
        <h2 id="canale" className="pt-4 text-[1.0625rem]">
          {c.channels.title}
        </h2>
        <ul className="divide-y divide-border">
          {types.map((type) => (
            <PreferenceRow key={type.code} type={type} />
          ))}
        </ul>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <QuietHoursForm quiet={quiet} />
      </section>
    </div>
  );
}
