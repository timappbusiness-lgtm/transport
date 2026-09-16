-- =====================================================================
-- 0013 - Phase 0 hardening: v_departures and function privileges
--
--   P14  v_departures shows active departures only, public columns only,
--        and nothing to anon
--   P7   no function is executable by an API role unless it is meant to be
--
-- Kept last among the hardening migrations so the grants below cover every
-- function the earlier ones created.
-- =====================================================================

-- ---------------------------------------------------------------------
-- P14 - v_departures
--
-- Runs as its owner on purpose: seat counts must include other people's
-- bookings, which departure_bookings RLS hides from the caller. So the view
-- filters itself: active departures only, no internal columns. A reservation
-- stops counting the moment it lapses, before the cleanup job marks it.
-- ---------------------------------------------------------------------
drop view if exists public.v_departures;

create view public.v_departures as
select
  t.id as truck_listing_id,
  t.company_id,
  t.direction,
  t.from_country, t.from_county, t.from_city,
  t.to_country, t.to_county, t.to_city,
  t.waypoints,
  t.available_from,
  t.available_to,
  t.service_types,
  t.platform_slots_total,
  coalesce(b.taken, 0)::integer as slots_taken,
  greatest(coalesce(t.platform_slots_total, 0) - coalesce(b.taken, 0), 0)::integer as slots_free
from public.truck_listings t
left join lateral (
  select sum(bb.slots) as taken
  from public.departure_bookings bb
  where bb.truck_listing_id = t.id
    and (bb.status = 'confirmed' or (bb.status = 'reserved' and bb.expires_at > now()))
) b on true
where t.status = 'active';

revoke all on public.v_departures from public, anon;
grant select on public.v_departures to authenticated;

-- ---------------------------------------------------------------------
-- P7 - function privileges
--
-- Start from nothing: revoke EXECUTE on every function this project owns in
-- public (extension functions such as pgcrypto and pg_trgm are left alone),
-- then grant back exactly what each role calls.
--
-- Functions used inside RLS policies must stay executable by the roles those
-- policies apply to - a policy expression runs with the caller's privileges.
-- Trigger functions need no grant: EXECUTE is checked when a trigger is
-- created, not when it fires.
-- ---------------------------------------------------------------------
do $grants$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end
$grants$;

-- Policy helpers. anon's policies (plans, price_benchmarks) only need
-- is_platform_admin().
grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_manager(uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.is_transport_party(uuid) to authenticated;
grant execute on function public.can_see_cargo_listing(uuid) to authenticated;
grant execute on function public.can_edit_cargo_listing(uuid) to authenticated;
grant execute on function public.safe_uuid(text) to authenticated;

-- Pure helpers.
grant execute on function public.distance_km(numeric, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.current_plan(uuid) to authenticated;

-- User RPCs. Each checks who is calling.
grant execute on function public.create_company(text, text, public.company_type, text, text, text, text) to authenticated;
grant execute on function public.review_document(uuid, boolean, date, text) to authenticated;
grant execute on function public.reveal_contact(uuid, uuid) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
grant execute on function public.withdraw_offer(uuid) to authenticated;
grant execute on function public.reject_offer(uuid) to authenticated;
grant execute on function public.confirm_departure_booking(uuid, numeric) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.set_platform_staff(uuid, public.staff_role, text) to authenticated, service_role;

-- Jobs: pg_cron runs them as the owner; the compliance-sweep edge function
-- and n8n call them with the service role.
grant execute on function public.run_compliance_sweep() to service_role;
grant execute on function public.queue_expiry_reminders() to service_role;
grant execute on function public.expire_stale_listings() to service_role;
grant execute on function public.purge_audit_log(interval) to service_role;

-- Functions created from now on by this role start with no EXECUTE for
-- anyone. PostgreSQL grants EXECUTE to PUBLIC globally by default, and a
-- per-schema rule cannot take that away, hence the global revoke. Every new
-- function has to be granted explicitly, in the migration that creates it.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated, service_role;
