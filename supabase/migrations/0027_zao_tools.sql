-- ============================================================================
-- 0027_zao_tools.sql — SQL-native data layer for the Zao AI assistant.
--
-- These are the "tools" the LLM calls via Groq tool-calling. Instead of dumping
-- the whole dataset into the prompt, Zao calls precise functions that run
-- efficient, indexed, org-scoped SQL and return just the answer. This makes it
-- cheaper (small context), accurate, and able to answer analytical questions.
--
-- SAFETY MODEL
--   * Curated tools: SECURITY DEFINER, but EVERY query is explicitly filtered by
--     organization_id = public.auth_org_id() (the caller's org from their JWT),
--     and we raise if the caller has no org. They can only ever see their org.
--   * Escape hatch (zao_run_query): SECURITY INVOKER, so it runs as the calling
--     `authenticated` user and RLS enforces tenancy automatically. It accepts a
--     single read-only SELECT only, hard-capped with LIMIT + a statement timeout.
--
-- All functions return jsonb so the client can hand results straight back to the
-- model. Idempotent (create or replace).
-- ============================================================================

-- ── guard helper: resolve caller's org or raise ─────────────────────────────
create or replace function public._zao_org()
returns uuid language plpgsql stable as $$
declare v uuid := public.auth_org_id();
begin
  if v is null then
    raise exception 'Zao: no organization in session';
  end if;
  return v;
end;
$$;

-- ── 1. high-level operational summary (the "how's the yard?" tool) ───────────
create or replace function public.zao_fleet_summary()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  v_today date := (now() at time zone 'Europe/London')::date;
  result jsonb;
begin
  select jsonb_build_object(
    'fleet_total',        (select count(*) from vehicles v where v.organization_id = v_org and coalesce(v.is_defleeted,false) = false),
    'defleeted_total',    (select count(*) from vehicles v where v.organization_id = v_org and v.is_defleeted = true),
    'in_yard',            (select count(*) from checked_in_vehicles c where c.organization_id = v_org),
    'by_status',          (select coalesce(jsonb_object_agg(status, n),'{}'::jsonb) from (
                             select status, count(*) n from checked_in_vehicles
                             where organization_id = v_org group by status) s),
    'on_hire',            (select count(*) from checked_in_vehicles c where c.organization_id = v_org and c.hire_status = 'Out on Hire'),
    'at_external_garage', (select count(*) from checked_in_vehicles c where c.organization_id = v_org and c.transfer_status = 'at_external_garage'),
    'in_transit',         (select count(*) from checked_in_vehicles c where c.organization_id = v_org and c.transfer_status = 'in_transit'),
    'uninsured_in_yard',  (select count(*) from checked_in_vehicles c where c.organization_id = v_org and coalesce(c.insurance_status,'Not Insured') <> 'Insured'),
    'mot_due_30',         (select count(*) from vehicles v where v.organization_id = v_org and coalesce(v.is_defleeted,false)=false and v.mot_expiry is not null and v.mot_expiry <= v_today + 30),
    'mot_expired',        (select count(*) from vehicles v where v.organization_id = v_org and coalesce(v.is_defleeted,false)=false and v.mot_expiry is not null and v.mot_expiry <  v_today),
    'tax_due_30',         (select count(*) from vehicles v where v.organization_id = v_org and coalesce(v.is_defleeted,false)=false and v.tax_expiry is not null and v.tax_expiry <= v_today + 30),
    'bookings_today',     (select count(*) from service_bookings b where b.organization_id = v_org and b.date = v_today and b.status <> 'cancelled')
  ) into result;
  return result;
end;
$$;

-- ── 2. search vehicles (fleet + yard) by reg / make / model ─────────────────
create or replace function public.zao_search_vehicles(p_query text, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  q text := '%' || regexp_replace(coalesce(p_query,''), '\s+', '', 'g') || '%';
  lim int := least(greatest(coalesce(p_limit,20),1), 50);
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select v.registration, v.make, v.model, v.colour, v.size,
             v.current_status, v.mot_expiry, v.tax_expiry, v.insurance_status,
             coalesce(v.is_defleeted,false) as is_defleeted,
             (select c.status from checked_in_vehicles c
                where c.organization_id = v_org and replace(upper(c.registration),' ','') = replace(upper(v.registration),' ','')
                limit 1) as yard_status
      from vehicles v
      where v.organization_id = v_org
        and (replace(upper(v.registration),' ','') ilike upper(q)
             or v.make ilike '%'||p_query||'%'
             or v.model ilike '%'||p_query||'%')
      order by v.registration
      limit lim
    ) t
  );
end;
$$;

-- ── 3. yard vehicles by status ──────────────────────────────────────────────
create or replace function public.zao_vehicles_by_status(p_status text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_org uuid := public._zao_org();
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select registration, make, model, status, hire_status, insurance_status, branch_id, bay
      from checked_in_vehicles
      where organization_id = v_org and status = p_status
      order by registration
    ) t
  );
end;
$$;

-- ── 4. MOT / tax due soon (or expired) ──────────────────────────────────────
create or replace function public.zao_due_soon(p_kind text, p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  v_today date := (now() at time zone 'Europe/London')::date;
  days int := least(greatest(coalesce(p_days,30),0), 365);
begin
  if lower(coalesce(p_kind,'mot')) not in ('mot','tax') then
    raise exception 'Zao: p_kind must be mot or tax';
  end if;
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select v.registration, v.make, v.model,
             case when lower(p_kind)='mot' then v.mot_expiry else v.tax_expiry end as expiry
      from vehicles v
      where v.organization_id = v_org and coalesce(v.is_defleeted,false)=false
        and (case when lower(p_kind)='mot' then v.mot_expiry else v.tax_expiry end) is not null
        and (case when lower(p_kind)='mot' then v.mot_expiry else v.tax_expiry end) <= v_today + days
      order by expiry asc
      limit 100
    ) t
  );
end;
$$;

-- ── 5. where is a specific vehicle right now ────────────────────────────────
create or replace function public.zao_vehicle_location(p_reg text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  key text := replace(upper(coalesce(p_reg,'')), ' ', '');
  c record;
begin
  select * into c from checked_in_vehicles
  where organization_id = v_org and replace(upper(registration),' ','') = key
  limit 1;

  if found then
    return jsonb_build_object(
      'registration', c.registration,
      'where', case
                 when c.transfer_status = 'at_external_garage' then 'at_external_garage'
                 when c.transfer_status = 'in_transit'         then 'in_transit'
                 when c.hire_status = 'Out on Hire'            then 'out_on_hire'
                 else 'in_yard' end,
      'status', c.status,
      'branch_id', c.branch_id,
      'bay', c.bay,
      'external_garage_name', c.external_garage_name,
      'target_branch_name', c.target_branch_name
    );
  end if;

  -- not in the yard — is it in the fleet at all?
  if exists (select 1 from vehicles v where v.organization_id = v_org and replace(upper(v.registration),' ','') = key) then
    return jsonb_build_object('registration', p_reg, 'where', 'not_in_yard', 'note', 'In fleet but not currently checked in to any yard.');
  end if;

  return jsonb_build_object('registration', p_reg, 'where', 'unknown', 'note', 'No vehicle with that registration found for this organization.');
end;
$$;

-- ── 6. service bookings in a date range ─────────────────────────────────────
create or replace function public.zao_bookings(p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_org uuid := public._zao_org();
  v_today date := (now() at time zone 'Europe/London')::date;
  d_from date := coalesce(p_from, v_today);
  d_to   date := coalesce(p_to, v_today + 14);
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select date, time_slot, registration, make, model, work_required, status,
             is_external_provider, customer_name, assigned_mechanic_name
      from service_bookings
      where organization_id = v_org and date between d_from and d_to and status <> 'cancelled'
      order by date asc, time_slot asc
      limit 200
    ) t
  );
end;
$$;

-- ── 7. vehicles currently AT external garages (physical location) ───────────
create or replace function public.zao_at_external_garages()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_org uuid := public._zao_org();
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
      select registration, make, model, external_garage_name, checked_out_to_garage_at
      from checked_in_vehicles
      where organization_id = v_org and transfer_status = 'at_external_garage'
      order by registration
    ) t
  );
end;
$$;

-- ── 8. guarded escape hatch: arbitrary read-only SELECT ─────────────────────
-- SECURITY INVOKER (default): runs as the calling `authenticated` user, so RLS
-- scopes every table to their org automatically. We only allow a single SELECT,
-- block statement stacking + DML keywords, and hard-cap the result with LIMIT
-- and a statement timeout. This is the "answer anything" path for the long tail.
create or replace function public.zao_run_query(p_sql text)
returns jsonb language plpgsql as $$
declare
  s text := btrim(coalesce(p_sql, ''));
  result jsonb;
begin
  -- must be a single SELECT / WITH statement
  if s !~* '^(select|with)\s' then
    raise exception 'Zao: only SELECT queries are allowed';
  end if;
  -- no statement stacking (a trailing semicolon is tolerated, internal ones are not)
  if position(';' in btrim(s, ';')) > 0 then
    raise exception 'Zao: only a single statement is allowed';
  end if;
  -- defence in depth: reject any write / DDL keyword tokens
  if s ~* '\m(insert|update|delete|drop|alter|truncate|grant|revoke|create|comment|copy|call|do|merge|vacuum|reindex|refresh)\M' then
    raise exception 'Zao: query contains a disallowed keyword';
  end if;

  s := rtrim(s, '; ');

  -- short timeout so a heavy/accidental query can't hang
  set local statement_timeout = '5s';

  -- cap rows INSIDE the subquery (before aggregating), so a huge result set
  -- can never be pulled into one jsonb blob.
  execute format(
    'select coalesce(jsonb_agg(row_to_json(_q)), ''[]''::jsonb) from (select * from (%s) _inner limit 200) _q',
    s
  ) into result;

  return result;
end;
$$;

-- ── grants: only signed-in users can call Zao tools ─────────────────────────
grant execute on function public.zao_fleet_summary()                 to authenticated;
grant execute on function public.zao_search_vehicles(text, int)      to authenticated;
grant execute on function public.zao_vehicles_by_status(text)        to authenticated;
grant execute on function public.zao_due_soon(text, int)             to authenticated;
grant execute on function public.zao_vehicle_location(text)          to authenticated;
grant execute on function public.zao_bookings(date, date)            to authenticated;
grant execute on function public.zao_at_external_garages()           to authenticated;
grant execute on function public.zao_run_query(text)                 to authenticated;
revoke execute on function public._zao_org() from public;
