-- =====================================================================
-- 0034 - The order lifecycle, as enum values
--
-- `transport_status` has existed since phase 0 with eight values, chosen
-- before the lifecycle in the product spec was written:
--
--   agreed, loading, in_transit, delivered, invoiced, closed, disputed,
--   cancelled
--
-- The lifecycle this phase implements has seven steps:
--
--   order_confirmed -> pickup_scheduled -> vehicle_picked_up ->
--   in_transit -> delivery_scheduled -> vehicle_delivered ->
--   order_completed
--
-- with `cancelled` and `disputed` beside it. Four of the old values mean
-- four of the new steps under different names, and Postgres cannot drop
-- an enum value, so this was a real choice: reuse the four, or spell the
-- lifecycle out in full and leave the old names behind.
--
-- Spelling it out is what was decided. The cost is four synonyms that
-- stay in the type for ever; the gain is that the status in the database
-- reads the same as the status in the spec, in the RPC and on the
-- screen, and nobody has to remember that `agreed` means confirmed or
-- that `closed` means completed. The legacy values are migrated in the
-- next file and nothing writes them afterwards.
--
-- `in_transit` is the one step that already had the right name, so six
-- values are added rather than seven.
--
-- **Its own file**, following 20260917090000: a value added by ALTER
-- TYPE cannot be used in the transaction that added it, and the next
-- migration both updates rows to these values and writes them into
-- function bodies.
--
-- The `after` clauses put the lifecycle in reading order, so `order by
-- status` sorts a list of orders the way somebody would expect. The two
-- legacy values that fall inside the run — `loading` and the old
-- `delivered` — sort where they always did; nothing writes them, so no
-- list is affected.
-- =====================================================================

alter type public.transport_status add value if not exists 'order_confirmed' after 'agreed';
alter type public.transport_status add value if not exists 'pickup_scheduled' after 'order_confirmed';
alter type public.transport_status add value if not exists 'vehicle_picked_up' after 'pickup_scheduled';
alter type public.transport_status add value if not exists 'delivery_scheduled' after 'in_transit';
alter type public.transport_status add value if not exists 'vehicle_delivered' after 'delivery_scheduled';
alter type public.transport_status add value if not exists 'order_completed' after 'vehicle_delivered';
