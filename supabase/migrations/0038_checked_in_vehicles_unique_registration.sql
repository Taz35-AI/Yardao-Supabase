-- ============================================================================
-- 0038: one yard row per vehicle, enforced by the DATABASE
--
-- The garage-return / check-in code paths historically could insert a second
-- checked_in_vehicles row for a registration that was already in the yard
-- (error-swallowed lookups, double-submits). The app-side holes are fixed in
-- code, but this index makes the entire bug class IMPOSSIBLE: any insert of a
-- duplicate registration (per organization, space/case-insensitive) is
-- rejected by Postgres with a visible error instead of silently creating a
-- ghost vehicle.
--
-- ⚠ PREREQUISITE: zero existing duplicates, or CREATE INDEX fails.
--    Check first — must return no rows:
--
--    select organization_id,
--           regexp_replace(upper(registration), '\s', '', 'g') as reg,
--           count(*)
--    from public.checked_in_vehicles
--    group by 1, 2
--    having count(*) > 1;
--
--    (11 Jun 2026: the two known duplicates — LC24WDU + VK25MVR, both
--    migrated Firebase-era artifacts — were deleted by hand before this.)
-- ============================================================================

create unique index if not exists civ_org_reg_unique
  on public.checked_in_vehicles
  (organization_id, regexp_replace(upper(registration), '\s', '', 'g'));
