-- =====================================================================
-- 0017 - Pin search_path on every project function
--
-- A function without its own search_path resolves unqualified names through
-- the caller's, which a caller can change. Supabase's security advisor flags
-- it (function_search_path_mutable). The SECURITY DEFINER functions already
-- pin theirs; these are the invoker and trigger functions that did not.
-- Pinning search_path does not change current_user, which the protection
-- triggers rely on.
-- =====================================================================

alter function public.audit_log_guard() set search_path = public;
alter function public.distance_km(numeric, numeric, numeric, numeric) set search_path = public;
alter function public.guard_booking_user_write() set search_path = public;
alter function public.guard_company_write() set search_path = public;
alter function public.guard_document_insert() set search_path = public;
alter function public.guard_driver_write() set search_path = public;
alter function public.guard_member_write() set search_path = public;
alter function public.guard_message_insert() set search_path = public;
alter function public.guard_offer_user_insert() set search_path = public;
alter function public.guard_profile_write() set search_path = public;
alter function public.guard_vehicle_write() set search_path = public;
alter function public.safe_uuid(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;
