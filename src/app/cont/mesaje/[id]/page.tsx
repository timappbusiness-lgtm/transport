import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Composer } from '@/components/messages/composer';
import { MessageActions } from '@/components/messages/message-actions';
import { ThreadView } from '@/components/messages/thread-view';
import { StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { requireAccountContext } from '@/lib/auth/account';
import { contextHref, kindLabel } from '@/lib/messages';
import { loadBlocks, loadConversation, loadMessages, signAttachments } from '@/lib/messages-source';

export const metadata: Metadata = { title: messagesCopy.list.title };
export const dynamic = 'force-dynamic';

const c = messagesCopy.thread;

/**
 * Un fir, pe tot ecranul pe telefon.
 *
 * Antetul duce la contextul lui — cererea, traseul, oferta sau comanda —
 * pentru că un mesaj fără ce se discută este jumătate din informație, iar
 * cealaltă jumătate este la un click.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountContext(ROUTES.accountMessages);
  const { id } = await params;

  const conversation = await loadConversation(id);
  if (conversation === null) notFound();

  const messages = await loadMessages(id);
  const urls = await signAttachments(messages.flatMap((m) => m.attachments));
  const href = contextHref(conversation);

  // Blocarea se poate ridica din același loc din care s-a pus, deci
  // firul are nevoie să știe dacă există deja una pe contul celuilalt.
  const blocks = await loadBlocks();
  const block =
    conversation.counterparty_user_id === null
      ? null
      : (blocks.find((b) => b.blocked_user_id === conversation.counterparty_user_id) ?? null);

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div>
        <p className="text-body">
          <Link
            href={ROUTES.accountMessages}
            className="text-muted underline-offset-4 hover:underline"
          >
            ← {c.back}
          </Link>
        </p>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-h2">
          {conversation.counterparty_name ?? '—'}
          <StatusBadge tone="neutral">{kindLabel(conversation.kind)}</StatusBadge>
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
          {conversation.from_city !== null ? (
            <span className="text-muted">
              {conversation.from_city} → {conversation.to_city ?? '—'}
            </span>
          ) : null}
          {href !== null ? (
            <Link href={href} className="link-accent">
              {c.context[conversation.kind]}
            </Link>
          ) : null}
          {conversation.linked_conversation_id !== null ? (
            <Link
              href={`${ROUTES.accountMessages}/${conversation.linked_conversation_id}`}
              className="text-muted underline underline-offset-4"
            >
              {c.linked}
            </Link>
          ) : null}
          <MessageActions
            conversationId={conversation.id}
            messages={messages.filter((m) => !m.mine).map((m) => ({ id: m.id, at: m.created_at }))}
            counterpartyUserId={conversation.counterparty_user_id}
            blockId={block?.id ?? null}
          />
        </div>
      </div>

      <div className="flex-1">
        <ThreadView conversationId={conversation.id} messages={messages} urls={urls} />
      </div>

      {/* `key` este numărul de mesaje: când unul ajunge, pagina se
          redesenează cu unul în plus, caseta se remontează goală, și
          nu e nevoie de niciun efect care să o golească. Un eșec nu
          schimbă numărul, deci textul rămâne — exact când omul trebuie
          să reîncerce cu el. */}
      <Composer conversationId={conversation.id} />
    </div>
  );
}
