-- ============================================================================
-- YARDAO → Supabase  |  0002_rls_policies.sql
-- Row-Level Security: organization_id is the tenant boundary on every table.
--
-- Tenancy model
--   * Each user's profile carries organization_id + role.
--   * A Custom Access Token Hook copies those into the JWT as `org_id` / `role`
--     so RLS can check them WITHOUT a per-request lookup into profiles.
--   * Policy shape:  organization_id = auth_org_id()
--
-- After applying this migration you MUST enable the hook in the dashboard:
--   Authentication → Hooks → Customize Access Token (JWT) Claims
--   → select public.custom_access_token_hook
-- (or set [auth.hook.custom_access_token] in supabase/config.toml).
-- ============================================================================

-- ── claim helpers ───────────────────────────────────────────────────────────
-- org_id of the calling user, read from the JWT claim (no table lookup).
create or replace function public.auth_org_id()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', '')::uuid
$$;

create or replace function public.auth_role()
returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'role'
$$;

-- ── Custom Access Token Hook ─────────────────────────────────────────────────
-- Injects org_id + role from the user's profile into every issued JWT.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims    jsonb := event -> 'claims';
  v_org_id  uuid;
  v_role    text;
begin
  select organization_id, role into v_org_id, v_role
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  if v_org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org_id::text));
  end if;
  if v_role is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- the auth admin role executes the hook and must read profiles
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;

-- ── enable RLS on every table ────────────────────────────────────────────────
alter table public.organizations          enable row level security;
alter table public.profiles               enable row level security;
alter table public.organization_settings  enable row level security;
alter table public.branches               enable row level security;
alter table public.contracts              enable row level security;
alter table public.condition_categories   enable row level security;
alter table public.external_garages       enable row level security;
alter table public.vehicles               enable row level security;
alter table public.checked_in_vehicles    enable row level security;
alter table public.yard_layouts           enable row level security;
alter table public.customers              enable row level security;
alter table public.service_bookings       enable row level security;
alter table public.stock_parts            enable row level security;
alter table public.part_usage             enable row level security;
alter table public.order_history          enable row level security;
alter table public.stock_adjustments      enable row level security;
alter table public.invoices               enable row level security;
alter table public.checkout_history       enable row level security;

-- ── organizations ────────────────────────────────────────────────────────────
-- members can read their own org; admins can update it.
create policy org_select on public.organizations
  for select to authenticated using (id = public.auth_org_id());
create policy org_update on public.organizations
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (id = public.auth_org_id() and public.auth_role() = 'admin');

-- ── profiles ─────────────────────────────────────────────────────────────────
-- a user can always read/update their own row; members can read profiles in
-- their org; admins can insert/update/soft-delete profiles in their org.
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_org on public.profiles
  for select to authenticated using (organization_id = public.auth_org_id());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (organization_id = public.auth_org_id() and public.auth_role() = 'admin');

-- ── generic org-scoped tables ────────────────────────────────────────────────
-- Identical full-CRUD-within-org policy. Generated via a DO loop to stay DRY;
-- tighten per-table (e.g. admin-only deletes) in a later migration if needed.
do $$
declare t text;
begin
  foreach t in array array[
    'organization_settings','branches','contracts','condition_categories',
    'external_garages','vehicles','checked_in_vehicles','yard_layouts',
    'customers','service_bookings','stock_parts','part_usage',
    'order_history','stock_adjustments','invoices','checkout_history'
  ]
  loop
    execute format($f$
      create policy %1$s_org_rw on public.%1$s
        for all to authenticated
        using (organization_id = public.auth_org_id())
        with check (organization_id = public.auth_org_id());
    $f$, t);
  end loop;
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Surfaces that replace Firestore onSnapshot. RLS still applies to realtime,
-- so clients only receive changes for their own org.
alter publication supabase_realtime add table public.checked_in_vehicles;
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.yard_layouts;
alter publication supabase_realtime add table public.service_bookings;
