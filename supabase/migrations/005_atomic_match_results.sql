-- Additive migration. Existing rows are retained. Only service_role may execute.
-- Match fields and participant wins must commit together, including clearing a winner.
create or replace function public.update_inhouse_match(p_match_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_match public.inhouse_matches%rowtype;
begin
  select * into v_match from public.inhouse_matches where id = p_match_id for update;
  if not found then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid match patch' using errcode = '22023'; end if;
  if p_patch ? 'status' then v_match.status := p_patch->>'status'; end if;
  if p_patch ? 'winner_team' then v_match.winner_team := p_patch->>'winner_team'; end if;
  if p_patch ? 'started_at' then v_match.started_at := (p_patch->>'started_at')::timestamptz; end if;
  if p_patch ? 'ended_at' then v_match.ended_at := (p_patch->>'ended_at')::timestamptz; end if;
  if p_patch ? 'duration_seconds' then v_match.duration_seconds := (p_patch->>'duration_seconds')::integer; end if;
  if v_match.status not in ('READY','IN_PROGRESS','COMPLETED','CANCELLED') or v_match.status is null then raise exception 'Invalid status' using errcode = '22023'; end if;
  if v_match.winner_team is not null and v_match.winner_team not in ('BLUE','RED') then raise exception 'Invalid winner' using errcode = '22023'; end if;
  if v_match.duration_seconds < 0 then raise exception 'Invalid duration' using errcode = '22023'; end if;
  if v_match.started_at is not null and v_match.ended_at is not null and v_match.ended_at < v_match.started_at then raise exception 'End precedes start' using errcode = '22023'; end if;
  update public.inhouse_matches set status=v_match.status, winner_team=v_match.winner_team, started_at=v_match.started_at, ended_at=v_match.ended_at, duration_seconds=v_match.duration_seconds where id=p_match_id;
  if p_patch ? 'winner_team' then
    update public.match_participants set win=case when v_match.winner_team is null then null else team=v_match.winner_team end where match_id=p_match_id;
  end if;
  return p_match_id;
end $$;
revoke all on function public.update_inhouse_match(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.update_inhouse_match(uuid,jsonb) to service_role;
