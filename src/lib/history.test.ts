import { describe, expect, it } from 'vitest';
import { finalStandings, hallOfFame } from './history';
import type { PlayerScore } from './scoring';
import type { Result } from '../types';

const score = (name: string, total: number) => ({ player: { id: name, room_id: 'r', name, created_at: '' }, total }) as PlayerScore;
const res = (room: string, name: string, points: number, position: number, at = '2026-11-29T22:00:00Z'): Result =>
  ({ room_id: room, room_name: room, player_name: name, points, position, finished_at: at });

describe('finalStandings', () => {
  it('empates comparten posición', () => {
    const st = finalStandings([score('a', 20), score('b', 20), score('c', 5)], 'Debate');
    expect(st.map((s) => s.position)).toEqual([1, 1, 3]);
  });
});

describe('hallOfFame', () => {
  it('agrupa por nombre ignorando mayúsculas y tildes', () => {
    const rows = hallOfFame([res('r1', 'Ángel', 30, 1), res('r2', 'angel', 10, 2), res('r1', 'Pepe', 12, 2)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ games: 2, wins: 1, points: 40, best: 30, podiums: 2 });
  });

  it('ordena por victorias y luego puntos', () => {
    const rows = hallOfFame([res('r1', 'A', 50, 2), res('r1', 'B', 60, 1), res('r2', 'A', 5, 1), res('r2', 'B', 4, 2)]);
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
  });

  it('muestra el nombre más reciente', () => {
    const rows = hallOfFame([res('r1', 'pepe', 1, 1, '2026-01-01'), res('r2', 'Pepe', 1, 1, '2026-02-01')]);
    expect(rows[0].name).toBe('Pepe');
  });
});
