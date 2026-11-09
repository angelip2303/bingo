import { describe, expect, it } from 'vitest';
import { allLines, computeScores, POINTS } from './scoring';
import type { Card, Cell, Claim, Item, Player } from '../types';

const p = (id: string): Player => ({ id, room_id: 'r', name: id, created_at: '' });
const item = (id: string, happened_at: string | null = null): Item => ({
  id, room_id: 'r', text: id, candidate: null, created_by: null, happened_at, created_at: '',
});
const card = (player_id: string, cells: Cell[]): Card => ({ id: 'c' + player_id, room_id: 'r', player_id, cells, updated_at: '' });

describe('allLines', () => {
  it('4x4 tiene 4 filas + 4 columnas + 2 diagonales', () => {
    expect(allLines(4)).toHaveLength(10);
    expect(allLines(3)).toContainEqual([2, 4, 6]);
  });
});

describe('computeScores', () => {
  // 2x2 para que las cuentas sean fáciles: líneas = 2 filas, 2 columnas, 2 diagonales
  const items = ['a', 'b', 'c', 'd'];

  it('sin eventos todo a cero', () => {
    const { scores } = computeScores(2, [p('x')], [card('x', items)], items.map((i) => item(i)), []);
    expect(scores[0].total).toBe(0);
  });

  it('casillas, líneas y bonus de primera línea', () => {
    const its = [item('a', '1'), item('b', '2'), item('c'), item('d')];
    const players = [p('x'), p('y')];
    const cards = [card('x', ['a', 'b', 'c', 'd']), card('y', ['a', 'c', 'b', 'd'])];
    const { scores } = computeScores(2, players, cards, its, []);
    const x = scores.find((s) => s.player.id === 'x')!;
    const y = scores.find((s) => s.player.id === 'y')!;
    // x: fila [a,b] completa
    expect(x.lines).toBe(1);
    expect(x.firstLine).toBe(true);
    expect(x.total).toBe(2 * POINTS.cell + POINTS.line + POINTS.firstLine);
    // y: a y b están en columna 0 ([0,2] = a,b) → también línea con el mismo evento → empate
    expect(y.lines).toBe(1);
    expect(y.firstLine).toBe(true);
  });

  it('el orden de los eventos decide quién es primero', () => {
    const its = [item('a', '1'), item('b', '3'), item('c', '2'), item('d')];
    const cards = [card('x', ['a', 'b', 'd', 'd']), card('y', ['a', 'c', 'd', 'd'])];
    const { scores } = computeScores(2, [p('x'), p('y')], cards, its, []);
    expect(scores.find((s) => s.player.id === 'y')!.firstLine).toBe(true);
    expect(scores.find((s) => s.player.id === 'x')!.firstLine).toBe(false);
  });

  it('bingo completo', () => {
    const its = items.map((i, n) => item(i, String(n)));
    const { scores, achievements } = computeScores(2, [p('x')], [card('x', items)], its, []);
    expect(scores[0].bingo).toBe(true);
    expect(scores[0].firstBingo).toBe(true);
    expect(scores[0].lines).toBe(6);
    expect(achievements.filter((a) => a.kind === 'bingo')).toHaveLength(1);
  });

  it('ojo de halcón y tarjetas amarillas', () => {
    const claims: Claim[] = [
      { id: '1', room_id: 'r', item_id: 'a', player_id: 'x', status: 'accepted', created_at: '', resolved_at: '' },
      { id: '2', room_id: 'r', item_id: 'b', player_id: 'x', status: 'rejected', created_at: '', resolved_at: '' },
      { id: '3', room_id: 'r', item_id: 'c', player_id: 'x', status: 'rejected', created_at: '', resolved_at: '' },
    ];
    const { scores } = computeScores(2, [p('x')], [], [], claims);
    expect(scores[0].hawkEyes).toBe(1);
    expect(scores[0].yellowCards).toBe(2);
    expect(scores[0].total).toBe(POINTS.hawkEye + 2 * POINTS.yellowCard);
  });

  it('cartón incompleto no puntúa casillas', () => {
    const { scores } = computeScores(2, [p('x')], [card('x', ['a'])], [item('a', '1')], []);
    expect(scores[0].cells).toBe(0);
  });

  it('cartón con huecos (null) no puntúa aunque tenga la longitud justa', () => {
    const { scores } = computeScores(2, [p('x')], [card('x', ['a', 'b', null, 'd'])], [item('a', '1'), item('b', '2')], []);
    expect(scores[0].cells).toBe(0);
    expect(scores[0].lines).toBe(0);
  });
});
