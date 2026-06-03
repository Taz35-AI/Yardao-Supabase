-- ============================================================================
-- YARDAO → Supabase  |  0003_auth_bootstrap.sql
-- Signup → profile provisioning + RLS-safe organization bootstrap.
--
-- The chicken-and-egg problem: a just-signed-up user has no org_id JWT claim
-- yet, so a direct client INSERT into organizations / UPDATE of their profile
-- would be denied by RLS. We solve it with:
--   1. a trigger that auto-creates the profile row on signup, and
--   2. a SECURITY DEFINER RPC that creates the org, joins the caller as admin,
--      and seeds default conditions atomically (bypassing RLS safely, scoped to
--      auth.uid()).
-- ============================================================================

-- ── 1. auto-create profile on signup ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, email_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'displayName', new.raw_user_meta_data ->> 'display_name', new.email),
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. create organization + join caller as admin + seed conditions ──────────
create or replace function public.create_organization(p_name text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (name, description, created_by, member_count)
  values (p_name, p_description, v_uid, 1)
  returning id into v_org;

  update public.profiles
     set organization_id = v_org,
         organization_name = p_name,
         role = 'admin',
         updated_at = now()
   where id = v_uid;

  -- seed the 5 default condition categories (mirrors conditionService defaults)
  insert into public.condition_categories (organization_id, name, sort_order, color, severity) values
    (v_org, 'Excellent', 0, '#16a34a', 'excellent'),
    (v_org, 'Good',      1, '#22c55e', 'good'),
    (v_org, 'Fair',      2, '#eab308', 'fair'),
    (v_org, 'Poor',      3, '#f97316', 'poor'),
    (v_org, 'Critical',  4, '#ef4444', 'critical');

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

-- NOTE: after calling create_organization the client MUST refresh its session
-- (supabase.auth.refreshSession()) so the access-token hook re-issues a JWT
-- carrying the new org_id claim — otherwise subsequent RLS-scoped reads return
-- nothing. organizationService.createOrganization does this automatically.
