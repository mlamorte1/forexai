-- ============================================
-- FOREXAI — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable pgvector for RAG (Sprint 2.5)
create extension if not exists vector;

-- ============================================
-- PROFILES
-- ============================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================
-- OANDA CONFIGS
-- ============================================
create table if not exists oanda_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key text not null,
  account_id text not null,
  environment text not null default 'practice' check (environment in ('practice', 'live')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table oanda_configs enable row level security;

create policy "Users manage own Oanda config"
  on oanda_configs for all using (auth.uid() = user_id);

-- ============================================
-- WATCHED PAIRS
-- ============================================
create table if not exists watched_pairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null,
  active boolean default true,
  created_at timestamptz default now()
);

alter table watched_pairs enable row level security;

create policy "Users manage own watched pairs"
  on watched_pairs for all using (auth.uid() = user_id);

-- ============================================
-- ALERTS
-- ============================================
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null,
  signal text not null check (signal in ('BUY', 'SELL', 'WAIT')),
  confidence integer not null check (confidence between 0 and 100),
  entry numeric(12,5),
  stop_loss numeric(12,5),
  take_profit numeric(12,5),
  timeframe text,
  reasoning text,
  email_sent boolean default false,
  created_at timestamptz default now()
);

alter table alerts enable row level security;

create policy "Users view own alerts"
  on alerts for select using (auth.uid() = user_id);

create policy "Service role inserts alerts"
  on alerts for insert with check (true);

-- ============================================
-- USER PREFERENCES
-- ============================================
create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  min_confidence integer default 70 check (min_confidence between 0 and 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table user_preferences enable row level security;

create policy "Users manage own preferences"
  on user_preferences for all using (auth.uid() = user_id);

-- ============================================
-- TACTICS (Sprint 2.5 — RAG)
-- ============================================
create table if not exists tactics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tactics enable row level security;

create policy "Users manage own tactics"
  on tactics for all using (auth.uid() = user_id);

-- RAG similarity search function
create or replace function match_tactics(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable as $$
  select
    tactics.id,
    tactics.title,
    tactics.content,
    1 - (tactics.embedding <=> query_embedding) as similarity
  from tactics
  where tactics.user_id = p_user_id
    and tactics.embedding is not null
    and 1 - (tactics.embedding <=> query_embedding) > match_threshold
  order by tactics.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================
-- CHAT SESSIONS (Sprint 3)
-- ============================================
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table chat_sessions enable row level security;

create policy "Users manage own chat sessions"
  on chat_sessions for all using (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
create index if not exists alerts_user_created on alerts(user_id, created_at desc);
create index if not exists tactics_user_id on tactics(user_id);
create index if not exists watched_pairs_user_active on watched_pairs(user_id, active);
