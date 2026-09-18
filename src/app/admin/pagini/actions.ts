'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { SEO_DATA_TAG } from '@/lib/seo-data-source';
import { SEO_TAG } from '@/lib/seo-pages-source';
import { SEO_ROOT, type SeoPageType } from '@/lib/seo-pages';

/**
 * Editing and publishing landing pages.
 *
 * The three RPCs behind these are SECURITY DEFINER, check staff membership
 * themselves and write the before/after pair to `audit_log`. There is no
 * table grant that would let an action write a row directly, so the check
 * below produces a better message and is not the rule.
 *
 * Every write busts both caches. Publishing a page that does not appear
 * for ten minutes is a staff member pressing the button a second time,
 * and then a third.
 */

export interface PageActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

const NO_ACCESS = 'Doar echipa platformei poate modifica paginile.';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function bust(): void {
  updateTag(SEO_TAG);
  updateTag(SEO_DATA_TAG);
  revalidatePath(ROUTES.adminPages);
  revalidatePath(SEO_ROOT);
  // The sitemap renders per request, but its own route cache would still
  // serve a stale body for the rest of the window.
  revalidatePath('/sitemap.xml');
}

/**
 * The questions, parsed from the repeated pairs the form posts.
 *
 * A row with one half filled in is the usual way this goes wrong — a
 * question typed, the answer left for later, and an FAQPage block with an
 * empty acceptedAnswer on a page whose whole purpose is structured data.
 * The RPC refuses it; this names which row so it can be fixed.
 */
function readFaq(formData: FormData): { faq: { q: string; a: string }[]; error?: string } {
  const questions = formData.getAll('faqQuestion').map((v) => String(v).trim());
  const answers = formData.getAll('faqAnswer').map((v) => String(v).trim());

  const faq: { q: string; a: string }[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i] ?? '';
    const a = answers[i] ?? '';
    if (q === '' && a === '') continue;
    if (q === '' || a === '') {
      return { faq, error: `Întrebarea ${i + 1} are nevoie și de întrebare, și de răspuns.` };
    }
    faq.push({ q, a });
  }
  return { faq };
}

export async function saveSeoPageAction(
  _previous: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const context = await getAccountContext();
  if (!context?.isStaff) return { error: NO_ACCESS };

  const slug = text(formData, 'slug');
  const { faq, error: faqError } = readFaq(formData);
  if (faqError) return { fieldErrors: { faq: faqError } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_seo_page', {
    p_slug: slug,
    p_title: text(formData, 'title').trim(),
    p_h1: text(formData, 'h1').trim(),
    p_h1_soft: text(formData, 'h1Soft').trim() || null,
    p_intro: text(formData, 'intro').trim(),
    p_faq: faq,
  });

  if (error) return { error: toAppError(error, 'admin.saveSeoPage').message };

  bust();
  revalidatePath(`${ROUTES.adminPages}/${slug}`);
  return { notice: 'Pagina a fost salvată.' };
}

export async function setSeoPagePublishedAction(
  _previous: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const context = await getAccountContext();
  if (!context?.isStaff) return { error: NO_ACCESS };

  const slug = text(formData, 'slug');
  const published = text(formData, 'published') === 'true';

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_seo_page_published', {
    p_slug: slug,
    p_published: published,
  });

  if (error) return { error: toAppError(error, 'admin.publishSeoPage').message };

  bust();
  return { notice: published ? 'Pagina este publicată.' : 'Pagina a fost retrasă.' };
}

export async function setSeoPagesPublishedByTypeAction(
  _previous: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const context = await getAccountContext();
  if (!context?.isStaff) return { error: NO_ACCESS };

  const type = text(formData, 'type') as SeoPageType;
  const published = text(formData, 'published') === 'true';

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_seo_pages_published_by_type', {
    p_type: type,
    p_published: published,
  });

  if (error) return { error: toAppError(error, 'admin.publishSeoPagesByType').message };

  bust();
  // The count comes back so the screen can state what happened. "Gata" after
  // a bulk publish is how somebody ends up publishing forty-one of
  // forty-two and never finding out.
  const count = typeof data === 'number' ? data : 0;
  return {
    notice: published
      ? `${count} pagini publicate.`
      : `${count} pagini retrase.`,
  };
}
