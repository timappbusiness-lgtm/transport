-- =====================================================================
-- 0008 - Platform taxonomy for vehicle transport
--
-- Separate migration on purpose: Postgres refuses to USE an enum value
-- added by ALTER TYPE ... ADD VALUE inside the same transaction that
-- added it. Migration 0009 references these, so they have to land first.
-- =====================================================================

alter type vehicle_type add value if not exists 'platforma_auto';         -- open car carrier, 7-9 slots
alter type vehicle_type add value if not exists 'platforma_auto_inchisa'; -- enclosed carrier, classics and supercars
alter type vehicle_type add value if not exists 'troliu';                 -- winch / recovery, for vehicles that do not roll
