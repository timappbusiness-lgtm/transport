import { notFound } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { auditCsv, auditCsvName } from '@/lib/audit';
import { loadAuditForExport } from '@/lib/audit-source';
import { getAccountContext } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

function one(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function uuid(value: string | null): string | null {
  if (value === null) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isoDay(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * The filtered range as a CSV.
 *
 * Checked twice on purpose: a 404 here for a non-staff caller, and
 * `audit_entries` refusing them in the database. A route handler is not
 * under the admin layout, so it does not inherit its guard — this is the
 * kind of hole a file-based router opens quietly.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const context = await getAccountContext();
  if (!context?.isStaff) notFound();

  const params = request.nextUrl.searchParams;
  const entries = await loadAuditForExport({
    actor: uuid(one(params, 'autor')),
    action: one(params, 'actiune'),
    entity: one(params, 'entitate'),
    from: isoDay(one(params, 'de-la')),
    to: isoDay(one(params, 'pana-la')),
  });

  const name = auditCsvName(new Date());
  return new Response(auditCsv(entries), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      // Somebody else's audit log must never sit in a shared cache.
      'cache-control': 'private, no-store',
    },
  });
}
