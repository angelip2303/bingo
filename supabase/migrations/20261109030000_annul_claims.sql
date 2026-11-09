-- Anular un evento anula también el cante que lo validó: si no, quien lo cantó seguía
-- sumando el punto (y lo sumaba otra vez si se volvía a cantar y validar).
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
  else
    delete from claims where item_id = p_item and status = 'accepted'; -- sus votos se van en cascada
  end if;
end $$;
