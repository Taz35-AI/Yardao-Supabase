-- ============================================================================
-- 0021_fix_jwt_hook.sql — make the access-token hook actually populate claims.
--
-- Two fixes:
-- 1. The hook runs as `supabase_auth_admin`. profiles has RLS on, and no policy
--    grants that role SELECT, so the hook read 0 rows and set no org_id claim.
--    Add a permissive SELECT policy for supabase_auth_admin (the documented
--    requirement for access-token hooks that read app tables).
-- 2. The app role must NOT overwrite the JWT `role` claim (PostgREST uses it to
--    SET ROLE). Put it in a separate `user_role` claim, and read that in
--    auth_role(). Idempotent — safe to run on the already-applied database.
-- ============================================================================

-- 1. let the auth admin read profiles under RLS
drop policy if exists auth_admin_read_profiles on public.profiles;
create policy auth_admin_read_profiles on public.profiles
  as permissive for select to supabase_auth_admin using (true);
grant select on public.profiles to supabase_auth_admin;

-- 2. app role lives in `user_role`, not the Postgres `role` claim
create or replace function public.auth_role()
returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims   jsonb := event -> 'claims';
  v_org_id uuid;
  v_role   text;
begin
  select organization_id, role into v_org_id, v_role
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  if v_org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org_id::text));
  end if;
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
