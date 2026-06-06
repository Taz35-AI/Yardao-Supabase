-- ============================================================================
-- 0028_zao_yard_list.sql — give Zao a "list the yard" tool.
-- fleet_summary returns counts only (no registrations), so questions like
-- "what's in the yard" / "which one?" couldn't name a vehicle. This returns the
-- actual checked-in vehicles WITH their reg plates, status and location.
-- Org-scoped (SECURITY DEFINER + explicit auth_org_id filter). Idempotent.
-- ============================================================================
create or replace function public.zao_yard_vehicles(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select registration, make, model, colour, size, status, hire_status,
             transfer_status, external_garage_name, branch_id, bay,
             insurance_status, mot_expiry, tax_expiry
      from checked_in_vehicles
      where organization_id = v_org
      order by registration
      limit lim
    ) t
  );
end;
$$;

grant execute on function public.zao_yard_vehicles(int) to authenticated;
