import type { Metadata } from 'next';
import { mementoCopy } from '@/content/memento';
import { UnsubscribeForm } from './unsubscribe-form';

const c = mementoCopy.unsubscribe;

export const metadata: Metadata = { title: c.title, robots: { index: false, follow: false } };

/** The link at the foot of a memento reminder: one button, no account needed. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).t;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  return (
    <main className="mx-auto flex w-full max-w-[52ch] flex-col gap-4 px-4 py-16">
      <h1 className="text-h2">{c.title}</h1>
      <UnsubscribeForm token={token} />
    </main>
  );
}
