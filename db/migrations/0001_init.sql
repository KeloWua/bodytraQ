-- 0001_init.sql - first BodyTRAQ migration.
-- Applied manually by the repo owner (Neon SQL Editor or psql), never from the app.
--
-- Model (from the Figma reference, 8 nov 2026):
--   users   : one row per person; single-user for now, but everything is user-scoped.
--   entries : one dated record per user and day, with weight and extensible data.
--   photos  : front/back photos per entry; only metadata here, never the image bytes.
--             storage_path stays empty until the photo storage (0 EUR) is decided apart.

create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now()
);

create table if not exists entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    date date not null,
    weight_kg numeric(5,1) check (weight_kg is null or (weight_kg > 0 and weight_kg < 1000)),
    notes text,
    extra jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, date)
);

create table if not exists photos (
    id uuid primary key default gen_random_uuid(),
    entry_id uuid not null references entries(id) on delete cascade,
    view text not null check (view in ('front', 'back')),
    storage_path text,
    zoom numeric(5,2) not null default 1,
    rotation_degrees numeric(5,2) not null default 0,
    created_at timestamptz not null default now(),
    unique (entry_id, view)
);
