-- ============================================================================
-- 0022_org_main_branch.sql — every new organization starts with one
-- auto-created, renamable Main Branch (slug 'main', is_main = true).
-- The branch selector shows the Main entry only when an is_main row exists, and
-- checked-in vehicles are keyed by branch_id = 'main', so this makes the default
-- branch a real, renamable row instead of a UI-only fallback.
-- Idempotent (create or replace). Existing orgs are backfilled separately.
-- ============================================================================
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

  insert into public.condition_categories (organization_id, name, sort_order, color, severity) values
    (v_org, 'Excellent', 0, '#16a34a', 'excellent'),
    (v_org, 'Good',      1, '#22c55e', 'good'),
    (v_org, 'Fair',      2, '#eab308', 'fair'),
    (v_org, 'Poor',      3, '#f97316', 'poor'),
    (v_org, 'Critical',  4, '#ef4444', 'critical');

  -- every org starts with one renamable Main Branch
  insert into public.branches (organization_id, slug, name, is_main, is_active, created_by)
  values (v_org, 'main', 'Main Branch', true, true, v_uid);

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;
