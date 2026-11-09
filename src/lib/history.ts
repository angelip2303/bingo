import type { Result } from '../types';
import type { PlayerScore } from './scoring';

export interface FameRow {
  name: string;
  games: number;
  wins: number;
  podiums: number;
  points: number;
  best: number;
}

const key = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Posiciones con empates: mismos puntos, misma posición (1, 1, 3…). */
export function finalStandings(scores: PlayerScore[], roomName: string) {
  let lastPoints: number | null = null;
  let lastPos = 0;
  return scores.map((s, i) => {
    const position = s.total === lastPoints ? lastPos : i + 1;
    lastPoints = s.total;
    lastPos = position;
    return { room_name: roomName, player_name: s.player.name, points: s.total, position };
  });
}

/**
 * Salón de la fama: agrupa por nombre (sin cuentas, el nombre es la identidad;
 * ignora mayúsculas y tildes) y ordena por victorias, luego puntos.
 */
export function hallOfFame(results: Result[]): FameRow[] {
  const rows = new Map<string, FameRow & { lastAt: string }>();
  for (const r of results) {
    const k = key(r.player_name);
    const row = rows.get(k) ?? { name: r.player_name, games: 0, wins: 0, podiums: 0, points: 0, best: -Infinity, lastAt: '' };
    row.games++;
    if (r.position === 1) row.wins++;
    if (r.position <= 3) row.podiums++;
    row.points += r.points;
    row.best = Math.max(row.best, r.points);
    // el nombre que se muestra es el de la partida más reciente
    if (r.finished_at >= row.lastAt) { row.name = r.player_name; row.lastAt = r.finished_at; }
    rows.set(k, row);
  }
  return [...rows.values()]
    .map(({ lastAt: _l, ...r }) => r)
    .sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name));
}
