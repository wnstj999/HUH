create table if not exists public.app_settings (
  key text primary key,
  encrypted_value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from public, anon, authenticated;
grant all privileges on table public.app_settings to service_role;

comment on table public.app_settings is 'Server-only encrypted application settings. Never expose through browser RLS policies.';
