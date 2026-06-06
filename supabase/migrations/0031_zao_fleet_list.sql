-- ============================================================================
-- 0031_zao_fleet_list.sql — give Zao a "list the fleet" tool.
-- It could COUNT the fleet (fleet_summary) but had no tool to LIST it — only
-- yard_vehicles (the yard). So "list the fleet" / "list them" after a fleet
-- question had nothing to call. This lists the active fleet (not defleeted) with
-- registrations + key fields. Org-scoped. Idempotent.
-- ============================================================================
create or replace function public.zao_fleet_vehicles(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select registration, make, model, colour, size, current_status,
             mot_expiry, tax_expiry, insurance_status, contract
      from vehicles
      where organization_id = v_org and coalesce(is_defleeted, false) = false
      order by registration
      limit lim
    ) t
  );
end;
$$;

grant execute on function public.zao_fleet_vehicles(int) to authenticated;
