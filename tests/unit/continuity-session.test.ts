import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SESSION_EXPIRED_DIGEST } from '@/lib/continuity/session';

/**
 * The two places a session that ended used to cost a form its contents,
 * and what they do now.
 *
 * The middleware redirected every request under /cont and /admin without
 * a user — the POST of a server action included — so the form got a
 * sign-in page back and landed on the error screen. And every action that
 * found nobody signed in redirected, which is a navigation, which is the
 * end of the form. Both now leave the form where it is.
 */

let user: { id: string } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user } }) },
  }),
}));
vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => true,
  supabaseUrl: () => 'http://supabase.test',
  supabasePublishableKey: () => 'anon',
}));

const { updateSession } = await import('@/lib/supabase/middleware');

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), init);
}

describe('the middleware and a session that is gone', () => {
  beforeEach(() => {
    user = null;
  });

  it('still sends a page visit to sign-in, with the way back', async () => {
    const response = await updateSession(request('/cont/firma?sectiune=acoperire'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/autentificare?next=%2Fcont%2Ffirma%3Fsectiune%3Dacoperire',
    );
  });

  it('lets a server action through to say so itself, instead of redirecting the form', async () => {
    const response = await updateSession(
      request('/cont/firma', { method: 'POST', headers: { 'next-action': '7f00ab' } }),
    );
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('does not treat a header alone, on a visit, as an action', async () => {
    const response = await updateSession(request('/cont', { headers: { 'next-action': 'x' } }));
    expect(response.status).toBe(307);
  });
});

describe('the middleware and a person already signed in', () => {
  beforeEach(() => {
    user = { id: 'u1' };
  });

  it('sends them from a sign-in page to where they were going, not to the dashboard', async () => {
    const response = await updateSession(
      request('/autentificare?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact'),
    );
    expect(response.headers.get('location')).toBe('http://localhost:3000/cerere/noua?pas=contact');
  });

  it('to the dashboard when there is nowhere else, or nowhere safe', async () => {
    for (const path of [
      '/autentificare',
      '/inregistrare?next=https%3A%2F%2Fevil.example',
      '/inregistrare/firma?next=%2Fautentificare',
    ]) {
      const response = await updateSession(request(path));
      expect(response.headers.get('location')).toBe('http://localhost:3000/cont');
    }
  });

  it('keeps a fragment the way back carries', async () => {
    const response = await updateSession(request('/autentificare?next=%2Fcont%2Fcereri%2Fabc%23oferte'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/cont/cereri/abc#oferte');
  });
});

describe('an action that finds nobody signed in', () => {
  it('throws the session error in an action, and redirects on a page', async () => {
    const headerValues = new Map<string, string>();
    vi.resetModules();
    vi.doMock('next/headers', () => ({
      headers: async () => ({
        has: (name: string) => headerValues.has(name),
        get: (name: string) => headerValues.get(name) ?? null,
      }),
      cookies: async () => ({ get: () => undefined }),
    }));
    const redirect = vi.fn((url: string) => {
      throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};307;` });
    });
    vi.doMock('next/navigation', () => ({ redirect }));
    const { redirectToSignIn } = await import('@/lib/auth/account');

    headerValues.set('next-action', 'abc');
    await expect(redirectToSignIn('/cont/firma')).rejects.toMatchObject({ digest: SESSION_EXPIRED_DIGEST });
    expect(redirect).not.toHaveBeenCalled();

    headerValues.delete('next-action');
    await expect(redirectToSignIn('/cont/firma')).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/autentificare?next=%2Fcont%2Ffirma;307;',
    });
  });
});

describe('the session notice on a page with several forms', () => {
  it('is drawn by the first one mounted, and passes on when that one leaves', async () => {
    const { claimSessionNotice, sessionNoticeOwner, subscribeSessionNoticeOwner } = await import(
      '@/lib/continuity/session-store'
    );
    const changes = vi.fn();
    const unsubscribe = subscribeSessionNoticeOwner(changes);
    const shell = Symbol('shell');
    const form = Symbol('form');

    expect(sessionNoticeOwner()).toBeNull();
    const releaseShell = claimSessionNotice(shell);
    const releaseForm = claimSessionNotice(form);
    expect(sessionNoticeOwner()).toBe(shell);

    releaseShell();
    expect(sessionNoticeOwner()).toBe(form);
    releaseForm();
    expect(sessionNoticeOwner()).toBeNull();
    // Releasing twice (a strict-mode double cleanup) changes nothing.
    releaseForm();
    expect(sessionNoticeOwner()).toBeNull();
    expect(changes).toHaveBeenCalled();
    unsubscribe();
  });

  it('is never mounted by the root layout, which every page pays for', async () => {
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).not.toMatch(/SessionNotice|DraftDone/);
    for (const shell of ['src/app/cont/layout.tsx', 'src/app/admin/layout.tsx']) {
      const source = readFileSync(shell, 'utf8');
      expect(source).toMatch(/<SessionNotice \/>/);
      expect(source).toMatch(/<DraftDone \/>/);
    }
    expect(readFileSync('src/components/ui/keeping-form.tsx', 'utf8')).toMatch(/<SessionNotice \/>/);
  });
});
