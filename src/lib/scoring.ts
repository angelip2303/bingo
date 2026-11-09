import type { Card, Cell, Claim, Item, Player } from '../types';

export const POINTS = {
  cell: 1,
  line: 5,
  firstLine: 3,
  bingo: 20,
  firstBingo: 10,
  hawkEye: 1, // cante aceptado por el árbitro
  yellowCard: -1, // cante rechazado
} as const;

export interface PlayerScore {
  player: Player;
  total: number;
  cells: number;
  lines: number;
  bingo: boolean;
  firstLine: boolean;
  firstBingo: boolean;
  hawkEyes: number;
  yellowCards: number;
}

export interface Achievement {
  playerId: string;
  kind: 'line' | 'bingo';
  /** cuántas líneas lleva tras este logro */
  count: number;
  itemId: string;
}

/** Todas las líneas posibles (filas, columnas, 2 diagonales) como listas de índices. */
export function allLines(size: number): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return lines;
}

/** Casillas con evento (las vacías son null). */
export function filledCount(cells: Cell[]): number {
  return cells.filter((id) => id != null).length;
}

/** Cartón con todas sus casillas llenas: el único que juega. */
export type CompleteCard = Omit<Card, 'cells'> & { cells: string[] };

export function isComplete(card: Card | undefined, size: number): card is CompleteCard {
  return !!card && card.cells.length === size * size && filledCount(card.cells) === size * size;
}

export function completedLines(cells: Cell[], happened: Set<string>, size: number): number[][] {
  return allLines(size).filter((line) => line.every((i) => { const id = cells[i]; return id != null && happened.has(id); }));
}

/**
 * Reproduce los eventos en el orden en que pasaron para saber quién cantó
 * línea / bingo primero. Determinista: todos los móviles calculan lo mismo.
 */
export function computeScores(
  size: number,
  players: Player[],
  cards: Card[],
  items: Item[],
  claims: Claim[],
): { scores: PlayerScore[]; achievements: Achievement[] } {
  const total = size * size;
  // solo juegan los cartones completos
  const cardByPlayer = new Map(cards.filter((c): c is CompleteCard => isComplete(c, size)).map((c) => [c.player_id, c]));
  const happenedOrdered = items
    .filter((i) => i.happened_at)
    .sort((a, b) => a.happened_at!.localeCompare(b.happened_at!) || a.id.localeCompare(b.id));

  const happened = new Set<string>();
  const linesSoFar = new Map<string, number>();
  const achievements: Achievement[] = [];
  let firstLineIds: string[] = [];
  let firstBingoIds: string[] = [];

  for (const item of happenedOrdered) {
    happened.add(item.id);
    const newLiners: string[] = [];
    const newBingos: string[] = [];
    for (const p of players) {
      const card = cardByPlayer.get(p.id);
      if (!card || !card.cells.includes(item.id)) continue;
      const before = linesSoFar.get(p.id) ?? 0;
      const now = completedLines(card.cells, happened, size).length;
      if (now > before) {
        linesSoFar.set(p.id, now);
        achievements.push({ playerId: p.id, kind: 'line', count: now, itemId: item.id });
        newLiners.push(p.id);
      }
      if (card.cells.every((id) => happened.has(id))) {
        achievements.push({ playerId: p.id, kind: 'bingo', count: now, itemId: item.id });
        newBingos.push(p.id);
      }
    }
    // Si dos personas completan con el mismo evento, empatan y ambas se llevan el bonus
    if (firstLineIds.length === 0 && newLiners.length) firstLineIds = newLiners;
    if (firstBingoIds.length === 0 && newBingos.length) firstBingoIds = newBingos;
  }

  const scores = players.map<PlayerScore>((player) => {
    const card = cardByPlayer.get(player.id);
    const cells = card ? card.cells.filter((id) => happened.has(id)).length : 0;
    const lines = linesSoFar.get(player.id) ?? 0;
    const bingo = !!card && cells === total;
    const mine = claims.filter((c) => c.player_id === player.id);
    const hawkEyes = mine.filter((c) => c.status === 'accepted').length;
    const yellowCards = mine.filter((c) => c.status === 'rejected').length;
    const firstLine = firstLineIds.includes(player.id);
    const firstBingo = firstBingoIds.includes(player.id);
    const totalPts =
      cells * POINTS.cell +
      lines * POINTS.line +
      (firstLine ? POINTS.firstLine : 0) +
      (bingo ? POINTS.bingo : 0) +
      (firstBingo ? POINTS.firstBingo : 0) +
      hawkEyes * POINTS.hawkEye +
      yellowCards * POINTS.yellowCard;
    return { player, total: totalPts, cells, lines, bingo, firstLine, firstBingo, hawkEyes, yellowCards };
  });

  scores.sort((a, b) => b.total - a.total || b.lines - a.lines || a.player.name.localeCompare(b.player.name));
  return { scores, achievements };
}
