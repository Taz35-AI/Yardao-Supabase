-- 0059_vehicle_suppliers_setting.sql  (Settings — vehicle suppliers list)
-- ============================================================================
-- Vehicle suppliers (leasing companies / dealers) are a SEPARATE list from the
-- parts/stock suppliers (organization_settings.suppliers). Stored as a jsonb
-- string array, mirroring the other settings blobs. The fleet Add/Edit vehicle
-- forms read this to populate the Supplier dropdown. Additive + re-runnable.
-- ============================================================================

alter table public.organization_settings
  add column if not exists vehicle_suppliers jsonb not null default '[]'::jsonb;
