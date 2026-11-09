-- Persistencia de referencia. Dos reglas para todo el esquema:
--   1. Una escritura de UNA fila va directa a la tabla y la protegen RLS + restricciones.
--   2. Lo que son VARIAS escrituras que van juntas es una función: una transacción, todo o nada.
-- La base de datos es la que garantiza que los datos son coherentes; el cliente no tiene que acertar.

-- ---------- integridad: todo lo de una sala apunta a cosas de esa misma sala ----------
alter table players add constraint players_id_room unique (id, room_id);
alter table items   add constraint items_id_room   unique (id, room_id);

alter table rooms  add constraint rooms_referee_in_room foreign key (referee_id, id) references players (id, room_id);
alter table cards  add constraint cards_player_in_room  foreign key (player_id, room_id) references players (id, room_id);
alter table claims add constraint claims_player_in_room foreign key (player_id, room_id) references players (id, room_id);
alter table claims add constraint claims_item_in_room   foreign key (item_id, room_id)   references items (id, room_id);

-- ---------- cartones ----------
-- cells: board_size² posiciones fila a fila; null = casilla vacía (un uuid[] no admite '').
-- Cada id no nulo es un evento de la sala y no se repite. updated_at lo pone el servidor.
create or replace function check_card() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select board_size * board_size into n from rooms where id = new.room_id;
  if coalesce(array_length(new.cells, 1), 0) <> n then
    raise exception 'El cartón debe tener % casillas', n using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(new.cells) as c(id)
    where c.id is not null and not exists (select 1 from items i where i.id = c.id and i.room_id = new.room_id)
  ) then
    raise exception 'El cartón tiene eventos que no son de esta sala' using errcode = 'foreign_key_violation';
  end if;
  if (select count(id) <> count(distinct id) from unnest(new.cells) as c(id)) then
    raise exception 'Un evento no puede estar dos veces en el cartón' using errcode = 'unique_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists check_card on cards;
create trigger check_card before insert or update on cards for each row execute function check_card();
revoke delete on cards from authenticated, anon;

-- ---------- salas ----------
-- Se crean solo con create_room(). Del resto, el árbitro solo cambia la fase y el silbato.
drop policy if exists "create rooms" on rooms;
revoke insert, update, delete on rooms from authenticated, anon;
grant update (status, referee_id) on rooms to authenticated;
drop policy if exists "referee updates room" on rooms;
create policy "referee updates room" on rooms for update to authenticated
  using (is_referee(id)) with check (true); -- el silbato solo puede ir a alguien de la sala (FK rooms_referee_in_room)

-- tu fila de jugador en una sala (null si no estás)
create or replace function my_player(p_room uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where room_id = p_room and username_key = my_key();
$$;

-- Sala + tú como jugador y árbitro + banco de eventos inicial, de una vez.
create or replace function create_room(p_name text, p_candidates jsonb, p_board_size int, p_items jsonb)
returns rooms
language plpgsql security definer set search_path = public as $$
declare
  k text := my_key();
  r rooms;
  p uuid;
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin 0/O ni 1/I/L
begin
  if k is null then raise exception 'Pon tu nombre primero'; end if;
  loop
    begin
      insert into rooms (code, name, candidates, board_size)
      values ((select string_agg(substr(abc, 1 + floor(random() * length(abc))::int, 1), '') from generate_series(1, 5)),
              p_name, p_candidates, p_board_size)
      returning * into r;
      exit;
    exception when unique_violation then -- el código ya existía: otro
    end;
  end loop;
  insert into players (room_id, username_key, name)
    select r.id, k, username from profiles where key = k
    returning id into p;
  update rooms set referee_id = p where id = r.id returning * into r;
  insert into items (room_id, text, candidate)
    select r.id, i.text, i.candidate from jsonb_to_recordset(p_items) as i(text text, candidate int);
  return r;
end $$;

-- Entrar en una sala (idempotente: si ya estabas, te devuelve tu jugador).
drop policy if exists "join" on players;
revoke insert, update, delete on players from authenticated, anon;
create or replace function join_room(p_code text) returns players
language plpgsql security definer set search_path = public as $$
declare k text := my_key(); r uuid; p players;
begin
  if k is null then raise exception 'Pon tu nombre primero'; end if;
  select id into r from rooms where code = upper(p_code);
  if r is null then raise exception 'No existe ninguna sala con ese código'; end if;
  insert into players (room_id, username_key, name)
    select r, k, username from profiles where key = k
    on conflict (room_id, username_key) do nothing;
  select * into p from players where room_id = r and username_key = k;
  return p;
end $$;

-- ---------- eventos ----------
-- Los añade un miembro, a su nombre (no al de otro).
drop policy if exists "add items" on items;
create policy "add items" on items for insert to authenticated
  with check (is_member(room_id) and owns_player(created_by) and happened_at is null);
revoke update, delete on items from authenticated, anon;

-- ---------- cantes ----------
-- Cantar = abrir el cante, o sumarte con un voto a favor si ya había uno pendiente.
drop policy if exists "claim" on claims;
revoke insert, update, delete on claims from authenticated, anon;
create or replace function claim_item(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  it items;
  me uuid;
  c uuid;
begin
  select * into it from items where id = p_item;
  if it is null then raise exception 'Ese evento no existe'; end if;
  me := my_player(it.room_id);
  if me is null then raise exception 'No estás en esta sala'; end if;
  if (select status from rooms where id = it.room_id) <> 'live' then raise exception 'La partida no está en juego'; end if;
  if it.happened_at is not null then return; end if; -- ya validado: nada que cantar
  -- solo se canta lo que está en tu cartón; lo demás lo pita el árbitro
  if not exists (select 1 from cards where player_id = me and p_item = any (cells)) then
    raise exception 'Ese evento no está en tu cartón';
  end if;
  insert into claims (room_id, item_id, player_id) values (it.room_id, p_item, me)
    on conflict (item_id) where status = 'pending' do nothing;
  if not found then
    select id into c from claims where item_id = p_item and status = 'pending' and player_id <> me;
    if c is null then return; end if; -- el cante pendiente ya es tuyo
    insert into votes (claim_id, player_id, value) values (c, me, true)
      on conflict (claim_id, player_id) do update set value = true;
  end if;
end $$;

-- Votar: solo en cantes pendientes de tu sala.
drop policy if exists "vote" on votes;
create policy "vote" on votes for insert to authenticated with check (
  owns_player(player_id)
  and exists (select 1 from claims c join players p on p.room_id = c.room_id
              where c.id = claim_id and p.id = player_id and c.status = 'pending'));
drop policy if exists "revote" on votes;
create policy "revote" on votes for update to authenticated
  using (owns_player(player_id))
  with check (exists (select 1 from claims c where c.id = claim_id and c.status = 'pending'));
revoke delete on votes from authenticated, anon;

-- ---------- cierre ----------
-- Guardar la clasificación y cerrar la partida van juntos.
drop function if exists save_results(uuid, jsonb);
create or replace function finish_room(p_room uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_referee(p_room) then raise exception 'Solo el árbitro puede cerrar la partida'; end if;
  delete from results where room_id = p_room;
  insert into results (room_id, room_name, player_name, points, position)
    select p_room, r.room_name, r.player_name, r.points, r.position
    from jsonb_to_recordset(p_results) as r(room_name text, player_name text, points int, position int);
  update rooms set status = 'finished' where id = p_room;
end $$;

-- las funciones no se ejecutan sin sesión
revoke execute on function create_room(text, jsonb, int, jsonb), join_room(text), claim_item(uuid),
  finish_room(uuid, jsonb), my_player(uuid) from public, anon;
grant execute on function create_room(text, jsonb, int, jsonb), join_room(text), claim_item(uuid),
  finish_room(uuid, jsonb), my_player(uuid) to authenticated;
