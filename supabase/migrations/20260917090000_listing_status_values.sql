-- =====================================================================
-- 0021 - Listing statuses from the product spec
--
-- Ported from pull request #6 (Edi). Renumbered to apply after
-- 20260916150000_create_order.sql; otherwise unchanged.
--
-- Full list: draft, active, offers_received, carrier_selected, in_progress,
-- delivered, cancelled, expired, suspended, disputed. `assigned` and
-- `completed` stay in the enum (Postgres cannot drop an enum value) and are
-- replaced in use by `carrier_selected` and `delivered` in phase 2.
--
-- Its own file: a value added by ALTER TYPE cannot be used in the
-- transaction that added it, and the next migration uses these.
-- =====================================================================

alter type public.listing_status add value if not exists 'offers_received' after 'active';
alter type public.listing_status add value if not exists 'carrier_selected' after 'offers_received';
alter type public.listing_status add value if not exists 'in_progress' after 'carrier_selected';
alter type public.listing_status add value if not exists 'delivered' after 'in_progress';
alter type public.listing_status add value if not exists 'disputed';
