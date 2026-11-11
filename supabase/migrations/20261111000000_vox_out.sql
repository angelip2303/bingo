-- Vox se baja del debate. El candidato se queda en la sala (los eventos apuntan a él por
-- índice) pero con "out": true, y nada suyo puede estar en un cartón ni contar.

-- el candidato p_idx de la sala se ha bajado del debate
create or replace function candidate_out(p_room uuid, p_idx int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (candidates -> p_idx ->> 'out')::boolean from rooms where id = p_room), false);
$$;

-- 1. Marcar a VOX como fuera en todas las salas
update rooms r set candidates = (
  select jsonb_agg(case when c ->> 'party' = 'VOX' then c || '{"out": true}' else c end order by ord)
  from jsonb_array_elements(r.candidates) with ordinality as t(c, ord)
)
where r.candidates @> '[{"party": "VOX"}]';

-- 2. Sus eventos no han pasado ni pueden pasar: fuera cantes (y sus votos en cascada) y sellos
delete from claims cl using items i
  where cl.item_id = i.id and candidate_out(i.room_id, i.candidate);
update items set happened_at = null
  where happened_at is not null and candidate_out(room_id, candidate);

-- 3. Vaciar sus casillas en todos los cartones (quedan como hueco)
update cards cd set cells = (
  select array_agg(case when i.id is not null and candidate_out(cd.room_id, i.candidate) then null else u.id end order by u.ord)
  from unnest(cd.cells) with ordinality as u(id, ord)
  left join items i on i.id = u.id
)
where exists (
  select 1 from unnest(cd.cells) as u(id) join items i on i.id = u.id
  where candidate_out(cd.room_id, i.candidate)
);

-- 4. Y que no vuelvan: el cartón no admite eventos de un candidato que se ha bajado
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
  if exists (
    select 1 from unnest(new.cells) as c(id) join items i on i.id = c.id
    where candidate_out(new.room_id, i.candidate)
  ) then
    raise exception 'Ese candidato se ha bajado del debate' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ni se escriben eventos nuevos suyos
drop policy if exists "add items" on items;
create policy "add items" on items for insert to authenticated
  with check (is_member(room_id) and owns_player(created_by) and happened_at is null
              and not candidate_out(room_id, candidate));

-- ni se pitan
create or replace function set_happened(p_item uuid, p_happened boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r uuid; c int;
begin
  select room_id, candidate into r, c from items where id = p_item;
  if not is_referee(r) then raise exception 'Solo el árbitro puede marcar eventos'; end if;
  if p_happened and candidate_out(r, c) then raise exception 'Ese candidato se ha bajado del debate'; end if;
  update items set happened_at = case when p_happened then coalesce(happened_at, now()) else null end
    where id = p_item;
  if p_happened then
    update claims set status = 'accepted', resolved_at = now() where item_id = p_item and status = 'pending';
  else
    delete from claims where item_id = p_item and status = 'accepted'; -- sus votos se van en cascada
  end if;
end $$;
