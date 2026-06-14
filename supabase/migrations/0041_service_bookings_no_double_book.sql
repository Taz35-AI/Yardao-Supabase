-- 0041 — stop duplicate service bookings on the same bay + slot.
--
-- Root cause: the bay-clash check reads the on-screen list, which lags the DB
-- by a moment, so a fast double-save (or two devices) could both write to the
-- same bay+slot before either appeared. This adds a database-level guard that
-- no UI race can beat: two in-house, non-cancelled bookings can never share the
-- same (organization, date, start slot, bay).
--
-- RUN THIS ONCE in the Supabase SQL editor (the app never runs SQL for you).

-- 1) Clear existing duplicates first — a unique index can't be created while
--    duplicates exist. This keeps the OLDEST booking in each clashing group and
--    deletes the rest. To preview exactly what would be removed, run this first:
--      select organization_id, date, time_slot, service_bay, count(*)
--      from public.service_bookings
--      where is_external_provider = false and status <> 'cancelled'
--      group by 1,2,3,4 having count(*) > 1;
with ranked as (
  select id,
         row_number() over (
           partition by organization_id, date, time_slot, service_bay
           order by created_at asc, id asc
         ) as rn
  from public.service_bookings
  where is_external_provider = false
    and status <> 'cancelled'
)
delete from public.service_bookings
where id in (select id from ranked where rn > 1);

-- 2) The guard: no two in-house, non-cancelled bookings may start on the same
--    bay + slot + day. External garage bookings (no bay/slot) are excluded, and
--    cancelled jobs are excluded so a future soft-cancel won't trip it.
create unique index if not exists service_bookings_no_double_book
  on public.service_bookings (organization_id, date, time_slot, service_bay)
  where is_external_provider = false and status <> 'cancelled';
