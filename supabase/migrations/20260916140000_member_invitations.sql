-- =====================================================================
-- 0015 - Company membership by invitation
--
-- Until now a company manager could add any existing user to their company,
-- with any role including owner, without that user agreeing. Membership
-- now starts with an invitation the invited person accepts. The owner role is
-- never given by invitation or by editing a membership: the current owner
-- transfers it, and the transfer is audited.
-- =====================================================================

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- By e-mail: the person may not have an account yet.
  invited_email text not null check (invited_email = lower(trim(invited_email)) and invited_email like '%_@_%'),
  role public.company_member_role not null check (role <> 'owner'),
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

comment on table public.company_invitations is
  'The only way into a company other than creating it. Written only by the invitation RPCs; the owner role cannot be invited.';

create unique index company_invitations_one_pending
  on public.company_invitations (company_id, invited_email)
  where status = 'pending';
create index company_invitations_email_idx
  on public.company_invitations (invited_email)
  where status = 'pending';

alter table public.company_invitations enable row level security;
revoke insert, update, delete, truncate on public.company_invitations from anon, authenticated;

-- The caller's e-mail, confirmed. An unconfirmed address proves nothing.
create or replace function public.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
$fn$;

create policy "company_invitations_select" on public.company_invitations
  for select to authenticated
  using (
    public.is_company_manager(company_id)
    or invited_email = public.my_confirmed_email()
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------
-- One owner per company, and memberships no longer created directly
-- ---------------------------------------------------------------------
create unique index company_members_one_owner
  on public.company_members (company_id)
  where role = 'owner';

drop policy if exists "company_members_insert_manager" on public.company_members;

create or replace function public.guard_member_write()
returns trigger
language plpgsql
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id
       or new.user_id is distinct from old.user_id
       or new.invited_by is distinct from old.invited_by then
      raise exception 'Un membru nu poate fi mutat' using errcode = '42501';
    end if;
    if (old.role = 'owner') <> (new.role = 'owner') then
      raise exception 'Rolul de proprietar se schimbă doar prin transferul proprietății' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE
  if old.role = 'owner' then
    raise exception 'Proprietarul nu poate fi eliminat; transferă mai întâi proprietatea' using errcode = '42501';
  end if;
  return old;
end;
$fn$;

create trigger company_members_guard_write
  before update or delete on public.company_members
  for each row execute function public.guard_member_write();

create or replace function public.audit_member_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.write_audit('member.removed', 'company_members', old.company_id, to_jsonb(old), null);
    return old;
  end if;
  if new.role is distinct from old.role then
    perform public.write_audit('member.role_changed', 'company_members', new.company_id, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$fn$;

create trigger company_members_audit_changes
  after update or delete on public.company_members
  for each row execute function public.audit_member_changes();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.invite_company_member(
  p_company_id uuid,
  p_email text,
  p_role public.company_member_role
)
returns public.company_invitations
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_company public.companies;
  v_inv public.company_invitations;
begin
  if not public.is_company_manager(p_company_id) then
    raise exception 'Doar proprietarul sau administratorii firmei pot invita membri' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Rolul de proprietar nu se acordă prin invitație' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresă de e-mail invalidă' using errcode = '22023';
  end if;
  if exists (select 1 from public.company_members m
             join public.profiles p on p.id = m.user_id
             where m.company_id = p_company_id and lower(p.email) = v_email) then
    raise exception 'Persoana este deja membră a firmei' using errcode = '23505';
  end if;

  select * into v_company from public.companies where id = p_company_id;

  -- A new invitation to the same address replaces a pending one.
  update public.company_invitations
  set status = 'revoked', responded_at = now()
  where company_id = p_company_id and invited_email = v_email and status = 'pending';

  insert into public.company_invitations (company_id, invited_email, role, invited_by)
  values (p_company_id, v_email, p_role, auth.uid())
  returning * into v_inv;

  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  values (
    'email', 'company_invitation', p_company_id, v_email,
    jsonb_build_object(
      'company_name', coalesce(v_company.display_name, v_company.legal_name),
      'role', p_role,
      'invited_by', (select full_name from public.profiles where id = auth.uid()),
      'invitation_id', v_inv.id,
      'expires_at', v_inv.expires_at),
    'invitation:' || v_inv.id
  );

  perform public.write_audit('member.invited', 'company_invitations', v_inv.id, null, to_jsonb(v_inv));
  return v_inv;
end;
$fn$;

create or replace function public.accept_company_invitation(p_invitation_id uuid)
returns public.company_members
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.company_invitations;
  v_member public.company_members;
begin
  select * into v_inv from public.company_invitations where id = p_invitation_id for update;

  if v_inv.id is null or v_inv.invited_email is distinct from public.my_confirmed_email() then
    raise exception 'Invitația nu există sau nu este pentru adresa ta confirmată' using errcode = '42501';
  end if;
  if (select account_type from public.profiles where id = auth.uid()) is distinct from 'company' then
    raise exception 'Un cont de persoană fizică nu poate deveni membru al unei firme' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Invitația nu mai este valabilă' using errcode = '55000';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Invitația a expirat' using errcode = '55000';
  end if;
  if exists (select 1 from public.company_members
             where company_id = v_inv.company_id and user_id = auth.uid()) then
    raise exception 'Ești deja membru al firmei' using errcode = '23505';
  end if;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_inv.company_id, auth.uid(), v_inv.role, v_inv.invited_by)
  returning * into v_member;

  update public.company_invitations
  set status = 'accepted', responded_at = now(), accepted_by = auth.uid()
  where id = v_inv.id;

  perform public.write_audit('member.joined', 'company_members', v_inv.company_id,
    to_jsonb(v_inv), to_jsonb(v_member));
  return v_member;
end;
$fn$;

create or replace function public.decline_company_invitation(p_invitation_id uuid)
returns public.company_invitations
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.company_invitations;
begin
  select * into v_inv from public.company_invitations where id = p_invitation_id for update;
  if v_inv.id is null or v_inv.invited_email is distinct from public.my_confirmed_email() then
    raise exception 'Invitația nu există sau nu este pentru adresa ta confirmată' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Invitația nu mai este valabilă' using errcode = '55000';
  end if;

  update public.company_invitations
  set status = 'declined', responded_at = now()
  where id = v_inv.id
  returning * into v_inv;
  return v_inv;
end;
$fn$;

create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns public.company_invitations
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.company_invitations;
  v_before jsonb;
begin
  select * into v_inv from public.company_invitations where id = p_invitation_id for update;
  if v_inv.id is null or not public.is_company_manager(v_inv.company_id) then
    raise exception 'Doar administratorii firmei pot retrage invitații' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Invitația nu mai este valabilă' using errcode = '55000';
  end if;

  v_before := to_jsonb(v_inv);
  update public.company_invitations
  set status = 'revoked', responded_at = now()
  where id = v_inv.id
  returning * into v_inv;

  perform public.write_audit('member.invitation_revoked', 'company_invitations', v_inv.id, v_before, to_jsonb(v_inv));
  return v_inv;
end;
$fn$;

-- The current owner hands the company to an existing member and stays on as
-- admin. Locks the company's memberships so two transfers cannot interleave.
create or replace function public.transfer_company_ownership(
  p_company_id uuid,
  p_new_owner_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_caller uuid := auth.uid();
begin
  perform 1 from public.company_members where company_id = p_company_id for update;

  if not exists (select 1 from public.company_members
                 where company_id = p_company_id and user_id = v_caller and role = 'owner') then
    raise exception 'Doar proprietarul poate transfera proprietatea' using errcode = '42501';
  end if;
  if p_new_owner_user_id = v_caller then
    raise exception 'Ești deja proprietarul' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_members
                 where company_id = p_company_id and user_id = p_new_owner_user_id) then
    raise exception 'Noul proprietar trebuie să fie deja membru al firmei' using errcode = '42501';
  end if;

  update public.company_members set role = 'admin'
  where company_id = p_company_id and user_id = v_caller;
  update public.company_members set role = 'owner'
  where company_id = p_company_id and user_id = p_new_owner_user_id;

  perform public.write_audit('company.ownership_transferred', 'companies', p_company_id,
    jsonb_build_object('owner', v_caller),
    jsonb_build_object('owner', p_new_owner_user_id),
    p_reason);
end;
$fn$;

-- Default privileges no longer grant EXECUTE (migration 0013): grant here.
grant execute on function public.my_confirmed_email() to authenticated;
grant execute on function public.invite_company_member(uuid, text, public.company_member_role) to authenticated;
grant execute on function public.accept_company_invitation(uuid) to authenticated;
grant execute on function public.decline_company_invitation(uuid) to authenticated;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;
grant execute on function public.transfer_company_ownership(uuid, uuid, text) to authenticated;
