alter table public.players
  add column if not exists historical_rank_history jsonb not null default '{"solo": [], "flex": []}'::jsonb;

grant all privileges on table public.players to service_role;
