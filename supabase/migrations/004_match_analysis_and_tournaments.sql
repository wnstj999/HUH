-- 004_match_analysis_and_tournaments.sql
-- 일반 롤 전적(Match-v5) 캐시, 자체 전력 추정치, 커스텀 팀, 4/8/16강 토너먼트 브래킷 테이블

-- 1. Match-v5 전적 캐시 테이블 (중복 수집 방지)
create table if not exists public.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  puuid text not null,
  match_id text not null,
  queue_id integer not null, -- 420: 솔로랭크, 440: 자유랭크, 400/430: 일반 등
  queue_type text not null default 'SOLO', -- 'SOLO' | 'FLEX' | 'NORMAL'
  champion_id integer not null,
  champion_name text not null,
  position text not null, -- 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP' | 'UNKNOWN'
  win boolean not null,
  kills integer not null default 0,
  deaths integer not null default 0,
  assists integer not null default 0,
  cs integer not null default 0,
  gold_earned integer not null default 0,
  damage_to_champions integer not null default 0,
  vision_score integer not null default 0,
  game_duration integer not null default 0, -- 초 단위
  game_creation_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(puuid, match_id)
);

create index if not exists idx_player_match_stats_puuid on public.player_match_stats (puuid, game_creation_at desc);
create index if not exists idx_player_match_stats_queue on public.player_match_stats (puuid, queue_type);

-- 2. 설명 가능한 플레이어 전력 추정치 테이블
create table if not exists public.player_power_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade unique,
  overall_score numeric(6,1) not null, -- 종합 점수 (예: 1540.5)
  confidence_level text not null check (confidence_level in ('HIGH', 'MEDIUM', 'LOW')),
  confidence_reason text not null default '',
  sample_games_count integer not null default 0,
  evaluated_period_days integer not null default 30,
  -- 포지션별 세부 전력 점수
  top_score numeric(6,1),
  jug_score numeric(6,1),
  mid_score numeric(6,1),
  adc_score numeric(6,1),
  sup_score numeric(6,1),
  -- 포지션별 숙련 판수
  top_games integer not null default 0,
  jug_games integer not null default 0,
  mid_games integer not null default 0,
  adc_games integer not null default 0,
  sup_games integer not null default 0,
  -- 산출 근거 (JSON: 기본 티어 점수, 과거 최고 티어 보정, 최근 지표 보정, 가중치 내역 등)
  breakdown jsonb not null default '{}'::jsonb,
  model_version text not null default 'huh-v1.0',
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_power_ratings_player on public.player_power_ratings (player_id);

-- 3. 커스텀 팀 테이블 (자동 또는 수동 생성 팀 관리)
create table if not exists public.inhouse_custom_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default 'MANUAL' check (source in ('MANUAL', 'AUTO_BALANCED')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. 커스텀 팀 소속 선수 및 포지션
create table if not exists public.inhouse_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.inhouse_custom_teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  riot_id text not null, -- 직접 입력한 경우 또는 플레이어 연결
  player_name text not null,
  position text not null check (position in ('TOP', 'JUG', 'MID', 'ADC', 'SUP')),
  is_captain boolean not null default false,
  created_at timestamptz not null default now(),
  unique(team_id, position)
);

create index if not exists idx_team_members_team on public.inhouse_team_members (team_id);

-- 5. 토너먼트 테이블
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bracket_size integer not null check (bracket_size in (4, 8, 16)),
  format text not null default 'BO1' check (format in ('BO1', 'BO3', 'BO5')),
  seeding_type text not null default 'POWER_SEED' check (seeding_type in ('RANDOM', 'POWER_SEED', 'MANUAL')),
  status text not null default 'READY' check (status in ('READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  winner_team_id uuid references public.inhouse_custom_teams(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. 토너먼트 경기(브래킷 노드) 테이블
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null, -- 1: 16강/8강/4강 첫라운드, 라운드가 올라갈수록 결승에 가까워짐
  match_index integer not null, -- 라운드 내 경기 번호 (0-indexed)
  team1_id uuid references public.inhouse_custom_teams(id) on delete set null,
  team2_id uuid references public.inhouse_custom_teams(id) on delete set null,
  team1_score integer not null default 0,
  team2_score integer not null default 0,
  winner_team_id uuid references public.inhouse_custom_teams(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'BYE')),
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot text check (next_slot in ('team1', 'team2')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tournament_id, round_number, match_index)
);

create index if not exists idx_tournament_matches_tourney on public.tournament_matches (tournament_id, round_number);

-- RLS 활성화 및 권한 설정
alter table public.player_match_stats enable row level security;
alter table public.player_power_ratings enable row level security;
alter table public.inhouse_custom_teams enable row level security;
alter table public.inhouse_team_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_matches enable row level security;

-- service_role 전체 권한 부여
grant all privileges on table public.player_match_stats to service_role;
grant all privileges on table public.player_power_ratings to service_role;
grant all privileges on table public.inhouse_custom_teams to service_role;
grant all privileges on table public.inhouse_team_members to service_role;
grant all privileges on table public.tournaments to service_role;
grant all privileges on table public.tournament_matches to service_role;
