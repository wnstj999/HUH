create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  riot_game_name text not null,
  riot_tag_line text not null,
  riot_id text not null,
  puuid text,
  inhouse_tier text not null check (inhouse_tier in ('TR','GR','LR','UR','SR','S','A','B','C','D','F','FF')),
  inhouse_score integer not null check (inhouse_score between 4 and 15),
  positions text[] not null check (cardinality(positions) > 0),
  current_solo_tier text,
  current_solo_division text,
  current_solo_lp integer,
  current_solo_wins integer,
  current_solo_losses integer,
  current_solo_win_rate numeric(5,1),
  riot_last_updated_at timestamptz,
  historical_solo_tier text,
  historical_solo_division text,
  historical_solo_lp integer,
  historical_solo_season text,
  historical_flex_tier text,
  historical_flex_division text,
  historical_flex_lp integer,
  historical_flex_season text,
  historical_rank_last_updated_at timestamptz,
  participating boolean not null default false,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_riot_id_unique on public.players (lower(riot_game_name), lower(riot_tag_line));
create unique index if not exists players_puuid_unique on public.players (puuid) where puuid is not null;
create index if not exists players_participating_idx on public.players (participating) where active = true;

create table if not exists public.inhouse_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','IN_PROGRESS','COMPLETED','CANCELLED')),
  participant_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_participants (
  event_id uuid not null references public.inhouse_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

create table if not exists public.inhouse_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.inhouse_events(id) on delete cascade,
  tournament_code text,
  riot_game_id text unique,
  winner_team text check (winner_team in ('BLUE','RED')),
  status text not null default 'READY' check (status in ('READY','IN_PROGRESS','COMPLETED','CANCELLED')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.inhouse_matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team text not null check (team in ('BLUE','RED')),
  position text not null check (position in ('TOP','JUG','MID','ADC','SUP')),
  champion_id integer,
  champion_name text,
  win boolean,
  kills integer,
  deaths integer,
  assists integer,
  cs integer,
  gold integer,
  damage_to_champions integer,
  vision_score integer,
  unique (match_id, player_id),
  unique (match_id, team, position)
);

alter table public.players enable row level security;
alter table public.inhouse_events enable row level security;
alter table public.event_participants enable row level security;
alter table public.inhouse_matches enable row level security;
alter table public.match_participants enable row level security;

create or replace function public.create_inhouse_event(p_name text, p_player_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event_id uuid;
begin
  if nullif(trim(p_name), '') is null then raise exception 'Event name is required'; end if;
  if cardinality(p_player_ids) <> (select count(distinct id) from unnest(p_player_ids) as id) then raise exception 'Duplicate players are not allowed'; end if;
  insert into inhouse_events (name, status, participant_count) values (trim(p_name), 'DRAFT', cardinality(p_player_ids)) returning id into v_event_id;
  insert into event_participants (event_id, player_id) select v_event_id, unnest(p_player_ids);
  return v_event_id;
end $$;

create or replace function public.create_inhouse_match(p_event_name text, p_assignments jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_match_id uuid;
begin
  if nullif(trim(p_event_name), '') is null then raise exception 'Event name is required'; end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then raise exception 'Assignments must be a JSON array'; end if;
  if jsonb_array_length(p_assignments) <> 10 then raise exception 'Exactly 10 assignments are required'; end if;
  if (select count(distinct item->>'playerId') from jsonb_array_elements(p_assignments) item) <> 10 then raise exception 'Duplicate players are not allowed'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_assignments) item
    left join players p on p.id = (item->>'playerId')::uuid
    where p.id is null or not p.active or not ((item->>'position') = any(p.positions))
  ) then raise exception 'Invalid player or position assignment'; end if;
  if exists (
    select 1 from (values ('BLUE'), ('RED')) team(value)
    cross join (values ('TOP'), ('JUG'), ('MID'), ('ADC'), ('SUP')) pos(value)
    where (select count(*) from jsonb_array_elements(p_assignments) item where item->>'team'=team.value and item->>'position'=pos.value) <> 1
  ) then raise exception 'Every team position must be assigned exactly once'; end if;

  insert into inhouse_events (name, status, participant_count) values (trim(p_event_name), 'READY', 10) returning id into v_event_id;
  insert into event_participants (event_id, player_id)
    select v_event_id, (item->>'playerId')::uuid from jsonb_array_elements(p_assignments) item;
  insert into inhouse_matches (event_id, status) values (v_event_id, 'READY') returning id into v_match_id;
  insert into match_participants (match_id, player_id, team, position)
    select v_match_id, (item->>'playerId')::uuid, item->>'team', item->>'position' from jsonb_array_elements(p_assignments) item;
  return v_match_id;
end $$;

revoke all on function public.create_inhouse_event(text, uuid[]) from public, anon, authenticated;
revoke all on function public.create_inhouse_match(text, jsonb) from public, anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on table public.players, public.inhouse_events, public.event_participants, public.inhouse_matches, public.match_participants to service_role;
grant execute on function public.create_inhouse_event(text, uuid[]) to service_role;
grant execute on function public.create_inhouse_match(text, jsonb) to service_role;
