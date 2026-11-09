import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, type SaveStatus } from './autosave';

/** promesa que se resuelve/rechaza desde fuera, para simular la red */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const calls: { value: number; d: ReturnType<typeof deferred> }[] = [];
    const statuses: SaveStatus[] = [];
    const saver = createAutosaver<number>({
      delay: 400,
      save: (value) => { const d = deferred(); calls.push({ value, d }); return d.promise; },
      onStatus: (s) => statuses.push(s),
    });
    return { saver, calls, statuses, last: () => statuses[statuses.length - 1] };
  };

  it('agrupa cambios seguidos en un solo guardado con el último valor', async () => {
    const { saver, calls, last } = setup();
    saver.set(1); saver.set(2); saver.set(3);
    expect(last()).toBe('pending');
    await vi.advanceTimersByTimeAsync(400);
    expect(calls.map((c) => c.value)).toEqual([3]);
    calls[0].d.resolve();
    await vi.runAllTimersAsync();
    expect(last()).toBe('saved');
  });

  it('una sola petición a la vez: lo que cambia mientras guarda se guarda después', async () => {
    const { saver, calls, last } = setup();
    saver.set(1);
    await vi.advanceTimersByTimeAsync(400);
    saver.set(2); saver.set(3);
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(1); // el 1 sigue en vuelo
    calls[0].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.value)).toEqual([1, 3]);
    expect(last()).toBe('pending');
    calls[1].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe('saved');
  });

  it('si falla, avisa y reintenta hasta guardarlo', async () => {
    const { saver, calls, last } = setup();
    saver.set(7);
    await vi.advanceTimersByTimeAsync(400);
    calls[0].d.reject(new Error('red'));
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe('error');
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.map((c) => c.value)).toEqual([7, 7]);
    calls[1].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe('saved');
  });

  it('flush guarda ya lo pendiente sin esperar', async () => {
    const { saver, calls } = setup();
    saver.set(5);
    saver.flush();
    expect(calls.map((c) => c.value)).toEqual([5]);
  });

  it('parado no reintenta', async () => {
    const { saver, calls } = setup();
    saver.set(1);
    saver.flush();
    saver.stop();
    calls[0].d.reject(new Error('red'));
    await vi.runAllTimersAsync();
    expect(calls).toHaveLength(1);
  });
});
