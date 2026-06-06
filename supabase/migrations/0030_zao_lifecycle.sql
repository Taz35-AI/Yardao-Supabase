-- ============================================================================
-- 0030_zao_lifecycle.sql — Zao yard-lifecycle write tools.
-- Lets the agent run the everyday yard workflow by voice/text: check a vehicle
-- IN, change status/comment (0029), put it OUT on hire / bring it back, mark its
-- MOT done, and check it OUT of the yard. Each is org-scoped (SECURITY DEFINER +
-- explicit auth_org_id filter) and faithfully mirrors the side-effects of the
-- existing UI flows (checkout_history snapshot, hire_history ledger, fleet ↔ yard
-- MOT sync). Reversible operations.
--
-- NOT included on purpose (stay on the tested UI — multi-step / reporting-heavy
-- / destructive): service bookings (slot logic), defleet, branch transfer,
-- send-to-external-garage.
-- ============================================================================

-- who is calling (for *_by_name fields) — best effort
create or replace function public._zao_actor_name()
returns text language sql stable as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()), 'Zao')
$$;

-- ── CHECK IN: add a vehicle to the yard ─────────────────────────────────────
create or replace function public.zao_check_in(
  p_reg text, p_make text default null, p_model text default null,
  p_status text default 'Pending checks', p_branch text default 'main'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  reg   text := replace(upper(btrim(coalesce(p_reg, ''))), ' ', '');
  v_vehicle_id uuid;
  v_make text := p_make;
  v_model text := p_model;
begin
  if reg = '' then raise exception 'Registration required'; end if;
  -- coerce any unknown/odd status to the safe default — never error or insert
  -- something the status check constraint would reject.
  if p_status is null or p_status not in ('Ready', 'Pending checks', 'Repairs needed', 'Non-Starter') then
    p_status := 'Pending checks';
  end if;
  if exists (select 1 from checked_in_vehicles
             where organization_id = v_org and replace(upper(registration), ' ', '') = reg) then
    return jsonb_build_object('ok', false, 'error', reg || ' is already in the yard.');
  end if;

  -- link to the fleet record if the reg exists there, and fill make/model
  select v.id, coalesce(v_make, v.make), coalesce(v_model, v.model)
    into v_vehicle_id, v_make, v_model
  from vehicles v
  where v.organization_id = v_org
    and replace(upper(v.registration), ' ', '') = reg
    and coalesce(v.is_defleeted, false) = false
  limit 1;

  insert into checked_in_vehicles
    (organization_id, vehicle_id, registration, make, model, status, branch_id, check_in_time, created_at)
  values
    (v_org, v_vehicle_id, reg, v_make, v_model, p_status, coalesce(nullif(p_branch, ''), 'main'), now(), now());

  return jsonb_build_object('ok', true, 'registration', reg, 'status', p_status, 'in_fleet', v_vehicle_id is not null);
end;
$$;

-- ── CHECK OUT: remove from the yard (logs to checkout_history) ───────────────
create or replace function public.zao_check_out(p_reg text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  key   text := replace(upper(coalesce(p_reg, '')), ' ', '');
  c     checked_in_vehicles;
begin
  select * into c from checked_in_vehicles
   where organization_id = v_org and replace(upper(registration), ' ', '') = key
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No vehicle "' || p_reg || '" in the yard.');
  end if;

  insert into checkout_history
    (organization_id, registration, make, model, colour, size, condition, status, mileage,
     contract, contract_color, insurance_status, mot_expiry, tax_expiry, notes, comments,
     vehicle_id, original_branch_id, checked_out_date, checked_out_by, checked_out_by_name,
     original_check_in_date)
  values
    (v_org, c.registration, c.make, c.model, c.colour, c.size, c.condition, c.status, c.mileage,
     c.contract, c.contract_color, c.insurance_status, c.mot_expiry::text, c.tax_expiry::text, c.notes, c.comments,
     c.vehicle_id::text, c.branch_id, now(), auth.uid()::text, public._zao_actor_name(),
     c.check_in_time);

  delete from checked_in_vehicles where id = c.id;  -- frees its parking space too
  return jsonb_build_object('ok', true, 'registration', c.registration);
end;
$$;

-- ── HIRE: put out on hire / bring back (hire_history ledger) ─────────────────
create or replace function public.zao_set_hire(p_reg text, p_on_hire boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._zao_org();
  key   text := replace(upper(coalesce(p_reg, '')), ' ', '');
  c     checked_in_vehicles;
  v_hh  uuid;
begin
  select * into c from checked_in_vehicles
   where organization_id = v_org and replace(upper(registration), ' ', '') = key
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No vehicle "' || p_reg || '" in the yard.');
  end if;

  if p_on_hire then
    if c.hire_status = 'Out on Hire' then
      return jsonb_build_object('ok', false, 'error', c.registration || ' is already out on hire.');
    end if;
    insert into hire_history
      (organization_id, vehicle_id, registration, make, model, hire_start_date, hired_by, hired_by_name, branch_id, created_at)
    values
      (v_org, c.id::text, c.registration, c.make, c.model, now(), auth.uid()::text, public._zao_actor_name(), c.branch_id, now())
    returning id into v_hh;
    update checked_in_vehicles
       set hire_status = 'Out on Hire', original_status = c.status, hired_at = now(),
           hired_by = auth.uid()::text, hired_by_name = public._zao_actor_name(),
           current_hire_history_id = v_hh, updated_at = now()
     where id = c.id;
    return jsonb_build_object('ok', true, 'registration', c.registration, 'hire_status', 'Out on Hire');
  else
    if c.hire_status <> 'Out on Hire' then
      return jsonb_build_object('ok', false, 'error', c.registration || ' is not out on hire.');
    end if;
    update hire_history
       set hire_end_date = now(), returned_by = auth.uid()::text, returned_by_name = public._zao_actor_name(),
           duration_in_days = greatest(0, extract(day from (now() - hire_start_date))::int), updated_at = now()
     where id = c.current_hire_history_id;
    update checked_in_vehicles
       set hire_status = 'In Yard',
           status = case when coalesce(c.original_status, '') in ('Ready', 'Pending checks', 'Repairs needed', 'Non-Starter')
                         then c.original_status else 'Pending checks' end,
           original_status = null,
           hired_at = null, hired_by = null, hired_by_name = null, current_hire_history_id = null, updated_at = now()
     where id = c.id;
    return jsonb_build_object('ok', true, 'registration', c.registration, 'hire_status', 'In Yard');
  end if;
end;
$$;

-- ── MARK MOT DONE: roll the fleet (and yard) MOT expiry forward ──────────────
create or replace function public.zao_mark_mot_done(p_reg text, p_months int default 12)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public._zao_org();
  key     text := replace(upper(coalesce(p_reg, '')), ' ', '');
  months  int  := least(greatest(coalesce(p_months, 12), 1), 36);
  v_new   date := (((now() at time zone 'Europe/London')::date) + (months || ' months')::interval)::date;
  v_count int;
begin
  update vehicles
     set mot_expiry = v_new, updated_at = now()
   where organization_id = v_org and replace(upper(registration), ' ', '') = key
     and coalesce(is_defleeted, false) = false;
  get diagnostics v_count = row_count;

  update checked_in_vehicles
     set mot_expiry = v_new, updated_at = now()
   where organization_id = v_org and replace(upper(registration), ' ', '') = key;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No fleet vehicle "' || p_reg || '" found.');
  end if;
  return jsonb_build_object('ok', true, 'registration', upper(p_reg), 'mot_expiry', v_new);
end;
$$;

grant execute on function public.zao_check_in(text, text, text, text, text) to authenticated;
grant execute on function public.zao_check_out(text)                        to authenticated;
grant execute on function public.zao_set_hire(text, boolean)                to authenticated;
grant execute on function public.zao_mark_mot_done(text, int)               to authenticated;
revoke execute on function public._zao_actor_name() from public;
