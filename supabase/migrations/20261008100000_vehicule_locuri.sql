-- =====================================================================
-- Vehicles: how many cars fit
--
-- The shortened carrier journey asks three things about a vehicle: its
-- plate, its type, and how many cars go up on it. The third had nowhere
-- to live: `platform_slots_total` is on each departure, typed again for
-- every route. It is kept here too, once, and the route form offers it.
--
-- Nothing is required and no rule changes: the column is nullable, a
-- departure still carries its own number, and the capacity guard on
-- bookings (`guard_departure_capacity`) still reads the departure's.
-- The check only refuses a number no car transporter has.
--
-- No function, no policy, no grant: the column is covered by the
-- vehicles table's existing policies, like every other specification.
-- =====================================================================

alter table public.vehicles
  add column platform_slots smallint
    constraint vehicles_platform_slots_ck check (platform_slots is null or platform_slots between 1 and 15);

comment on column public.vehicles.platform_slots is
  'How many cars fit on the vehicle, as the carrier declared it at sign-up. Offered as the default for a departure''s platform_slots_total; the departure keeps its own number.';
