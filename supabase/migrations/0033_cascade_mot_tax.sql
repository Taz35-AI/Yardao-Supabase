-- ============================================================================
-- YARDAO → Supabase  |  0033_cascade_mot_tax.sql
-- "Fleet page is the bible" for MOT & road-tax expiry.
--
-- Whenever a fleet vehicle's mot_expiry or tax_expiry changes — by ANY path:
--   * single-vehicle edit (useFleetActions)
--   * bulk road-tax update (bulkRoadTaxService)
--   * server-side DVLA bulk refresh (bulkRefreshVehicleData edge function)
--   * future / manual / SQL writes
-- the matching checked-in (yard) rows are updated to match, so staff never have
-- to re-run the same check from the Yard page.
--
-- Match is ID-FIRST on the stable foreign key (checked_in_vehicles.vehicle_id =
-- vehicles.id); this survives registration / private-plate changes. The inner
-- IS DISTINCT guard avoids no-op writes (and the realtime/updated_at churn they
-- would cause).
--
-- SECURITY DEFINER so the cascade runs regardless of which role performed the
-- originating UPDATE (user session, service_role edge function, etc.).
-- ============================================================================

create or replace function public.cascade_vehicle_mot_tax()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.mot_expiry is distinct from old.mot_expiry)
     or (new.tax_expiry is distinct from old.tax_expiry) then
    update public.checked_in_vehicles civ
       set mot_expiry = new.mot_expiry,
           tax_expiry = new.tax_expiry
     where civ.organization_id = new.organization_id
       and civ.vehicle_id = new.id
       and (civ.mot_expiry is distinct from new.mot_expiry
            or civ.tax_expiry is distinct from new.tax_expiry);
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_cascade_mot_tax on public.vehicles;

create trigger vehicles_cascade_mot_tax
  after update of mot_expiry, tax_expiry on public.vehicles
  for each row
  execute function public.cascade_vehicle_mot_tax();
