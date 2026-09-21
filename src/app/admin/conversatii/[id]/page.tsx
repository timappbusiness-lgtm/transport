import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ModerateMessage } from '@/components/admin/moderate-message';
import { StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { formatTime, groupByDay } from '@/lib/messages';
import { loadMessages } from '@/lib/messages-source';

export const dynamic = 'force-dynamic';

const c = messagesCopy.admin.conversations;

/**
 * Un fir sesizat, pentru echipă.
 *
 * `conversation_messages()` refuză firul dacă nu este sesizat și nu este
 * pe o comandă în dispută, deci pagina nu are nicio verificare proprie
 * de adăugat — un id ghicit întoarce un refuz, nu o conversație.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let messages;
  try {
    messages = await loadMessages(id);
  } catch {
    notFound();
  }
  if (messages === undefined || messages.length === 0) notFound();

  const groups = groupByDay(messages);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm">
        <Link
          href={ROUTES.adminConversations}
          className="text-muted underline-offset-4 hover:underline"
        >
          ← {c.title}
        </Link>
      </p>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.day} aria-label={group.label} className="flex flex-col gap-2">
            <p className="text-center text-xs text-muted">{group.label}</p>
            {group.messages.map((message) => (
              <article
                key={message.id}
                className="rounded-card border border-border bg-surface px-4 py-3"
              >
                <p className="flex flex-wrap items-baseline gap-2 text-xs text-muted">
                  <span className="font-medium text-foreground">
                    {message.sender_name ?? '—'}
                  </span>
                  {formatTime(message.created_at)}
                  {message.was_masked ? (
                    <StatusBadge tone="neutral">Mascat</StatusBadge>
                  ) : null}
                  {message.hidden_at !== null ? (
                    <StatusBadge tone="danger">Ascuns</StatusBadge>
                  ) : null}
                </p>

                {message.body !== null && message.body !== '' ? (
                  <p className="mt-1.5 whitespace-pre-line text-[0.9375rem]">{message.body}</p>
                ) : null}

                {message.attachments.length > 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    {message.attachments.length === 1
                      ? 'o imagine'
                      : `${message.attachments.length} imagini`}
                  </p>
                ) : null}

                {message.hidden_at === null ? (
                  <div className="mt-2">
                    <ModerateMessage messageId={message.id} />
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
