import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'error';

/**
 * Guardado automático de un valor que el usuario edita (p. ej. el cartón).
 * - Agrupa cambios seguidos: espera `delay` ms sin cambios antes de guardar.
 * - Una sola petición a la vez y gana el último valor: si cambias algo mientras se guarda,
 *   al terminar se guarda lo nuevo. Nunca llega antes una versión vieja que una nueva.
 * - Si falla, reintenta con espera creciente hasta que lo consigue o hay un cambio nuevo.
 * - flush() guarda ya lo pendiente (al salir de la pantalla o al ocultar la app).
 */
export function createAutosaver<T>(opts: {
  save: (value: T) => Promise<void>;
  onStatus: (s: SaveStatus) => void;
  delay?: number;
  maxRetryDelay?: number;
}) {
  const delay = opts.delay ?? 400;
  const maxRetryDelay = opts.maxRetryDelay ?? 15_000;
  let latest: { value: T } | null = null; // pendiente de guardar
  let inflight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let stopped = false;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(flush, ms);
  };

  async function flush() {
    clearTimeout(timer);
    if (inflight || !latest) return;
    const { value } = latest;
    latest = null;
    inflight = true;
    try {
      await opts.save(value);
      failures = 0;
    } catch {
      failures++;
      latest ??= { value }; // si no hay nada más nuevo, se reintenta este
    } finally {
      inflight = false;
    }
    if (!latest) opts.onStatus('saved');
    else if (failures) { opts.onStatus('error'); schedule(Math.min(maxRetryDelay, 1000 * 2 ** (failures - 1))); }
    else flush(); // llegó un cambio mientras guardábamos
  }

  return {
    set(value: T) {
      latest = { value };
      opts.onStatus('pending');
      if (!inflight) schedule(delay);
    },
    flush,
    /** reintentar ya, sin esperar */
    retry: () => flush(),
    /** sin reintentos ni guardados programados (lo que ya está en vuelo termina) */
    stop: () => { stopped = true; clearTimeout(timer); },
    start: () => { stopped = false; },
  };
}

/** createAutosaver para un componente: guarda cada cambio de `value` (no el valor con el que se monta). */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const saveRef = useRef(save);
  saveRef.current = save;
  const [saver] = useState(() => createAutosaver<T>({ save: (v) => saveRef.current(v), onStatus: setStatus }));

  const initial = useRef(value);
  useEffect(() => {
    if (value !== initial.current) saver.set(value);
  }, [value, saver]);

  useEffect(() => {
    saver.start();
    // en el móvil la app se puede cerrar o congelar al ocultarse: guardar ya
    const onHide = () => { if (document.visibilityState === 'hidden') saver.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saver.flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saver.flush);
      saver.flush(); // al salir de la pantalla no se pierde el último cambio
      saver.stop();
    };
  }, [saver]);

  return { status, retry: saver.retry };
}
