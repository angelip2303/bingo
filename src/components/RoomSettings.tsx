import { useState } from 'react';
import { backend } from '../backend';
import { goToRoom } from '../App';
import type { RoomCtx } from './RoomScreen';

export default function RoomSettings({ ctx }: { ctx: RoomCtx }) {
  const { snap, me, isReferee, run } = ctx;
  const { room } = snap;
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}#/r/${room.code}`;
  const total = room.board_size ** 2;
  const ready = snap.players.filter((p) => {
    const c = snap.cards.find((x) => x.player_id === p.id);
    return c && c.cells.filter((id) => snap.items.some((i) => i.id === id)).length === total;
  }).length;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: room.name, text: `Únete al bingo con el código ${room.code}`, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* cancelado */ }
  };

  return (
    <section className="settings">
      <div className="invite">
        <span className="muted small">Código de la sala</span>
        <b className="big-code">{room.code}</b>
        <button className="btn" onClick={share}>{copied ? 'Enlace copiado' : 'Compartir enlace'}</button>
      </div>

      {isReferee && (
        <div className="panel stack">
          <h2 className="display">Mesa del árbitro</h2>
          {room.status === 'lobby' && (
            <>
              <p className="muted small">{ready} de {snap.players.length} tienen el cartón completo. Al empezar se bloquean los cartones.</p>
              <button className="btn big hot" onClick={() => run(() => backend.setStatus(room.id, 'live'))}>Empezar partida</button>
            </>
          )}
          {room.status === 'live' && (
            <>
              <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'finished'))}>Terminar partida</button>
              <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'lobby'))}>Volver a preparación</button>
              <p className="muted small">Volver a preparación desbloquea los cartones pero mantiene lo que ya ha pasado.</p>
            </>
          )}
          {room.status === 'finished' && (
            <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'live'))}>Reabrir partida</button>
          )}
        </div>
      )}

      <div className="panel stack">
        <h2 className="display">Jugadores <span className="muted">{snap.players.length}</span></h2>
        <ul className="players">
          {snap.players.map((p) => (
            <li key={p.id}>
              <span>{p.name}{p.id === me.id && <span className="muted"> (tú)</span>}</span>
              {p.id === room.referee_id
                ? <span className="ref-badge">Árbitro</span>
                : isReferee && (
                  <button className="btn small ghost" onClick={() => run(() => backend.setReferee(room.id, p.id))}>Pasar el silbato</button>
                )}
            </li>
          ))}
        </ul>
      </div>

      <button className="btn ghost" onClick={() => goToRoom(null)}>Salir al inicio</button>
    </section>
  );
}
