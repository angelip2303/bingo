import { useState } from 'react';
import { backend } from '../backend';
import { completedLines, type PlayerScore } from '../lib/scoring';
import { itemBody, itemText } from '../lib/suggestions';
import { vibrate } from '../lib/useRoom';
import type { Item } from '../types';
import type { RoomCtx } from './RoomScreen';
import { CandTag } from './shared';

export default function Board({ ctx, scores }: { ctx: RoomCtx; scores: PlayerScore[] }) {
  const { snap, me, run } = ctx;
  const n = snap.room.board_size;
  const card = snap.cards.find((c) => c.player_id === me.id);
  const [asking, setAsking] = useState<Item | null>(null);

  if (!card || card.cells.length !== n * n || card.cells.some((id) => !snap.items.some((i) => i.id === id))) {
    return (
      <section className="empty-state">
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

  return (
    <section className="board">
      <div className="score-strip">
        <div><b className="num">{mine?.total ?? 0}</b><span>puntos</span></div>
        <div><b className="num">{rank}º</b><span>de {scores.length}</span></div>
        <div><b className="num">{mine?.lines ?? 0}</b><span>líneas</span></div>
        <div><b className="num">{mine?.cells ?? 0}/{n * n}</b><span>casillas</span></div>
      </div>

      <div className="grid live" style={{ '--n': n } as React.CSSProperties}>
        {card.cells.map((id, i) => {
          const it = snap.items.find((x) => x.id === id)!;
          const done = happened.has(id);
          const pending = pendingByItem.get(id);
          const mineVote = pending && (pending.player_id === me.id || snap.votes.some((v) => v.claim_id === pending.id && v.player_id === me.id));
          return (
            <button
              key={i}
              className={`cell ${done ? 'done' : ''} ${lineCells.has(i) ? 'in-line' : ''} ${pending ? 'pending' : ''}`}
              style={it.candidate != null ? ({ '--cand': snap.room.candidates[it.candidate]?.color } as React.CSSProperties) : undefined}
              disabled={done || finished || !!mineVote}
              onClick={() => setAsking(it)}
              aria-label={`${itemText(it, snap.room.candidates)}${done ? ', ha pasado' : pending ? ', en el VAR' : ''}`}
            >
              {it.candidate != null && <span className="cell-tag"><CandTag index={it.candidate} candidates={snap.room.candidates} size="sm" /></span>}
              <span className="cell-text">{itemBody(it, snap.room.candidates)}</span>
              {done &&<i className="stamp" aria-hidden>Sí</i>}
              {pending && !done && <i className="var-tag" aria-hidden>VAR</i>}
            </button>
          );
        })}
      </div>
      <p className="muted small center">
        {finished ? 'La partida ha terminado.' : 'Toca una casilla cuando pase para cantarla. El árbitro decide.'}
      </p>

      {asking && (
        <div className="sheet-backdrop" onClick={() => setAsking(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="claim-title" onClick={(e) => e.stopPropagation()}>
            <p className="muted small">¿Ha pasado esto?</p>
            <h2 id="claim-title" className="display">{itemText(asking, snap.room.candidates)}</h2>
            <p className="muted small">
              {pendingByItem.has(asking.id)
                ? 'Alguien ya lo ha cantado. Tu voto se suma al suyo.'
                : 'Si el árbitro lo valida ganas 1 punto extra. Si no, tarjeta amarilla (−1).'}
            </p>
            <div className="row-actions">
              <button
                className="btn big"
                onClick={() => {
                  const item = asking;
                  setAsking(null);
                  vibrate(40);
                  run(() => backend.claim(snap.room.id, me.id, item.id));
                }}
              >¡Cantarlo!</button>
              <button className="btn ghost" onClick={() => setAsking(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
