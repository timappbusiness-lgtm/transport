'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { saveSeoPageAction, type PageActionState } from '@/app/admin/pagini/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { seoCopy } from '@/content/transport-auto';
import type { FaqItem, SeoPage } from '@/lib/seo-pages';

const EMPTY: PageActionState = {};
const MAX_FAQ = 8;

/**
 * Editing the words of one landing page.
 *
 * Only the words. Nothing on this form sets a number, because no number on
 * a landing page comes from this table — the price, the distance and the
 * counts are read live at render time from whatever owns them.
 *
 * The heading is two boxes rather than one with markup in it: a heading
 * that has to be parsed is a heading somebody eventually breaks with an
 * unclosed tag.
 */
export function SeoPageForm({ page }: { page: SeoPage }) {
  const [state, action] = useActionState(saveSeoPageAction, EMPTY);
  const [faq, setFaq] = useState<FaqItem[]>(
    page.faq.length > 0 ? page.faq : [{ q: '', a: '' }],
  );

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="slug" value={page.slug} />

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <Field
        label="Titlu în rezultatele căutării"
        name="title"
        defaultValue={page.title}
        hint="Între 10 și 70 de caractere. Este ce se vede în Google."
        error={state.fieldErrors?.title}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Titlu pe pagină"
          name="h1"
          defaultValue={page.h1}
          hint="Partea scrisă cu negru."
          error={state.fieldErrors?.h1}
        />
        <Field
          label="Continuarea titlului"
          name="h1Soft"
          required={false}
          defaultValue={page.h1Soft ?? ''}
          hint="Partea gri, de exemplu „cu firme verificate”."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="field-intro" className="text-sm font-medium">
          Introducere
        </label>
        <textarea
          id="field-intro"
          name="intro"
          rows={4}
          defaultValue={page.intro}
          className="w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
        />
        <p className="text-xs text-muted">
          Două sau trei propoziții despre această rută. Fără cifre: distanța,
          durata și prețul se citesc live și apar singure mai jos pe pagină.
        </p>
        <FormError>{state.fieldErrors?.intro}</FormError>
      </div>

      <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
        <legend className="mb-1 text-sm font-medium">{seoCopy.faq.title}</legend>
        <p className="text-xs text-muted">
          Între trei și cinci întrebări. Apar și ca date structurate, deci o
          întrebare fără răspuns nu se poate salva.
        </p>
        <FormError>{state.fieldErrors?.faq}</FormError>

        {faq.map((item, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-card border border-border p-4">
            <Field
              label={`Întrebarea ${index + 1}`}
              name="faqQuestion"
              required={false}
              defaultValue={item.q}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor={`faq-a-${index}`}>
                Răspuns
              </label>
              <textarea
                id={`faq-a-${index}`}
                name="faqAnswer"
                rows={3}
                defaultValue={item.a}
                className="w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
              />
            </div>
            <button
              type="button"
              onClick={() => setFaq((current) => current.filter((_, i) => i !== index))}
              className="self-start text-small text-muted underline underline-offset-4 hover:text-foreground"
            >
              Șterge întrebarea
            </button>
          </div>
        ))}

        {faq.length < MAX_FAQ ? (
          <button
            type="button"
            onClick={() => setFaq((current) => [...current, { q: '', a: '' }])}
            className={`${buttonClasses('secondary', 'sm')} self-start`}
          >
            Adaugă o întrebare
          </button>
        ) : null}
      </fieldset>

      <SubmitButton className="sm:w-auto sm:px-8 sm:self-start">Salvează</SubmitButton>
    </form>
  );
}
