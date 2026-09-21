'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Thread } from '@/components/messages/thread';
import type { Message } from '@/lib/messages';

/**
 * Învelișul care reîmprospătează.
 *
 * `Thread` nu știe despre router: primește o funcție. Asta îl face
 * testabil fără Next și ține o singură abonare în modulul lui.
 */
export function ThreadView({
  conversationId,
  messages,
  urls,
}: {
  conversationId: string;
  messages: readonly Message[];
  urls: Record<string, string>;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <Thread
      conversationId={conversationId}
      messages={messages}
      urls={urls}
      onRefresh={refresh}
    />
  );
}
