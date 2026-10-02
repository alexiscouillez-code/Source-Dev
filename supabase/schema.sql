-- Trail Survival
-- Schéma prêt pour une synchro ultérieure.
-- Aucun utilisateur, aucune course réelle et aucune donnée de démo ne sont insérés.
-- L'application joue et sauvegarde en local tant que l'authentification n'est pas branchée.
-- `users` = auth.users (Supabase Auth), pas une table publique.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0 and xp < 100),
  skill_points integer not null default 0 check (skill_points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  id text primary key,
  name text not null,
  fictional boolean not null default true,
  distance_km numeric not null check (distance_km > 0),
  elevation_gain_m integer not null check (elevation_gain_m >= 0),
  start_altitude_m integer not null,
  difficulty integer not null check (difficulty between 1 and 5),
  terrain_summary text not null,
  weather_summary text not null,
  source text not null default 'fictional'
);

create table if not exists public.race_segments (
  id text primary key,
  race_id text not null references public.races (id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  start_km numeric not null,
  end_km numeric not null,
  elevation_gain integer not null,
  elevation_loss integer not null,
  slope numeric not null,
  terrain_type text not null,
  difficulty integer not null check (difficulty between 1 and 5),
  weather text not null,
  night boolean not null default false,
  aid_at_end boolean not null default false,
  unique (race_id, position)
);

create table if not exists public.equipment (
  id text primary key,
  name text not null,
  type text not null check (type in ('shoes', 'pack', 'poles', 'jacket', 'lamp')),
  weight integer not null,
  grip integer not null,
  comfort integer not null,
  protection integer not null,
  energy_bonus integer not null,
  hydration_bonus integer not null,
  terrain_bonus integer not null,
  unlock_level integer not null default 1
);

create table if not exists public.player_equipment (
  user_id uuid not null references auth.users (id) on delete cascade,
  equipment_id text not null references public.equipment (id),
  owned boolean not null default true,
  equipped boolean not null default false,
  primary key (user_id, equipment_id)
);

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  endurance integer not null,
  montagne integer not null,
  descente integer not null,
  resistance integer not null,
  mental integer not null
);

create table if not exists public.progression (
  user_id uuid not null references auth.users (id) on delete cascade,
  branch text not null check (branch in ('ENDURANCE', 'MONTAGNE', 'DESCENTE', 'MENTAL', 'ULTRA')),
  rank integer not null default 0 check (rank between 0 and 5),
  primary key (user_id, branch)
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  race_id text not null references public.races (id),
  number integer not null,
  status text not null check (status in ('FINISH', 'DNF', 'ABANDON')),
  distance_km numeric not null,
  elapsed_minutes numeric not null,
  elevation_gain integer not null,
  energy integer not null,
  hydration integer not null,
  fatigue integer not null,
  mental integer not null,
  xp_gained integer not null,
  level_before integer not null,
  level_after integer not null,
  dnf_reason text,
  created_at timestamptz not null default now()
);

create index if not exists runs_user_created_idx on public.runs (user_id, created_at desc);

create table if not exists public.run_segments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  segment_index integer not null,
  action text not null,
  minutes numeric not null,
  pace_min_per_km numeric not null,
  energy_after integer not null,
  hydration_after integer not null,
  fatigue_after integer not null,
  mental_after integer not null,
  incident text
);

create index if not exists run_segments_run_idx on public.run_segments (run_id, segment_index);

create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  segment_index integer not null,
  event_id text not null,
  choice_id text not null,
  note text,
  consequence jsonb not null default '{}'::jsonb
);

create index if not exists run_events_run_idx on public.run_events (run_id, segment_index);

alter table public.profiles enable row level security;
alter table public.races enable row level security;
alter table public.race_segments enable row level security;
alter table public.equipment enable row level security;
alter table public.player_equipment enable row level security;
alter table public.player_stats enable row level security;
alter table public.progression enable row level security;
alter table public.runs enable row level security;
alter table public.run_segments enable row level security;
alter table public.run_events enable row level security;

-- Pas de politique ouverte : sans authentification branchée, le client ne lit rien ici.
