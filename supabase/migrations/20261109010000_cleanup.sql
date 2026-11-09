-- Limpieza: los eventos ya no se borran desde la app (desapareció la pestaña Eventos).
drop policy if exists "delete items" on items;
