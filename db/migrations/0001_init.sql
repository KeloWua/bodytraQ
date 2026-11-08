-- 0001_init.sql - first BodyTRAQ migration.
-- Applied manually by the repo owner (psql), never from the app.

create table if not exists sessions (
    id uuid primary key default gen_random_uuid(),
    date date not null unique,
    weight_kg numeric(5,1),
    notes text,
    created_at timestamptz not null default now()
);
