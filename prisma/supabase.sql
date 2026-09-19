-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- to set up the schema that the Prisma models in prisma/schema.prisma map to.
--
-- This is the same schema Prisma will manage going forward via
-- `npx prisma migrate deploy` (see prisma/migrations/20260919000000_init).
-- Running it here first lets you inspect/tweak it in the Supabase dashboard;
-- Prisma Migrate will then see it already applied as long as you also run
-- `npx prisma migrate resolve --applied 20260919000000_init` once, OR you can
-- skip this file entirely and just run `npx prisma migrate deploy` directly.

-- ── Enums ────────────────────────────────────────────────────────────────

create type verification_code_purpose as enum ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- ── Tables ───────────────────────────────────────────────────────────────

create table users (
    id                 uuid primary key default gen_random_uuid(),
    email              text not null unique,
    username           text not null unique,
    password_hash      text not null,
    created_at         timestamp(3) not null default current_timestamp,
    updated_at         timestamp(3) not null default current_timestamp,
    email_verified_at  timestamp(3)
);

create table sessions (
    id          uuid primary key default gen_random_uuid(),
    token_hash  text not null unique,
    user_id     uuid not null references users (id) on delete cascade,
    user_agent  text,
    ip_address  text,
    created_at  timestamp(3) not null default current_timestamp,
    expires_at  timestamp(3) not null
);

create index sessions_user_id_idx on sessions (user_id);

create table verification_codes (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    purpose     verification_code_purpose not null,
    code_hash   text not null,
    created_at  timestamp(3) not null default current_timestamp,
    expires_at  timestamp(3) not null,
    used_at     timestamp(3)
);

create index verification_codes_user_id_purpose_idx on verification_codes (user_id, purpose);

-- ── Keep users.updated_at current on every UPDATE ──────────────────────────
-- (Prisma's @updatedAt only sets this when the row is updated via Prisma
-- Client; this trigger also covers updates made directly in SQL/Studio.)

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$ language plpgsql;

create trigger users_set_updated_at
before update on users
for each row
execute function set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────
-- This app is not using the Supabase client SDK or its auth.uid()-based
-- policies — Prisma connects with the Postgres connection string and does
-- all authorization in the Next.js server code. Enable RLS with no policies
-- so these tables stay unreachable via the Supabase anon/service REST & realtime
-- APIs, and are only reachable through the direct Postgres connection Prisma uses.

alter table users enable row level security;
alter table sessions enable row level security;
alter table verification_codes enable row level security;
