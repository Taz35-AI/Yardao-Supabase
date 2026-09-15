-- 0072_supplier_cost_access.sql  (Reports — who may see supplier rental costs)
-- ============================================================================
-- Supplier rental costs (vehicle_rental_rates) are no longer visible to EVERY
-- admin: only the org owner plus the admins the owner picks in Settings.
-- Mirrors the Hire access model (migration 0050):
--   • The allow-list lives in organization_settings.supplier_cost_access_user_ids
--     (jsonb array of profile uids). Owner = organizations.created_by.
--   • can_access_supplier_costs() is the single predicate, used by RLS here and
--     by the UI gate (useSupplierCostAccess). RLS is the real enforcement.
-- Additive + re-runnable.
-- ============================================================================

alter table public.organization_settings
  add column if not exists supplier_cost_access_user_ids jsonb not null default '[]'::jsonb;

create or replace function public.can_access_supplier_costs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (                                   -- org owner always has access
      select 1 from public.organizations o
      where o.id = public.auth_org_id()
        and o.created_by = auth.uid()
    )
    or exists (                                -- uid is on the allow-list
      select 1 from public.organization_settings s
      where s.organization_id = public.auth_org_id()
        and coalesce(s.supplier_cost_access_user_ids, '[]'::jsonb) ? auth.uid()::text
    )
$$;
grant execute on function public.can_access_supplier_costs() to authenticated;

-- Replace the "any admin" policy from 0071 with the allow-list predicate.
drop policy if exists vehicle_rental_rates_admin_rw on public.vehicle_rental_rates;
drop policy if exists vehicle_rental_rates_access_rw on public.vehicle_rental_rates;
create policy vehicle_rental_rates_access_rw on public.vehicle_rental_rates
  for all to authenticated
  using      (organization_id = public.auth_org_id() and public.can_access_supplier_costs())
  with check (organization_id = public.auth_org_id() and public.can_access_supplier_costs());
