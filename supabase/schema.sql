-- ════════════════════════════════════════════════════════════════
--  Ocean Quest • Schéma Supabase des bots Discord
--  À coller dans Supabase > SQL Editor > New query, puis « Run ».
-- ════════════════════════════════════════════════════════════════

create table if not exists public.tickets (
  id             bigint generated always as identity primary key,
  guild_id       text not null,
  channel_id     text unique,
  user_id        text not null,
  number         integer not null,
  type           text not null,
  status         text not null default 'open' check (status in ('open', 'closed', 'deleted')),
  subject        text,
  answers        jsonb not null default '{}'::jsonb,
  claimed_by     text,
  closed_by      text,
  close_reason   text,
  rating         smallint check (rating between 1 and 5),
  transcript_url text,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);
create index if not exists tickets_user_idx on public.tickets (guild_id, user_id, status);

create table if not exists public.warnings (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  user_id      text not null,
  moderator_id text not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists warnings_user_idx on public.warnings (guild_id, user_id);

create table if not exists public.mod_actions (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  action       text not null,
  user_id      text not null,
  moderator_id text not null,
  reason       text,
  duration_ms  bigint,
  created_at   timestamptz not null default now()
);

create table if not exists public.levels (
  guild_id   text not null,
  user_id    text not null,
  xp         integer not null default 0,
  level      integer not null default 0,
  messages   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);
create index if not exists levels_xp_idx on public.levels (guild_id, xp desc);

create table if not exists public.fishers (
  guild_id   text not null,
  user_id    text not null,
  coins      integer not null default 0,
  catches    integer not null default 0,
  collection jsonb not null default '{}'::jsonb,
  best_catch jsonb,
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table if not exists public.giveaways (
  id         bigint generated always as identity primary key,
  guild_id   text not null,
  channel_id text not null,
  message_id text unique,
  prize      text not null,
  winners    integer not null default 1,
  host_id    text not null,
  ends_at    timestamptz not null,
  ended      boolean not null default false,
  entrants   jsonb not null default '[]'::jsonb,
  winner_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_config (
  guild_id   text not null,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (guild_id, key)
);

-- ─── Sécurité (RLS) ──────────────────────────────────────────────
alter table public.tickets      enable row level security;
alter table public.warnings     enable row level security;
alter table public.mod_actions  enable row level security;
alter table public.levels       enable row level security;
alter table public.fishers      enable row level security;
alter table public.giveaways    enable row level security;
alter table public.guild_config enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.tickets, public.warnings, public.mod_actions, public.levels,
  public.fishers, public.giveaways, public.guild_config
  to service_role;

-- ─── Accès avec la clé « publishable » (sb_publishable_…) ─────────
-- Nécessaire si SUPABASE_KEY contient la clé publishable.
-- Recommandé : utilise plutôt la clé secrète (sb_secret_…) dans Render
-- et supprime ce bloc, car la clé publishable peut être exposée côté client.
grant select, insert, update, delete on
  public.tickets, public.warnings, public.mod_actions, public.levels,
  public.fishers, public.giveaways, public.guild_config
  to anon;

do $$
declare t text;
begin
  foreach t in array array['tickets', 'warnings', 'mod_actions', 'levels', 'fishers', 'giveaways', 'guild_config'] loop
    execute format('drop policy if exists "ocean_bot_anon_all" on public.%I', t);
    execute format('create policy "ocean_bot_anon_all" on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
