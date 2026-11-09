import { useCallback, useEffect, useRef, useState } from 'react';
import { backend } from '../backend';
import type { Snapshot } from '../types';

/** Foto de la sala que se recarga sola con cada cambio (tiempo real). */
export function useRoom(roomId: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);

  const reload = useCallback(() => {
    clearTimeout(timer.current);
    // agrupa ráfagas de cambios (p. ej. el árbitro resuelve y se tocan 2 tablas)
    timer.current = setTimeout(async () => {
      try {
        const s = await backend.snapshot(roomId);
        if (alive.current) { setSnap(s); setError(null); }
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      }
    }, 120);
  }, [roomId]);

  useEffect(() => {
    alive.current = true;
    reload();
    const unsub = backend.subscribe(roomId, reload);
    return () => { alive.current = false; unsub(); clearTimeout(timer.current); };
  }, [roomId, reload]);

  return { snap, error, reload };
}

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* iOS no vibra */ }
}
