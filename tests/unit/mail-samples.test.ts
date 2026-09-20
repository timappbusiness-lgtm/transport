import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAIL_SAMPLE_PAYLOAD, MAIL_TEMPLATES, mailTemplateLabel } from '@/content/mail-samples';
import { providerStatusFrom } from '@/lib/notifications-admin-source';

/**
 * The templates live in the edge function and the test-send list lives in
 * the app, because the two are separate deployment units and neither can
 * import the other. This is what keeps them from drifting: the template
 * file is read as text, and the two lists are compared.
 */

const TEMPLATE_FILE = 'supabase/functions/outbox-dispatcher/templates.ts';
const source = readFileSync(TEMPLATE_FILE, 'utf8');

/** The keys of the TEMPLATES object: a line like `  company_verified: {`. */
function templateNames(text: string): string[] {
  return [...text.matchAll(/^ {2}([a-z][a-z0-9_]*): \{$/gm)].map((m) => m[1]!);
}

/** Every `{{ name }}` the file mentions, anywhere. */
function variableNames(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!))];
}

describe('the test-send list against the templates that exist', () => {
  it('finds the templates in the edge function', () => {
    expect(templateNames(source).length).toBeGreaterThan(15);
  });

  it('offers every template the dispatcher can render', () => {
    const inFunction = templateNames(source).sort();
    const inApp = MAIL_TEMPLATES.map((t) => t.id).sort();
    expect(inApp).toEqual(inFunction);
  });

  it('gives every one of them a Romanian label, not its id', () => {
    for (const template of MAIL_TEMPLATES) {
      expect(template.label).not.toBe(template.id);
      expect(template.label).not.toMatch(/_/);
      expect(template.label.trim().length).toBeGreaterThan(3);
    }
  });

  it('carries a value for every variable any template uses', () => {
    const needed = variableNames(source).filter((v) => v !== 'site_url');
    const missing = needed.filter((v) => MAIL_SAMPLE_PAYLOAD[v] === undefined);
    expect(missing).toEqual([]);
  });

  it('has no sample value nothing uses', () => {
    const used = new Set(variableNames(source));
    const unused = Object.keys(MAIL_SAMPLE_PAYLOAD).filter((k) => !used.has(k));
    expect(unused).toEqual([]);
  });

  it('says plainly that the values are examples', () => {
    expect(MAIL_SAMPLE_PAYLOAD.company_name).toMatch(/exemplu/i);
  });

  it('falls back to the id when the label is unknown', () => {
    expect(mailTemplateLabel('nu_exista')).toBe('nu_exista');
    expect(mailTemplateLabel('company_verified')).toBe('Firmă verificată');
  });
});

describe('what the screen says about the provider', () => {
  const run = (workflow: string, details: Record<string, unknown> | null, ran_at = '2026-09-20T10:00:00Z') => ({
    id: workflow + ran_at,
    ran_at,
    workflow,
    processed: 0,
    failed: 0,
    details,
  });

  it('says nothing is known before the dispatcher has ever run', () => {
    expect(providerStatusFrom([])).toEqual({
      configured: 'necunoscut',
      missing: null,
      reportedAt: null,
    });
  });

  it('reads a missing variable out of the last run', () => {
    const status = providerStatusFrom([run('outbox-dispatcher', { missing: 'RESEND_API_KEY' })]);
    expect(status.configured).toBe('nu');
    expect(status.missing).toBe('RESEND_API_KEY');
  });

  it('calls it configured when the last run complained about nothing', () => {
    const status = providerStatusFrom([run('outbox-dispatcher', { reasons: {} })]);
    expect(status.configured).toBe('da');
    expect(status.missing).toBeNull();
  });

  it('lets a newer clean run clear an older complaint', () => {
    // The rows arrive newest first, as the query orders them.
    const status = providerStatusFrom([
      run('outbox-dispatcher', {}, '2026-09-20T12:00:00Z'),
      run('outbox-dispatcher', { missing: 'MAIL_FROM' }, '2026-09-20T09:00:00Z'),
    ]);
    expect(status.configured).toBe('da');
  });

  it('ignores other jobs entirely', () => {
    const status = providerStatusFrom([
      run('nightly-retention', { missing: 'ceva' }),
      run('outbox-dispatcher', {}),
    ]);
    expect(status.configured).toBe('da');
  });

  it('treats a details blob with no missing key as no complaint', () => {
    expect(providerStatusFrom([run('outbox-dispatcher', null)]).configured).toBe('da');
  });
});
