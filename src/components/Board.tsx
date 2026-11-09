import { useState } from 'react';
import { backend } from '../backend';
import { allLines, completedLines, type PlayerScore } from '../lib/scoring';
import { itemText } from '../lib/suggestions';
import { vibrate } from '../lib/useRoom';
import type { Item } from '../types';
import type { RoomCtx } from './RoomScreen';
import { CellFace, Screen } from './shared';

export default function Board({ ctx, scores }: { ctx: RoomCtx; scores: PlayerScore[] }) {
  const { snap, me, run } = ctx;
  const n = snap.room.board_size;
  const card = snap.cards.find((c) => c.player_id === me.id);
  const [asking, setAsking] = useState<Item | null>(null);

  if (!card || card.cells.length !== n * n || card.cells.some((id) => !snap.items.some((i) => i.id === id))) {
    return (
      <section className="empty-state var-empty">
        <h2 className="display">Sin cartón</h2>
        <p className="muted">La partida empezó sin que completaras tu cartón. Puedes seguir cantando eventos y votando en el VAR.</p>
      </section>
    );
  }

  const happened = new Set(snap.items.filter((i) => i.happened_at).map((i) => i.id));
  const lineCells = new Set(completedLines(card.cells, happened, n).flat());
  const pendingByItem = new Map(snap.claims.filter((c) => c.status === 'pending').map((c) => [c.item_id, c]));
  const mine = scores.find((s) => s.player.id === me.id);
  const rank = scores.findIndex((s) => s.player.id === me.id) + 1;
  const finished = snap.room.status === 'finished';
  // la línea a la que menos le falta (0 = no queda ninguna por completar)
  const missing = allLines(n).map((l) => l.filter((i) => !happened.has(card.cells[i])).length).filter((m) => m > 0);
  const nextLine = missing.length ? Math.min(...missing) : 0;

  return (
    <div className="stage-view">
      <ScoreBug
        rank={rank} players={scores.length} points={mine?.total ?? 0}
        cells={mine?.cells ?? 0} total={n * n} lines={mine?.lines ?? 0}
        nextLine={nextLine} bingo={!!mine?.bingo}
      />

      <div className="stage">
        <div className="grid live" style={{ '--n': n } as React.CSSProperties}>
          {card.cells.map((id, i) => {
            const it = snap.items.find((x) => x.id === id)!;
            const done = happened.has(id);
            const pending = pendingByItem.get(id);
            const mineVote = pending && (pending.player_id === me.id || snap.votes.some((v) => v.claim_id === pending.id && v.player_id === me.id));
            return (
              <button
                key={i}
                className={`cell filled ${done ? 'done' : ''} ${lineCells.has(i) ? 'in-line' : ''} ${pending ? 'pending' : ''}`}
                style={it.candidate != null ? ({ '--cand': snap.room.candidates[it.candidate]?.color } as React.CSSProperties) : undefined}
                disabled={done || finished || !!mineVote}
                onClick={() => setAsking(it)}
                aria-label={`${itemText(it, snap.room.candidates)}${done ? ', ha pasado' : pending ? ', en el VAR' : ''}`}
              >
                <CellFace item={it} candidates={snap.room.candidates} />
                {done && <i className="stamp" aria-hidden>Sí</i>}
                {pending && !done && <i className="var-tag" aria-hidden>VAR</i>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="board-hint">
        {finished ? 'La partida ha terminado.' : 'Toca una casilla cuando pase para cantarla.'}
      </p>

      {asking && (
        <Screen title="¿Ha pasado?" onClose={() => setAsking(null)}>
          <div className="claim-preview">
            <div className="cell filled preview" style={asking.candidate != null ? ({ '--cand': snap.room.candidates[asking.candidate].color } as React.CSSProperties) : undefined}>
              <CellFace item={asking} candidates={snap.room.candidates} />
            </div>
            <p className="muted small">
              {pendingByItem.has(asking.id)
                ? 'Alguien ya lo ha cantado. Tu voto se suma al suyo.'
                : 'Si el árbitro lo valida ganas 1 punto extra. Si no, tarjeta amarilla.'}
            </p>
          </div>
          <div className="row-actions">
            <button className="btn ghost" onClick={() => setAsking(null)}>Cancelar</button>
            <button
              className="btn big hot"
              onClick={() => {
                const item = asking;
                setAsking(null);
                vibrate(40);
                run(() => backend.claim(snap.room.id, me.id, item.id));
              }}
            >¡Cantarlo!</button>
          </div>
        </Screen>
      )}
    </div>
  );
}

/** Marcador tipo rótulo de tele: posición, puntos, casillas y lo que falta para la próxima línea. */
function ScoreBug({ rank, players, points, cells, total, lines, nextLine, bingo }: {
  rank: number; players: number; points: number; cells: number; total: number; lines: number; nextLine: number; bingo: boolean;
}) {
  const hint = bingo ? '¡Bingo!' : nextLine === 1 ? '¡A 1 de línea!' : nextLine ? `A ${nextLine} de línea` : '';
  return (
    <div className="scorebug" aria-label={`Vas ${rank}º de ${players} con ${points} puntos`}>
      <div className="sb-rank"><b className="display">{rank}º</b><span>de {players}</span></div>
      <div className="sb-points"><b className="display num">{points}</b><span>puntos</span></div>
      <div className="sb-progress">
        <div className="sb-row"><span>{lines} {lines === 1 ? 'línea' : 'líneas'}</span><b className="num">{cells}/{total}</b></div>
        <span className="sb-bar"><i style={{ width: `${(cells / total) * 100}%` }} /></span>
        {hint && <span className={`sb-hint ${nextLine === 1 || bingo ? 'hot' : ''}`}>{hint}</span>}
      </div>
    </div>
  );
}
