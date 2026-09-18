'use client';

import { useEffect, useState } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { pushCopy } from '@/content/notificari';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * "Instalează aplicația", and only when the browser says it is installable.
 *
 * `beforeinstallprompt` fires when Chrome has decided the site qualifies
 * and the person has not installed it; capturing it lets the offer live
 * somewhere discreet instead of in the banner Chrome would otherwise show
 * at the top of the page.
 *
 * Nothing renders on a browser that never fires it, which includes every
 * iOS browser — there the instructions in the permission card are the
 * install path, because Safari has no programmatic one.
 */
export function InstallButton({ className }: { className?: string | undefined }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    function capture(event: Event) {
      // Without this the browser shows its own banner, which on a form
      // page covers the field somebody is typing in.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }

    window.addEventListener('beforeinstallprompt', capture);
    // Chrome does not re-fire it after an install, so the offer has to
    // take itself away.
    const installed = () => setPrompt(null);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (prompt === null) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          void prompt.prompt().then(() => setPrompt(null));
        }}
        className={buttonClasses('secondary', 'sm')}
      >
        {pushCopy.install.action}
      </button>
      <p className="mt-1.5 text-xs text-muted">{pushCopy.install.hint}</p>
    </div>
  );
}
