import type { PlayerScore } from '../lib/scoring';
import type { RoomCtx } from './RoomScreen';

export default function Ranking({ ctx, scores }: { ctx: RoomCtx; scores: PlayerScore[] }) {
  const { snap, me } = ctx;
  const total = snap.room.board_size ** 2;
  const lobby = snap.room.status === 'lobby';

  return (
    <section className="ranking">
      <div className="section-head">
        <h2 className="display">Ranking</h2>
        <span className="muted small">{snap.items.filter((i) => i.happened_at).length} eventos han pasado</span>
      </div>
      <ol className="rank-list">
        {scores.map((s, i) => {
          const card = snap.cards.find((c) => c.player_id === s.player.id);
          const ready = !!card && card.cells.filter((id) => snap.items.some((it) => it.id === id)).length === total;
          return (
            <li key={s.player.id} className={`rank ${s.player.id === me.id ? 'me' : ''}`}>
              <span className="pos">{i + 1}</span>
              <div className="rank-main">
                <b>{s.player.name}{s.player.id === snap.room.referee_id && <span className="ref-badge">Árbitro</span>}</b>
                <span className="muted small">
                  {lobby
                    ? ready ? 'Cartón listo' : 'Preparando cartón…'
                    : <>
                        {s.cells}/{total} casillas · {s.lines} {s.lines === 1 ? 'línea' : 'líneas'}
                        {s.bingo && ' · BINGO'}
                        {s.hawkEyes > 0 && ` · ${s.hawkEyes} ${s.hawkEyes === 1 ? "cante bueno" : "cantes buenos"}`}
                      </>}
                </span>
              </div>
              {s.yellowCards > 0 && (
                <span className="yellows" aria-label={`${s.yellowCards} tarjetas amarillas`}>
                  {Array.from({ length: Math.min(s.yellowCards, 5) }, (_, k) => <i key={k} />)}
                </span>
              )}
              <span className="pts num">{s.total}</span>
            </li>
          );
        })}
      </ol>

    </section>
  );
}
