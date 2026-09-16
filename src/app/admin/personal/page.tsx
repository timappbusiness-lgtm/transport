import { Card, PageHeader } from '@/components/app/badge';
import { GrantStaffForm, RevokeStaffForm } from '@/components/app/admin-forms';
import { requireStaff } from '@/lib/auth';
import { formatDateRo } from '@/lib/format';

export default async function Page() {
  const { supabase, userId } = await requireStaff();
  const { data: staff } = await supabase
    .from('platform_staff')
    .select('user_id, role, created_at, profiles!platform_staff_user_id_fkey (full_name, email)')
    .order('created_at');

  return (
    <>
      <PageHeader title="Personal" description="Cine poate aproba documente și administra platforma. Fiecare schimbare este înregistrată." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-bold">Acces de administrare</h2>
          <ul className="divide-y divide-border">
            {(staff ?? []).map((s) => (
              <li key={s.user_id} className="grid gap-2 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{s.profiles?.full_name || s.profiles?.email}</span>
                    <span className="block break-all text-xs text-muted">{s.profiles?.email}</span>
                  </span>
                  <span className="text-xs text-muted">din {formatDateRo(s.created_at)}</span>
                </div>
                {s.user_id !== userId ? <RevokeStaffForm userId={s.user_id} /> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">Acordă acces</h2>
          <GrantStaffForm />
        </Card>
      </div>
    </>
  );
}
