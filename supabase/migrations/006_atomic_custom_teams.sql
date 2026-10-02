-- Additive migration: team metadata and membership changes share one transaction.
create or replace function public.save_inhouse_custom_team(p_team_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_member jsonb; v_name text;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid team input' using errcode='22023'; end if;
  if p_team_id is null then
    v_name := trim(p_input->>'name');
    if v_name is null or v_name='' then raise exception 'Name required' using errcode='22023'; end if;
    insert into public.inhouse_custom_teams(name,source,notes) values(v_name,case when p_input->>'source'='AUTO_BALANCED' then 'AUTO_BALANCED' else 'MANUAL' end,coalesce(p_input->>'notes','')) returning id into v_id;
  else
    select id into v_id from public.inhouse_custom_teams where id=p_team_id for update;
    if not found then raise exception 'Team not found' using errcode='P0002'; end if;
    if p_input ? 'name' and nullif(trim(p_input->>'name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    update public.inhouse_custom_teams set name=case when p_input ? 'name' then trim(p_input->>'name') else name end,notes=case when p_input ? 'notes' then coalesce(p_input->>'notes','') else notes end,updated_at=now() where id=v_id;
  end if;
  if p_input ? 'members' then
    if jsonb_typeof(p_input->'members')<>'array' then raise exception 'Invalid members' using errcode='22023'; end if;
    if jsonb_array_length(p_input->'members')>5 then raise exception 'Too many members' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_input->'members') member where coalesce(member->>'position','') not in ('TOP','JUG','MID','ADC','SUP') or nullif(trim(member->>'riotId'),'') is null) then raise exception 'Invalid member position or Riot ID' using errcode='22023'; end if;
    if (select count(*) from jsonb_array_elements(p_input->'members'))<>(select count(distinct member->>'position') from jsonb_array_elements(p_input->'members') member) then raise exception 'Duplicate position' using errcode='22023'; end if;
    delete from public.inhouse_team_members where team_id=v_id;
    for v_member in select * from jsonb_array_elements(p_input->'members') loop
      insert into public.inhouse_team_members(team_id,player_id,riot_id,player_name,position,is_captain) values(v_id,nullif(v_member->>'playerId','')::uuid,trim(v_member->>'riotId'),coalesce(nullif(trim(v_member->>'playerName'),''),split_part(v_member->>'riotId','#',1)),v_member->>'position',coalesce((v_member->>'isCaptain')::boolean,false));
    end loop;
  end if;
  return v_id;
end $$;
revoke all on function public.save_inhouse_custom_team(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_inhouse_custom_team(uuid,jsonb) to service_role;
