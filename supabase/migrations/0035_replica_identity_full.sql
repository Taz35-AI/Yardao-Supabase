-- ============================================================================
-- YARDAO → Supabase  |  0035_replica_identity_full.sql
-- ----------------------------------------------------------------------------
-- Realtime DELETE fix (leg 3 of robust sync).
--
-- By default a table's REPLICA IDENTITY is its primary key, so DELETE (and the
-- "old" half of UPDATE) realtime events carry ONLY the primary key — not the
-- other columns. Our realtime subscriptions filter on `organization_id=eq.<org>`
-- (and some on user_id), and that filter can't match a delete whose payload has
-- no organization_id. Result: deletes were silently dropped and the UI lagged
-- until a manual refresh (e.g. a defleeted vehicle lingering in the yard).
--
-- REPLICA IDENTITY FULL makes Postgres include the FULL old row in the WAL for
-- updates/deletes, so the filter matches and deletes propagate live. This is the
-- approach documented by Supabase for receiving old-record data / filtered
-- delete events.
--
-- Cost/safety: no data, schema, or query change; metadata-only (instant, no
-- table rewrite); reversible with `replica identity default`. The only overhead
-- is marginally larger WAL on update/delete — negligible at this app's scale.
--
-- Applied to every table that has an org/user-filtered realtime subscription
-- where rows can be deleted.
-- ============================================================================

alter table public.checked_in_vehicles replica identity full;
alter table public.vehicles            replica identity full;
alter table public.service_bookings    replica identity full;
alter table public.customers           replica identity full;
alter table public.deliveries_defleet  replica identity full;
alter table public.branches            replica identity full;
alter table public.yard_layouts        replica identity full;
alter table public.user_notes          replica identity full;
alter table public.user_notifications  replica identity full;
