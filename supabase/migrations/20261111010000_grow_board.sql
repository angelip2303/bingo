-- Agrandar el cartón (solo en preparación, solo el árbitro). Cambiar el tamaño y reajustar
-- todos los cartones van juntos: si no, check_card rechazaría los que aún tienen el tamaño viejo.
-- Cada evento se queda en su fila y columna; la fila y la columna nuevas quedan como huecos.
-- Encoger no se permite: borraría casillas de todos.
create or replace function grow_board(p_room uuid, p_size int) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if r is null then raise exception 'Esa sala no existe'; end if;
  if not is_referee(p_room) then raise exception 'Solo el árbitro puede cambiar el cartón'; end if;
  if r.status <> 'lobby' then raise exception 'El cartón solo se cambia en preparación'; end if;
  if p_size <= r.board_size then raise exception 'El cartón solo se puede agrandar'; end if;
  if p_size > 5 then raise exception 'El cartón más grande es de 5×5'; end if;

  update rooms set board_size = p_size where id = p_room;
  update cards set cells = (
    select array_agg(
      case when i / p_size < r.board_size and i % p_size < r.board_size
        then cells[(i / p_size) * r.board_size + i % p_size + 1] end
      order by i)
    from generate_series(0, p_size * p_size - 1) as g(i)
  )
  where room_id = p_room;
end $$;

revoke execute on function grow_board(uuid, int) from public, anon;
grant execute on function grow_board(uuid, int) to authenticated;
