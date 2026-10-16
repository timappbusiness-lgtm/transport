'use client';

import Link from 'next/link';
import { useId, useMemo, useState, useTransition } from 'react';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { importMementoAction, type MementoImportResult } from '@/app/cont/memento/actions';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { failureMessage } from '@/lib/uploads/use-upload-queue';
import { displayPlate, formatDay, MEMENTO_KIND_LABELS } from '@/lib/memento';
import { MEMENTO_CSV_EXAMPLE, parseMementoCsv, type CsvRow } from '@/lib/memento-csv';
import { cn } from '@/lib/utils';

const c = mementoCopy.import;

/**
 * A fleet from a spreadsheet.
 *
 * The file is read here, as it is chosen, and every line with a mistake
 * is named before anything is sent — the plate that is not one, the date
 * that does not exist, the plate written twice. A file with any mistake
 * imports nothing; the database checks the rows again and takes all of
 * them or none, so a half-imported fleet never needs untangling.
 */
export function MementoCsvImport({
  scope,
  maxRows,
  importRows = importMementoAction,
}: {
  scope: 'personal' | 'firma';
  maxRows: number;
  importRows?: (scope: 'personal' | 'firma', rows: readonly CsvRow[]) => Promise<MementoImportResult>;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<MementoImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const parsed = useMemo(() => (text.trim() === '' ? null : parseMementoCsv(text, maxRows)), [text, maxRows]);
  const example = `data:text/csv;charset=utf-8,${encodeURIComponent(MEMENTO_CSV_EXAMPLE)}`;

  async function chosen(file: File | undefined) {
    if (file === undefined) return;
    setResult(null);
    setText(await file.text());
  }

  function submit() {
    if (parsed === null || parsed.errors.length > 0 || parsed.rows.length === 0) return;
    const rows = parsed.rows;
    startTransition(async () => {
      try {
        const answer = await importRows(scope, rows);
        setResult(answer);
        if (answer.ok) setText('');
      } catch (error) {
        setResult({ ok: false, error: failureMessage(error).message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" data-memento-import>
      <p className="text-body text-muted">{c.columns}</p>
      <p className="text-small">
        <a href={example} download="memento-exemplu.csv" className="underline underline-offset-4">
          {c.example}
        </a>{' '}
        <span className="text-muted">· {c.exampleNote}</span>
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-file`} className="text-body font-medium">
          {c.file}
        </label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(event) => void chosen(event.target.files?.[0])}
          className="text-body"
          data-memento-csv-file
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-text`} className="text-body font-medium">
          {c.paste}
        </label>
        <textarea
          id={`${id}-text`}
          rows={6}
          value={text}
          onChange={(event) => {
            setResult(null);
            setText(event.target.value);
          }}
          spellCheck={false}
          className="w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 font-mono text-small"
          data-memento-csv-text
        />
      </div>

      {parsed !== null && parsed.errors.length > 0 ? (
        <div role="alert" className="rounded-input border border-danger/45 bg-danger/8 px-3.5 py-3" data-memento-csv-errors={parsed.errors.length}>
          <p className="text-body font-medium">{c.errorsTitle}</p>
          <ul className="mt-2 list-disc pl-5 text-small">
            {parsed.errors.map((error) => (
              <li key={`${error.line}-${error.message}`} data-memento-csv-error-line={error.line}>
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {parsed !== null && parsed.ignored.length > 0 ? (
        <p className="text-small text-muted">{c.ignored(parsed.ignored.join(', '))}</p>
      ) : null}

      {parsed !== null && parsed.errors.length === 0 && parsed.rows.length > 0 ? (
        <section className="rounded-card border border-border bg-surface" data-memento-csv-preview={parsed.rows.length}>
          <h2 className="border-b border-border px-4 py-3 text-body font-medium">
            {c.preview}: {c.read(parsed.rows.length)}
          </h2>
          <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto">
            {parsed.rows.map((row) => (
              <li key={row.line} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-small">
                <span className="font-mono font-medium">{displayPlate(row.plate)}</span>
                {[row.make, row.model].filter(Boolean).length > 0 ? (
                  <span className="text-muted">{[row.make, row.model].filter(Boolean).join(' ')}</span>
                ) : null}
                {Object.entries(row.dates).map(([kind, date]) => (
                  <span key={kind}>
                    {MEMENTO_KIND_LABELS[kind as keyof typeof MEMENTO_KIND_LABELS]} {formatDay(date ?? null)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result !== null && !result.ok ? <FormError>{result.error}</FormError> : null}
      {result !== null && result.ok ? (
        <FormNotice>
          <span data-memento-csv-done>{c.done(result.added ?? 0, result.updated ?? 0, result.dates ?? 0)}</span>{' '}
          <Link href={ROUTES.accountMemento} className="underline underline-offset-4">
            {c.backToList}
          </Link>
        </FormNotice>
      ) : null}

      <div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || parsed === null || parsed.errors.length > 0 || parsed.rows.length === 0}
          className={cn(buttonClasses('ink', 'md'))}
          data-memento-csv-submit
        >
          {pending ? c.submitting : c.submit(parsed?.rows.length ?? 0)}
        </button>
      </div>
    </div>
  );
}
