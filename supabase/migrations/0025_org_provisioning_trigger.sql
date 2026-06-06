-- ============================================================================
-- YARDAO → Supabase  |  0025_org_provisioning_trigger.sql
-- Make "every signed-up org creator has an organization + admin role" a
-- DATABASE-ENFORCED invariant instead of a client responsibility.
--
-- Before this migration, the org was created only by the client calling the
-- create_organization RPC from the login/register page handlers. Any entry path
-- that skipped those handlers (the email-confirmation redirect, an already-
-- persisted session) left the user with an unlinked profile (organization_id
-- null, role 'member') — which froze every org-scoped screen and dropped the
-- creator to the non-admin menu.
--
-- The correct layer for this invariant is the database. We:
--   1. Extract the provisioning logic into ONE internal function (_provision_org)
--      so the trigger and the client RPC share a single source of truth.
--   2. Fire it from a trigger on auth.users the moment the user is confirmed
--      (email confirmation OFF → at INSERT; ON → when email_confirmed_at is set).
--   3. Make create_organization idempotent (returns the existing org if already
--      linked) so the client fallback can never create a duplicate.
--
-- Idempotent (create or replace) and safe to run on the already-applied DB.
-- ============================================================================

-- ── 1. single source of truth: provision an org for a given user ─────────────
-- SECURITY DEFINER so it can write public tables from the auth.users trigger
-- context (which runs as supabase_auth_admin). NOT granted to clients — they go
-- through create_organization (which scopes to auth.uid()).
create or replace function public._provision_org(
  p_uid uuid, p_name text, p_description text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into public.organizations (name, description, created_by, member_count)
  values (p_name, p_description, p_uid, 1)
  returning id into v_org;

  update public.profiles
     set organization_id = v_org,
         organization_name = p_name,
         role = 'admin',
         updated_at = now()
   where id = p_uid;

  -- 5 default condition categories (mirrors conditionService defaults)
  insert into public.condition_categories (organization_id, name, sort_order, color, severity) values
    (v_org, 'Excellent', 0, '#16a34a', 'excellent'),
    (v_org, 'Good',      1, '#22c55e', 'good'),
    (v_org, 'Fair',      2, '#eab308', 'fair'),
    (v_org, 'Poor',      3, '#f97316', 'poor'),
    (v_org, 'Critical',  4, '#ef4444', 'critical');

  -- every org starts with one renamable Main Branch
  insert into public.branches (organization_id, slug, name, is_main, is_active, created_by)
  values (v_org, 'main', 'Main Branch', true, true, p_uid);

  return v_org;
end;
$$;

-- internal only: clients must never call this directly (it takes an arbitrary
-- p_uid). The SECURITY DEFINER callers below run as the owner regardless.
revoke execute on function public._provision_org(uuid, text, text) from public;

-- ── 2. client RPC now delegates + is idempotent ──────────────────────────────
create or replace function public.create_organization(p_name text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- already provisioned (e.g. the DB trigger beat us to it, or a retry) → no-op
  select organization_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;

  return public._provision_org(v_uid, p_name, coalesce(p_description, p_name || ' fleet management'));
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

-- ── 3. server-side trigger: provision on confirmation ────────────────────────
-- Reads the org name the client stashed in user_metadata at signup
-- (pending_org_name). Runs when the user is (or becomes) confirmed.
create or replace function public.provision_pending_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_name text;
  v_existing uuid;
begin
  -- pending org name stashed by the register page in raw_user_meta_data
  v_org_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'pending_org_name', '')), '');
  if v_org_name is null then
    return new; -- ordinary login / invited member / no org to create
  end if;

  -- ensure the profile row exists (on_auth_user_created normally creates it on
  -- INSERT, but guard against trigger-ordering so the UPDATE below always hits)
  insert into public.profiles (id, email, display_name, email_verified)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'pending_display_name',
             new.raw_user_meta_data ->> 'displayName',
             new.raw_user_meta_data ->> 'display_name', new.email),
    true
  )
  on conflict (id) do nothing;

  -- already linked? nothing to do (idempotent across re-fires)
  select organization_id into v_existing from public.profiles where id = new.id;
  if v_existing is not null then
    return new;
  end if;

  perform public._provision_org(new.id, v_org_name, v_org_name || ' fleet management');
  return new;
end;
$$;

-- Fire on INSERT-with-confirmed (email confirmation OFF) and on the
-- NULL→set transition of email_confirmed_at (email confirmation ON). The
-- in-function "already linked" check makes redundant re-fires harmless.
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.provision_pending_org();

grant execute on function public.provision_pending_org() to supabase_auth_admin;
