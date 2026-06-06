-- ============================================================================
-- 0032_zao_full.sql — complete the Zao toolset: branches, external garages,
-- branch transfer, send-to-garage, service booking, add-to-fleet, defleet.
-- All org-scoped (SECURITY DEFINER + auth_org_id) and faithful to the schema in
-- 0001. The existing UI flows remain the rich source of truth; these give the
-- agent a parallel way to do the same core operations from natural language.
-- Idempotent (create or replace).
-- ============================================================================

-- ── READ: list branches (so the agent can resolve "X branch") ───────────────
create or replace function public.zao_branches()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_org uuid := public._zao_org();
begin
  return (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select slug, name, is_main from branches
    where organization_id = v_org and is_active = true order by is_main desc, name) t);
end; $$;

-- ── READ: list external garages (so the agent can resolve "X garage") ───────
create or replace function public.zao_garages()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_org uuid := public._zao_org();
begin
  return (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select name, address from external_garages
    where organization_id = v_org and is_active = true order by name) t);
end; $$;

-- ── ACTION: transfer a yard vehicle to another branch (in transit) ──────────
create or replace function public.zao_transfer_to_branch(p_reg text, p_branch text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  key   text := replace(upper(coalesce(p_reg, '')), ' ', '');
  c     checked_in_vehicles;
  b     branches;
begin
  select * into c from checked_in_vehicles
   where organization_id = v_org and replace(upper(registration), ' ', '') = key limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'No vehicle "' || p_reg || '" in the yard.'); end if;

  select * into b from branches
   where organization_id = v_org and is_active = true
     and (slug = lower(btrim(p_branch)) or name ilike btrim(p_branch) or name ilike '%' || btrim(p_branch) || '%')
   order by (name ilike btrim(p_branch)) desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'No branch matching "' || p_branch || '".'); end if;
  if b.slug = coalesce(c.branch_id, 'main') then return jsonb_build_object('ok', false, 'error', c.registration || ' is already at ' || b.name || '.'); end if;

  update checked_in_vehicles
     set transfer_status = 'in_transit',
         source_branch_id = c.branch_id,
         source_branch_name = (select name from branches where organization_id = v_org and slug = coalesce(c.branch_id, 'main') limit 1),
         target_branch_id = b.slug, target_branch_name = b.name,
         transfer_initiated_at = now(), transfer_initiated_by = auth.uid(),
         transfer_initiated_by_name = public._zao_actor_name(), updated_at = now()
   where id = c.id;
  return jsonb_build_object('ok', true, 'registration', c.registration, 'transfer_to', b.name);
end; $$;

-- ── ACTION: send a yard vehicle to an external garage ───────────────────────
create or replace function public.zao_send_to_garage(p_reg text, p_garage text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  key   text := replace(upper(coalesce(p_reg, '')), ' ', '');
  c     checked_in_vehicles;
  g     external_garages;
begin
  select * into c from checked_in_vehicles
   where organization_id = v_org and replace(upper(registration), ' ', '') = key limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'No vehicle "' || p_reg || '" in the yard.'); end if;

  select * into g from external_garages
   where organization_id = v_org and is_active = true
     and (name ilike btrim(p_garage) or name ilike '%' || btrim(p_garage) || '%')
   order by (name ilike btrim(p_garage)) desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'No external garage matching "' || p_garage || '". Add it under Settings → External Garages.'); end if;

  update checked_in_vehicles
     set transfer_status = 'at_external_garage',
         external_garage_id = g.id, external_garage_name = g.name,
         checked_out_to_garage_at = now(), checked_out_to_garage_by = auth.uid(),
         checked_out_to_garage_by_name = public._zao_actor_name(), updated_at = now()
   where id = c.id;
  return jsonb_build_object('ok', true, 'registration', c.registration, 'garage', g.name);
end; $$;

-- ── ACTION: create a service booking ────────────────────────────────────────
create or replace function public.zao_book_service(p_reg text, p_date date, p_work text, p_time text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  key   text := replace(upper(coalesce(p_reg, '')), ' ', '');
  v_make text; v_model text;
begin
  if p_date is null then raise exception 'A date is required to book a service'; end if;
  select make, model into v_make, v_model from vehicles
   where organization_id = v_org and replace(upper(registration), ' ', '') = key limit 1;

  insert into service_bookings
    (organization_id, date, time_slot, registration, make, model, work_required, status, created_by, created_by_name, created_at)
  values
    (v_org, p_date, p_time, key, v_make, v_model, to_jsonb(coalesce(p_work, 'Service')), 'scheduled', auth.uid(), public._zao_actor_name(), now());
  return jsonb_build_object('ok', true, 'registration', key, 'date', p_date, 'work', coalesce(p_work, 'Service'));
end; $$;

-- ── ACTION: add a vehicle to the fleet ──────────────────────────────────────
create or replace function public.zao_add_to_fleet(
  p_reg text, p_make text default null, p_model text default null,
  p_mot date default null, p_tax date default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  key   text := replace(upper(btrim(coalesce(p_reg, ''))), ' ', '');
begin
  if key = '' then raise exception 'Registration required'; end if;
  if exists (select 1 from vehicles where organization_id = v_org and replace(upper(registration), ' ', '') = key and coalesce(is_defleeted, false) = false) then
    return jsonb_build_object('ok', false, 'error', key || ' is already in the fleet.');
  end if;
  insert into vehicles (organization_id, registration, make, model, mot_expiry, tax_expiry, current_status, created_by, created_at)
  values (v_org, key, p_make, p_model, p_mot, p_tax, 'in_fleet', auth.uid(), now());
  return jsonb_build_object('ok', true, 'registration', key);
end; $$;

-- ── ACTION: defleet a vehicle (reversible soft-delete) ──────────────────────
create or replace function public.zao_defleet(p_reg text, p_reason text default 'Other')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public._zao_org();
  key     text := replace(upper(coalesce(p_reg, '')), ' ', '');
  reason  text := case when p_reason in ('Sold','Scrapped','Trade-In','End of Lease','Accident Write-Off','Theft','Other')
                       then p_reason else 'Other' end;
  v_count int;
begin
  -- snapshot + remove any yard copies, then soft-delete the fleet record
  insert into checkout_history
    (organization_id, registration, make, model, colour, size, status, vehicle_id,
     original_branch_id, checked_out_date, checked_out_by, checked_out_by_name, deletion_reason)
  select v_org, registration, make, model, colour, size, status, vehicle_id::text,
         branch_id, now(), auth.uid()::text, public._zao_actor_name(), 'Defleeted via Zao: ' || reason
  from checked_in_vehicles
  where organization_id = v_org and replace(upper(registration), ' ', '') = key;

  delete from checked_in_vehicles
   where organization_id = v_org and replace(upper(registration), ' ', '') = key;

  update vehicles
     set is_defleeted = true, defleet_date = (now() at time zone 'Europe/London')::date,
         defleet_processed_date = now(), defleet_reason = reason, defleeted_by = auth.uid(),
         defleeted_by_name = public._zao_actor_name(), current_status = 'defleeted', updated_at = now()
   where organization_id = v_org and replace(upper(registration), ' ', '') = key and coalesce(is_defleeted, false) = false;
  get diagnostics v_count = row_count;
  if v_count = 0 then return jsonb_build_object('ok', false, 'error', 'No active fleet vehicle "' || p_reg || '" found.'); end if;
  return jsonb_build_object('ok', true, 'registration', key, 'reason', reason);
end; $$;

grant execute on function public.zao_branches()                                   to authenticated;
grant execute on function public.zao_garages()                                    to authenticated;
grant execute on function public.zao_transfer_to_branch(text, text)               to authenticated;
grant execute on function public.zao_send_to_garage(text, text)                   to authenticated;
grant execute on function public.zao_book_service(text, date, text, text)         to authenticated;
grant execute on function public.zao_add_to_fleet(text, text, text, date, date)   to authenticated;
grant execute on function public.zao_defleet(text, text)                          to authenticated;
