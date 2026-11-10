-- Beam data model on Supabase.
--
-- Mirrors the app's Base44 entities one table per entity, keeping the entity's
-- own field names and the original record ids so migrated rows keep every
-- relationship (session_id, device_id, created_by_id) intact.
--
-- Idempotent: safe to run on an existing project, it only adds what is missing.

-- ---------------------------------------------------------------- profiles --
-- One row per person. `id` keeps the Base44 user id so records that point at a
-- person by id stay valid; `auth_user_id` links it to Supabase Auth.
create table if not exists public.profiles (
  id text primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  omnicast_device_id text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ------------------------------------------------------------------ tables --
create table if not exists public.beam_media (
  id text primary key,
  session_id text not null,
  kind text not null default 'image' check (kind in ('image', 'video')),
  file_uri text not null,
  title text,
  sender_name text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.cast_sessions (
  id text primary key,
  code text not null,
  mode text not null default 'mirror' check (mode in ('mirror', 'help')),
  host_id text,
  host_name text,
  status text not null default 'live' check (status in ('live', 'ended')),
  allow_pointing boolean not null default true,
  viewer_count int not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.control_inputs (
  id text primary key,
  session_id text not null,
  kind text not null check (kind in ('move', 'click', 'key', 'scroll')),
  from_role text check (from_role in ('host', 'guest')),
  x numeric,
  y numeric,
  payload text,
  delivered boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.device_agents (
  id text primary key,
  device_id text not null,
  label text,
  platform text check (platform in ('windows', 'macos', 'linux')),
  os_detail text,
  version text,
  status text not null default 'pairing' check (status in ('pairing', 'online', 'offline', 'revoked')),
  unattended_enabled boolean not null default false,
  allow_pointer boolean not null default true,
  allow_keyboard boolean not null default true,
  allow_clipboard boolean not null default false,
  last_seen text,
  pair_secret text,
  secret_hash text,
  access_hash text,
  failed_attempts int not null default 0,
  locked_until text,
  readiness text not null default 'unknown'
    check (readiness in ('ready', 'input-only', 'needs-permission', 'unsupported', 'unknown')),
  readiness_note text,
  capture_ready boolean not null default false,
  input_ready boolean not null default false,
  ready_at text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.device_sessions (
  id text primary key,
  device_id text not null,
  device_label text,
  owner_id text,
  session_id text not null,
  code text,
  kind text check (kind in ('attended', 'unattended')),
  operator_id text,
  operator_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'ended')),
  control_holder text check (control_holder in ('operator', 'owner')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

-- The single-use pairing PIN for an attended session. The companion on the
-- computer generates the six digits and shows them there; only a salted hash is
-- kept here. Row level security is on with no policies, so no browser can read
-- this table: every guess is counted by the device service instead of being
-- checked offline against a hash a phone could fetch.
create table if not exists public.device_pairings (
  id text primary key,
  device_session_id text not null unique,
  device_id text not null,
  pin_hash text not null,
  salt text not null,
  attempts integer not null default 0,
  state text not null default 'live' check (state in ('live', 'used', 'locked')),
  expires_at timestamptz not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- A short-lived help code, so someone who is not the owner can ask to help this
-- computer. Only the owner mints one, it works once and it expires. Only a salted
-- digest is stored here, and there are no policies below, so no browser can read a
-- code or test guesses against it — the device service checks every attempt.
create table if not exists public.device_support_codes (
  id text primary key,
  device_agent_id text not null unique,
  device_id text not null,
  owner_id text not null,
  code_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.helper_devices (
  id text primary key,
  session_id text not null,
  token text not null,
  label text,
  platform text,
  owner_role text check (owner_role in ('host', 'guest')),
  control_holder text check (control_holder in ('host', 'guest')),
  status text not null default 'waiting' check (status in ('waiting', 'connected', 'revoked')),
  last_seen text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.helper_pings (
  id text primary key,
  session_id text not null,
  device_id text not null,
  label text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.room_events (
  id text primary key,
  session_id text not null,
  kind text not null check (kind in ('pointer', 'click', 'note')),
  x numeric,
  y numeric,
  sender_name text,
  text text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.room_messages (
  id text primary key,
  session_id text not null,
  sender_id text,
  sender_name text,
  text text not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

create table if not exists public.session_signals (
  id text primary key,
  session_id text not null,
  kind text not null check (kind in ('viewer-hello', 'sdp-offer', 'sdp-answer', 'host-stop', 'join-request', 'join-accept', 'join-decline', 'control-set')),
  from_role text not null check (from_role in ('host', 'viewer')),
  viewer_key text,
  payload text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  created_by text,
  is_sample boolean not null default false
);

-- ---------------------------------------------------------------- indexing --
-- Every hot path in the app filters on the session and reads newest-first.
create index if not exists beam_media_session_idx on public.beam_media (session_id, created_date desc);
create index if not exists cast_sessions_code_idx on public.cast_sessions (code, status);
create index if not exists cast_sessions_created_idx on public.cast_sessions (created_date desc);
create index if not exists control_inputs_undelivered_idx on public.control_inputs (session_id, delivered, created_date);
create index if not exists device_agents_device_idx on public.device_agents (device_id);
create index if not exists device_sessions_device_idx on public.device_sessions (device_id, status);
create index if not exists device_pairings_session_idx on public.device_pairings (device_session_id);
create index if not exists device_support_codes_device_idx on public.device_support_codes (device_agent_id);
create index if not exists device_support_codes_expiry_idx on public.device_support_codes (expires_at);
create index if not exists device_sessions_session_idx on public.device_sessions (session_id);
create index if not exists helper_devices_token_idx on public.helper_devices (token);
create index if not exists helper_pings_session_idx on public.helper_pings (session_id, created_date desc);
create index if not exists room_events_session_idx on public.room_events (session_id, created_date desc);
create index if not exists room_messages_session_idx on public.room_messages (session_id, created_date desc);
create index if not exists session_signals_session_idx on public.session_signals (session_id, created_date desc);

-- -------------------------------------------------------------- timestamps --
create or replace function public.touch_updated_date() returns trigger
language plpgsql as $$
begin
  new.updated_date := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'beam_media', 'cast_sessions', 'control_inputs', 'device_agents',
    'device_sessions', 'device_pairings', 'device_support_codes', 'helper_devices', 'helper_pings', 'room_events',
    'room_messages', 'session_signals'
  ]
  loop
    execute format('drop trigger if exists touch_updated_date on public.%I', t);
    execute format(
      'create trigger touch_updated_date before update on public.%I for each row execute function public.touch_updated_date()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------- access helpers --
-- The signed-in person's profile id (the migrated Base44 user id).
create or replace function public.current_profile_id() returns text
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.auth_user_id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------- RLS --
-- Everyone signed in can read the shared session surface (a room is shared by
-- design). Writes are limited to the person who owns the row, admins, or — for
-- the signalling/relay tables — any signed-in participant of that room.
alter table public.profiles enable row level security;
alter table public.beam_media enable row level security;
alter table public.cast_sessions enable row level security;
alter table public.control_inputs enable row level security;
alter table public.device_agents enable row level security;
alter table public.device_sessions enable row level security;
-- Deliberately has no policies: the pairing PIN is only ever read by the device
-- service, which runs with the service-role key.
alter table public.device_pairings enable row level security;
revoke all on public.device_pairings from anon, authenticated;
-- Same rule for the help code: minted and checked only by the device service.
alter table public.device_support_codes enable row level security;
revoke all on public.device_support_codes from anon, authenticated;
alter table public.helper_devices enable row level security;
alter table public.helper_pings enable row level security;
alter table public.room_events enable row level security;
alter table public.room_messages enable row level security;
alter table public.session_signals enable row level security;

do $$
declare
  t text;
  -- profiles are keyed by person, not by row owner, so they are handled below.
  read_tables text[] := array[
    'beam_media', 'cast_sessions', 'control_inputs', 'device_agents',
    'device_sessions', 'helper_devices', 'helper_pings', 'room_events',
    'room_messages', 'session_signals'
  ];
  -- tables a signed-in participant may update freely (delivery flags, presence)
  open_tables text[] := array['control_inputs', 'helper_devices', 'helper_pings', 'device_sessions'];
begin
  foreach t in array read_tables
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (created_by_id is null or created_by_id = public.current_profile_id())',
      t || '_insert', t
    );
  end loop;

  foreach t in array open_tables
  loop
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
  end loop;

  foreach t in array read_tables
  loop
    continue when t = any (open_tables);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (created_by_id = public.current_profile_id() or public.is_admin()) with check (created_by_id = public.current_profile_id() or public.is_admin())',
      t || '_update', t
    );
  end loop;

  foreach t in array read_tables
  loop
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (created_by_id = public.current_profile_id() or public.is_admin())',
      t || '_delete', t
    );
  end loop;
end;
$$;

-- profiles: everyone signed in can look people up; a person may edit their own
-- row and an admin may edit anyone's. Rows are created by the signup trigger
-- below (or by the migration), never directly by a browser.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (auth_user_id = auth.uid() or public.is_admin())
  with check (auth_user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using (public.is_admin());

-- A new signup gets its profile straight away, with the auth id as its own id.
create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, auth_user_id, email, full_name)
  values (
    new.id::text,
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        email = excluded.email
    where public.profiles.auth_user_id is distinct from excluded.auth_user_id;
  return new;
end;
$$;

drop trigger if exists create_profile_for_new_user on auth.users;
create trigger create_profile_for_new_user
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- ---------------------------------------------------------------- realtime --
-- The room surface (signals, chat, pointer events, media) drives live views.
do $$
declare
  t text;
begin
  foreach t in array array[
    'beam_media', 'cast_sessions', 'control_inputs', 'device_agents',
    'device_sessions', 'helper_devices', 'helper_pings', 'room_events',
    'room_messages', 'session_signals'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
