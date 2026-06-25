-- 0050_hire_access_control.sql  (Hire Management — access control)
-- ============================================================================
-- Restrict the Hire section to the org OWNER + a chosen allow-list of users.
--   • The allow-list lives in organization_settings.hire_settings -> 'accessUserIds'
--     (a jsonb array of profile uids === auth.uid()). Owner = organizations.created_by.
--   • can_access_hire() is the predicate; every rental_* table's RLS now requires
--     org match AND can_access_hire(), so non-granted members cannot read/write
--     hire data even via the raw API (defence in depth — not just UI hiding).
--   • Staff still need the "who is this vehicle on hire with?" chip on the yard,
--     so hire_customer_names_for_lines() is a SECURITY DEFINER function that
--     returns ONLY lineId -> customer_name for the caller's org (no other hire
--     data leaks). It is callable by any authenticated org member.
--
-- RE-RUNNABLE: drop policy if exists + create or replace function.
-- Reversible via teardown_hire_management.sql (drops the tables/functions).
-- ============================================================================

-- ── Access predicate ────────────────────────────────────────────────────────
create or replace function public.can_access_hire()
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
        and coalesce(s.hire_settings -> 'accessUserIds', '[]'::jsonb) ? auth.uid()::text
    )
$$;
grant execute on function public.can_access_hire() to authenticated;

-- ── Minimal customer-name lookup for the yard chip (staff-safe) ──────────────
-- SECURITY DEFINER: bypasses the locked rental_* RLS but only ever returns
-- line_id + customer_name, scoped to the caller's own organization.
create or replace function public.hire_customer_names_for_lines(line_ids uuid[])
returns table(line_id uuid, customer_name text)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, a.customer_name
  from public.rental_agreement_vehicles l
  join public.rental_agreements a on a.id = l.agreement_id
  where l.organization_id = public.auth_org_id()
    and l.id = any(line_ids)
$$;
grant execute on function public.hire_customer_names_for_lines(uuid[]) to authenticated;

-- ── Lock every rental_* table to owner + allow-list ─────────────────────────
drop policy if exists rental_customers_org_rw on public.rental_customers;
drop policy if exists rental_customers_hire_rw on public.rental_customers;
create policy rental_customers_hire_rw on public.rental_customers
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.can_access_hire())
  with check (organization_id = public.auth_org_id() and public.can_access_hire());

drop policy if exists rental_customer_documents_org_rw on public.rental_customer_documents;
drop policy if exists rental_customer_documents_hire_rw on public.rental_customer_documents;
create policy rental_customer_documents_hire_rw on public.rental_customer_documents
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.can_access_hire())
  with check (organization_id = public.auth_org_id() and public.can_access_hire());

drop policy if exists rental_agreements_org_rw on public.rental_agreements;
drop policy if exists rental_agreements_hire_rw on public.rental_agreements;
create policy rental_agreements_hire_rw on public.rental_agreements
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.can_access_hire())
  with check (organization_id = public.auth_org_id() and public.can_access_hire());

drop policy if exists rental_agreement_vehicles_org_rw on public.rental_agreement_vehicles;
drop policy if exists rental_agreement_vehicles_hire_rw on public.rental_agreement_vehicles;
create policy rental_agreement_vehicles_hire_rw on public.rental_agreement_vehicles
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.can_access_hire())
  with check (organization_id = public.auth_org_id() and public.can_access_hire());

drop policy if exists rental_swaps_org_rw on public.rental_swaps;
drop policy if exists rental_swaps_hire_rw on public.rental_swaps;
create policy rental_swaps_hire_rw on public.rental_swaps
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.can_access_hire())
  with check (organization_id = public.auth_org_id() and public.can_access_hire());

drop policy if exists rental_credits_org_rw on public.rental_credits;
drop policy if exists rental_credits_hire_rw on public.rental_credits;
create policy rental_credits_hire_rw on public.rental_credits
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.can_access_hire())
  with check (organization_id = public.auth_org_id() and public.can_access_hire());
