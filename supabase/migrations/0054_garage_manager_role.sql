-- 0054_garage_manager_role.sql  (Access control — Admin & Garage Manager)
-- ============================================================================
-- Introduces a new app role 'garage_manager' ("Admin & Garage Manager"): an
-- admin PLUS the authority to write money/schedule (invoices, bookings, stock).
-- Regular admins keep operational actions but lose those write rights.
--
-- The org OWNER (organizations.created_by) is always fully privileged.
--
-- Enforcement layers:
--   • Invoices        → RLS here (org can READ; only owner/manager can WRITE).
--   • Bookings/stock  → gated in the app (operational vs structural edits share
--                       the same rows, so they can't be split by simple RLS).
--   • Role escalation → a trigger stops a non-owner/non-manager from granting
--                       the garage_manager role (which would bypass the invoice
--                       lock). Owner + existing garage managers may grant it.
--
-- Re-runnable: drop-if-exists before each create; additive constraint swap.
-- NOTE: role lives in the JWT (custom_access_token_hook), so a promoted/demoted
-- user must re-login before the DB-level invoice lock reflects their new role.
-- ============================================================================

-- 1) Allow the new role value on profiles. Drop whatever check constraint
--    currently governs `role` (its auto-generated name may vary), then re-add.
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'profiles'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin','member','mechanic','garage_manager'));

-- 2) Owner helper: is the current user the creator of their own org?
create or replace function public.auth_is_org_owner()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.organizations o
    where o.id = public.auth_org_id() and o.created_by = auth.uid()
  )
$$;

-- Money-write helper: owner or garage_manager.
create or replace function public.auth_can_write_money()
returns boolean language sql stable as $$
  select public.auth_is_org_owner() or public.auth_role() = 'garage_manager'
$$;

-- 3) Invoices: replace the generic full-CRUD policy with read/write split.
drop policy if exists invoices_org_rw on public.invoices;
drop policy if exists invoices_read   on public.invoices;
drop policy if exists invoices_write  on public.invoices;

create policy invoices_read on public.invoices
  for select to authenticated
  using (organization_id = public.auth_org_id());

create policy invoices_write on public.invoices
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.auth_can_write_money())
  with check (organization_id = public.auth_org_id() and public.auth_can_write_money());

-- 4) Keep the garage_manager a superset of admin where admin had rights.
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_role() in ('admin','garage_manager'))
  with check (id = public.auth_org_id() and public.auth_role() in ('admin','garage_manager'));

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.auth_role() in ('admin','garage_manager'))
  with check (organization_id = public.auth_org_id() and public.auth_role() in ('admin','garage_manager'));

-- 5) Escalation guard: only owner / garage_manager may grant garage_manager.
--    Service/bootstrap contexts (auth_role() null) are unaffected.
create or replace function public.guard_garage_manager_grant()
returns trigger language plpgsql security definer as $$
begin
  if new.role = 'garage_manager'
     and (tg_op = 'INSERT' or old.role is distinct from new.role) then
    if public.auth_role() in ('admin','member','mechanic')
       and not public.auth_is_org_owner() then
      raise exception 'Only the owner or a Garage Manager can grant the Garage Manager role';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_garage_manager on public.profiles;
create trigger profiles_guard_garage_manager
  before insert or update on public.profiles
  for each row execute function public.guard_garage_manager_grant();
