-- Additive: one code and one verified Riot game per existing inhouse match.
create table public.tournament_sessions (
 match_id uuid primary key references public.inhouse_matches(id) on delete restrict,
 code text unique,
 callback_digest text not null,
 roster jsonb not null,
 consent_confirmed_at timestamptz not null default now(),
 created_by uuid references auth.users(id),
 tournament_id bigint,
 state text not null default 'CREATING' check(state in ('CREATING','WAITING','RECEIVED','RETRY','COMPLETE','UNKNOWN')),
 riot_match_id text unique,
 attempts integer not null default 0,
 last_error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.tournament_sessions enable row level security;
revoke all on public.tournament_sessions from public,anon,authenticated;
grant all on public.tournament_sessions to service_role;

create function public.reserve_tournament_session(p_match_id uuid,p_digest text,p_roster jsonb,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_match inhouse_matches%rowtype;
begin
 select * into v_match from inhouse_matches where id=p_match_id for update;
 if not found then raise exception 'Match missing' using errcode='P0002'; end if;
 if v_match.status<>'READY' or v_match.tournament_code is not null or exists(select 1 from tournament_sessions where match_id=p_match_id) then raise exception 'Already reserved or not ready' using errcode='22023'; end if;
 if jsonb_array_length(p_roster)<>10 or (select count(distinct item->>'puuid') from jsonb_array_elements(p_roster) item)<>10 or (select count(distinct item->>'playerId') from jsonb_array_elements(p_roster) item)<>10 then raise exception 'Invalid roster' using errcode='22023'; end if;
 if (select count(*) from match_participants where match_id=p_match_id)<>10 or exists(select 1 from jsonb_array_elements(p_roster) item left join match_participants mp on mp.match_id=p_match_id and mp.player_id=(item->>'playerId')::uuid and mp.team=item->>'team' and mp.position=item->>'position' left join players p on p.id=mp.player_id where mp.id is null or p.puuid is distinct from item->>'puuid') then raise exception 'Roster changed' using errcode='22023'; end if;
 insert into tournament_sessions(match_id,callback_digest,roster,created_by) values(p_match_id,p_digest,p_roster,p_user_id);
end $$;

create function public.attach_tournament_code(p_match_id uuid,p_code text,p_tournament_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from inhouse_matches where id=p_match_id for update;
 update tournament_sessions set code=p_code,tournament_id=p_tournament_id,state='WAITING',updated_at=now() where match_id=p_match_id and state='CREATING';
 if not found or nullif(p_code,'') is null then raise exception 'Invalid code state' using errcode='22023'; end if;
 perform set_config('huh.tournament_import',p_match_id::text,true);
 update inhouse_matches set tournament_code=p_code where id=p_match_id;
end $$;

create function public.record_tournament_callback(p_code text,p_digest text,p_riot_match_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_session tournament_sessions%rowtype;
begin
 select * into v_session from tournament_sessions where code=p_code for update;
 if not found or v_session.callback_digest<>p_digest then raise exception 'Invalid callback' using errcode='28000'; end if;
 if p_riot_match_id !~ '^KR_[0-9]+$' or (v_session.riot_match_id is not null and v_session.riot_match_id<>p_riot_match_id) then raise exception 'Game conflict' using errcode='22023'; end if;
 if v_session.state<>'COMPLETE' then update tournament_sessions set riot_match_id=p_riot_match_id,state='RECEIVED',updated_at=now() where match_id=v_session.match_id; end if;
 return v_session.match_id;
end $$;

create function public.import_tournament_result(p_match_id uuid,p_riot_match_id text,p_result jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_session tournament_sessions%rowtype; v_item jsonb;
begin
 -- Same lock order as reserve/attach: match before session.
 perform 1 from inhouse_matches where id=p_match_id for update;
 select * into v_session from tournament_sessions where match_id=p_match_id for update;
 if not found or v_session.riot_match_id is distinct from p_riot_match_id then raise exception 'Game mismatch' using errcode='22023'; end if;
 if v_session.state='COMPLETE' then return; end if;
 if (select status from inhouse_matches where id=p_match_id) not in ('READY','IN_PROGRESS') then raise exception 'Manual result already exists' using errcode='22023'; end if;
 if v_session.state not in ('RECEIVED','RETRY') or jsonb_array_length(p_result->'participants')<>10 then raise exception 'Result not ready' using errcode='22023'; end if;
 if (select count(distinct item->>'player_id') from jsonb_array_elements(p_result->'participants') item)<>10 or exists(select 1 from jsonb_array_elements(p_result->'participants') item left join match_participants mp on mp.match_id=p_match_id and mp.player_id=(item->>'player_id')::uuid and mp.team=item->>'team' and mp.position=item->>'position' where mp.id is null) then raise exception 'Participant mismatch' using errcode='22023'; end if;
 perform set_config('huh.tournament_import',p_match_id::text,true);
 for v_item in select * from jsonb_array_elements(p_result->'participants') loop
  update match_participants set champion_id=(v_item->>'champion_id')::integer,champion_name=v_item->>'champion_name',win=(v_item->>'win')::boolean,kills=(v_item->>'kills')::integer,deaths=(v_item->>'deaths')::integer,assists=(v_item->>'assists')::integer,cs=(v_item->>'cs')::integer,gold=(v_item->>'gold')::integer,damage_to_champions=(v_item->>'damage_to_champions')::integer,vision_score=(v_item->>'vision_score')::integer where match_id=p_match_id and player_id=(v_item->>'player_id')::uuid;
 end loop;
 update inhouse_matches set riot_game_id=p_riot_match_id,winner_team=p_result->>'winner_team',status='COMPLETED',started_at=(p_result->>'started_at')::timestamptz,ended_at=(p_result->>'ended_at')::timestamptz,duration_seconds=(p_result->>'duration_seconds')::integer where id=p_match_id;
 update inhouse_events set status='COMPLETED',updated_at=now() where id=(select event_id from inhouse_matches where id=p_match_id);
 update tournament_sessions set state='COMPLETE',last_error_code=null,updated_at=now() where match_id=p_match_id;
end $$;
revoke all on function public.reserve_tournament_session(uuid,text,jsonb,uuid),public.attach_tournament_code(uuid,text,bigint),public.record_tournament_callback(text,text,text),public.import_tournament_result(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_tournament_session(uuid,text,jsonb,uuid),public.attach_tournament_code(uuid,text,bigint),public.record_tournament_callback(text,text,text),public.import_tournament_result(uuid,text,jsonb) to service_role;

-- Code-bound matches cannot be changed by the existing manual update endpoints.
-- The scoped transaction marker is set only inside privileged import/attach functions.
create function public.guard_automatic_match() returns trigger language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if tg_table_name='inhouse_matches' then v_id=old.id; else v_id=old.match_id; end if;
 if exists(select 1 from tournament_sessions where match_id=v_id) and current_setting('huh.tournament_import',true) is distinct from v_id::text then raise exception 'Automatic match is locked' using errcode='22023'; end if;
 return new;
end $$;
create trigger guard_automatic_match before update on public.inhouse_matches for each row execute function public.guard_automatic_match();
create trigger guard_automatic_participant before update on public.match_participants for each row execute function public.guard_automatic_match();
revoke all on function public.guard_automatic_match() from public,anon,authenticated;
