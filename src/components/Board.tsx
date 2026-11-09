import { useState } from 'react';
import { backend } from '../backend';
import { completedLines, type PlayerScore } from '../lib/scoring';
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

  return (
    <div className="stage-view">
      <div className="score-strip">
        <div><b className="num">{mine?.total ?? 0}</b><span>puntos</span></div>
        <div><b className="num">{rank}º</b><span>de {scores.length}</span></div>
        <div><b className="num">{mine?.lines ?? 0}</b><span>líneas</span></div>
        <div><b className="num">{mine?.cells ?? 0}/{n * n}</b><span>casillas</span></div>
      </div>

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
