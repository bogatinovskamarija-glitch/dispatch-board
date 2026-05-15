-- Run this in your Supabase dashboard → SQL Editor

create table if not exists loads (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  company         text not null check (company in ('carat', 'pro_freight')),
  status          text not null default 'empty'
                    check (status in ('covered', 'empty', 'home', 'broken', 'no_driver')),
  truck_number    text,
  trailer_number  text,
  equipment_type  text check (equipment_type in ('REEF', 'V-VAN', 'E-tracks')),
  is_tanker       boolean default false,
  driver_name     text,
  driver_clickup_id text,
  phone           text,
  pickup_location text,
  delivery_location text,
  zip             text,
  delivery_date   date,
  delivery_appt   text,
  load_number     text,
  broker          text,
  total_miles     integer,
  price           numeric(10,2),
  safety_notes    text,
  notes           text,
  hometown        text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-update updated_at on every row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger loads_updated_at
  before update on loads
  for each row execute procedure set_updated_at();

-- Index for the two most common query patterns
create index on loads (date);
create index on loads (company, date);
