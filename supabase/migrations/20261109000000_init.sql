-- Bingo Salvaje — esquema inicial (migración de la CLI de Supabase: `supabase db push`).
-- Requisito: Authentication → Sign In / Providers → "Allow anonymous sign-ins" ACTIVADO.
-- Identidad para amigos: cada dispositivo tiene una sesión anónima (invisible) y al poner
-- tu nombre queda vinculada a él. El mismo nombre en otro dispositivo = el mismo jugador.

create extension if not exists pgcrypto;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'lobby' check (status in ('lobby','live','finished')),
  board_size int not null default 4 check (board_size between 3 and 5),
  candidates jsonb not null default '[]',
  referee_id uuid,
  created_at timestamptz not null default now()
);

-- nombres (la clave es el nombre normalizado: sin tildes ni mayúsculas)
create table if not exists profiles (
  key text primary key check (key ~ '^[a-z0-9._-]{3,20}$'),
  username text not null check (char_length(username) between 1 and 24),
  created_at timestamptz not null default now()
);

-- qué dispositivo (sesión anónima) va con qué nombre
create table if not exists profile_devices (
  auth_uid uuid primary key,
  key text not null references profiles(key) on delete cascade,
  linked_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  username_key text not null references profiles(key),
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now(),
  unique (room_id, username_key)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 120),
  candidate int,
  created_by uuid references players(id) on delete set null,
  happened_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null unique references players(id) on delete cascade,
  cells uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
-- un solo cante pendiente por evento
create unique index if not exists claims_one_pending on claims(item_id) where status = 'pending';

create table if not exists votes (
  claim_id uuid not null references claims(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  value boolean not null,
  primary key (claim_id, player_id)
);

-- ---------- helpers ----------
create or replace function my_key() returns text
language sql stable security definer set search_path = public as $$
  select key from profile_devices where auth_uid = auth.uid();
$$;

create or replace function is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where room_id = p_room and username_key = my_key());
$$;

create or replace function is_referee(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rooms r join players p on p.id = r.referee_id
    where r.id = p_room and p.username_key = my_key()
  );
$$;

create or replace function owns_player(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player and username_key = my_key());
$$;

-- ---------- RLS ----------
alter table rooms enable row level security;
alter table players enable row level security;
alter table items enable row level security;
alter table cards enable row level security;
alter table claims enable row level security;
alter table votes enable row level security;

-- Lectura: cualquiera con sesión (anónima) puede leer. El código de sala hace de "contraseña".
drop policy if exists "read rooms" on rooms;     create policy "read rooms"   on rooms   for select to authenticated using (true);
drop policy if exists "read players" on players; create policy "read players" on players for select to authenticated using (true);
drop policy if exists "read items" on items;     create policy "read items"   on items   for select to authenticated using (true);
drop policy if exists "read cards" on cards;     create policy "read cards"   on cards   for select to authenticated using (true);
drop policy if exists "read claims" on claims;   create policy "read claims"  on claims  for select to authenticated using (true);
drop policy if exists "read votes" on votes;     create policy "read votes"   on votes   for select to authenticated using (true);

-- Salas: crear cualquiera; modificar solo el árbitro (o el creador mientras no haya árbitro)
drop policy if exists "create rooms" on rooms;
create policy "create rooms" on rooms for insert to authenticated with check (true);
drop policy if exists "referee updates room" on rooms;
create policy "referee updates room" on rooms for update to authenticated
  using (is_referee(id) or (referee_id is null and is_member(id)))
  with check (true);

-- Jugadores: te apuntas tú, con tu nombre
drop policy if exists "join" on players;
create policy "join" on players for insert to authenticated with check (username_key = my_key());

-- Nombres: se leen; cada dispositivo ve solo su vínculo. Se escriben por claim_username().
alter table profiles enable row level security;
alter table profile_devices enable row level security;
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select to authenticated using (true);
drop policy if exists "own device" on profile_devices;
create policy "own device" on profile_devices for select to authenticated using (auth_uid = auth.uid());

-- Vincula este dispositivo a un nombre (lo crea si no existe)
create or replace function claim_username(p_key text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  insert into profiles (key, username) values (p_key, p_name)
    on conflict (key) do update set username = excluded.username;
  insert into profile_devices (auth_uid, key) values (auth.uid(), p_key)
    on conflict (auth_uid) do update set key = excluded.key, linked_at = now();
end $$;

-- "No soy yo": desvincula este dispositivo
create or replace function release_username() returns void
language sql security definer set search_path = public as $$
  delete from profile_devices where auth_uid = auth.uid();
$$;
grant execute on function claim_username(text, text) to authenticated;
grant execute on function release_username() to authenticated;

-- Eventos: los miembros añaden; borra quien lo creó (antes de empezar) o el árbitro
drop policy if exists "add items" on items;
create policy "add items" on items for insert to authenticated
  with check (is_member(room_id) and happened_at is null);
drop policy if exists "delete items" on items;
create policy "delete items" on items for delete to authenticated
  using (is_referee(room_id) or (owns_player(created_by) and happened_at is null));

-- Cartones: cada uno el suyo, y solo en el lobby
drop policy if exists "own card insert" on cards;
create policy "own card insert" on cards for insert to authenticated
  with check (owns_player(player_id) and exists (select 1 from rooms where id = room_id and status = 'lobby'));
drop policy if exists "own card update" on cards;
create policy "own card update" on cards for update to authenticated
  using (owns_player(player_id) and exists (select 1 from rooms where id = room_id and status = 'lobby'));

-- Cantes y votos
drop policy if exists "claim" on claims;
create policy "claim" on claims for insert to authenticated
  with check (
    owns_player(player_id) and status = 'pending'
    -- solo se canta lo que está en tu cartón; lo demás lo pita el árbitro
    and exists (select 1 from cards c where c.player_id = claims.player_id and claims.item_id = any (c.cells))
  );
drop policy if exists "vote" on votes;
create policy "vote" on votes for insert to authenticated with check (owns_player(player_id));
drop policy if exists "revote" on votes;
create policy "revote" on votes for update to authenticated using (owns_player(player_id));

-- ---------- acciones del árbitro (atómicas) ----------
create or replace function resolve_claim(p_claim uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claims where id = p_claim for update;
  if c is null or c.status <> 'pending' then return; end if;
  if not is_referee(c.room_id) then raise exception 'Solo el árbitro puede resolver cantes'; end if;
  update claims set status = case when p_accept then 'accepted' else 'rejected' end, resolved_at = now()
    where id = p_claim;
  if p_accept then
    update items set happened_at = coalesce(happened_at, now()) where id = c.item_id;
  end if;
end $$;

create or replace function set_happened(p_item uuid, p_happened boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  select room_id into r from items where id = p_item;
  if not is_referee(r) then raise exception 'Solo el árbitro puede marcar eventos'; end if;
  update items set happened_at = case when p_happened then coalesce(happened_at, now()) else null end
    where id = p_item;
  if p_happened then
    update claims set status = 'accepted', resolved_at = now() where item_id = p_item and status = 'pending';
  end if;
end $$;

grant execute on function resolve_claim(uuid, boolean) to authenticated;
grant execute on function set_happened(uuid, boolean) to authenticated;

-- ---------- histórico ----------
create table if not exists results (
  room_id uuid not null references rooms(id) on delete cascade,
  room_name text not null,
  player_name text not null,
  points int not null,
  position int not null,
  finished_at timestamptz not null default now(),
  primary key (room_id, player_name)
);
alter table results enable row level security;
drop policy if exists "read results" on results;
create policy "read results" on results for select to authenticated using (true);

-- el árbitro guarda la clasificación final (reemplaza la anterior si se reabre y se vuelve a cerrar)
create or replace function save_results(p_room uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_referee(p_room) then raise exception 'Solo el árbitro puede cerrar la partida'; end if;
  delete from results where room_id = p_room;
  insert into results (room_id, room_name, player_name, points, position)
    select p_room, r.room_name, r.player_name, r.points, r.position
    from jsonb_to_recordset(p_results) as r(room_name text, player_name text, points int, position int);
end $$;
grant execute on function save_results(uuid, jsonb) to authenticated;

-- ---------- tiempo real ----------
do $$
declare t text;
begin
  foreach t in array array['rooms','players','items','cards','claims','votes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
