-- ============================================================================
-- 0029_zao_actions.sql — Zao write tools (safe, reversible actions).
-- Lets the agent act on natural commands ("move it to ready", "add a note to
-- YB67"). Only two low-risk, reversible actions for now: change a yard vehicle's
-- status, and add a comment. Check-in/out, defleet and bookings stay on the
-- existing explicit flows (destructive/multi-step).
--
-- Org-scoped: SECURITY DEFINER + explicit auth_org_id() filter, so a user can
-- only ever change THEIR org's vehicles. Both return a JSON result the agent
-- relays back to the user.
-- ============================================================================

-- ── change a yard vehicle's status ──────────────────────────────────────────
create or replace function public.zao_set_status(p_reg text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public._zao_org();
  key     text := replace(upper(coalesce(p_reg, '')), ' ', '');
  v_count int;
begin
  if p_status not in ('Ready', 'Pending checks', 'Repairs needed', 'Non-Starter') then
    raise exception 'Invalid status: %. Must be Ready, Pending checks, Repairs needed or Non-Starter.', p_status;
  end if;

  update public.checked_in_vehicles
     set status        = p_status,
         updated_at    = now(),
         last_edit_log = jsonb_build_object('note', 'Status → ' || p_status || ' via Zao', 'at', now())
   where organization_id = v_org
     and replace(upper(registration), ' ', '') = key;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No vehicle "' || p_reg || '" is in the yard.');
  end if;
  return jsonb_build_object('ok', true, 'registration', upper(p_reg), 'status', p_status, 'updated', v_count);
end;
$$;

-- ── add a comment / note to a yard vehicle ──────────────────────────────────
create or replace function public.zao_add_comment(p_reg text, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public._zao_org();
  key     text := replace(upper(coalesce(p_reg, '')), ' ', '');
  stamp   text := '[' || to_char(now() at time zone 'Europe/London', 'DD/MM HH24:MI') || '] ';
  v_count int;
begin
  if btrim(coalesce(p_comment, '')) = '' then
    raise exception 'Empty comment';
  end if;

  update public.checked_in_vehicles
     set comments      = case when coalesce(comments, '') = '' then stamp || p_comment
                              else comments || E'\n' || stamp || p_comment end,
         updated_at    = now(),
         last_edit_log = jsonb_build_object('note', 'Comment added via Zao', 'at', now())
   where organization_id = v_org
     and replace(upper(registration), ' ', '') = key;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No vehicle "' || p_reg || '" is in the yard.');
  end if;
  return jsonb_build_object('ok', true, 'registration', upper(p_reg), 'comment', p_comment);
end;
$$;

grant execute on function public.zao_set_status(text, text)   to authenticated;
grant execute on function public.zao_add_comment(text, text)  to authenticated;
