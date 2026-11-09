import { useState } from 'react';
import { backend } from '../backend';
import { goToRoom } from '../App';
import { ConfirmDialog } from './shared';
import type { RoomCtx } from './RoomScreen';

export default function RoomSettings({ ctx }: { ctx: RoomCtx }) {
  const { snap, me, isReferee, run } = ctx;
  const { room } = snap;
  const [copied, setCopied] = useState(false);
  const [askStart, setAskStart] = useState(false);
  const link = `${location.origin}${location.pathname}#/r/${room.code}`;
  const total = room.board_size ** 2;
  const lobby = room.status === 'lobby';
  const itemIds = new Set(snap.items.map((i) => i.id));

  /** cuántas casillas válidas tiene cada jugador */
  const progress = snap.players.map((p) => {
    const card = snap.cards.find((c) => c.player_id === p.id);
    const filled = card ? card.cells.filter((id) => itemIds.has(id)).length : 0;
    return { player: p, filled, done: filled === total };
  });
  const missing = progress.filter((p) => !p.done);
  const start = () => run(() => backend.setStatus(room.id, 'live'));

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: room.name, text: `Únete al bingo con el código ${room.code}`, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* cancelado */ }
  };

  return (
    <div className="settings">
      <section className="card-block invite">
        <span className="block-label">Código de la sala</span>
        <b className="big-code">{room.code}</b>
        <button className="btn" onClick={share}>{copied ? 'Enlace copiado' : 'Compartir enlace'}</button>
      </section>

      <section className="card-block">
        <div className="block-head">
          <h3 className="display">Jugadores</h3>
          {lobby && <span className={`block-count ${missing.length ? '' : 'ok'}`}>{progress.length - missing.length}/{progress.length} listos</span>}
        </div>
        <ul className="players">
          {progress.map(({ player: p, filled, done }) => (
            <li key={p.id}>
              <div className="player-main">
                <span className="player-name">
                  {p.name}{p.id === me.id && <span className="muted"> (tú)</span>}
                  {p.id === room.referee_id && <span className="ref-badge">Árbitro</span>}
                </span>
                {lobby && (
                  <span className={`card-progress ${done ? 'done' : ''}`} aria-label={`${filled} de ${total} casillas`}>
                    <i style={{ width: `${(filled / total) * 100}%` }} />
                  </span>
                )}
              </div>
              {lobby && <span className={`player-state ${done ? 'ok' : ''}`}>{done ? 'Listo' : filled ? `${filled}/${total}` : 'Sin empezar'}</span>}
              {isReferee && p.id !== room.referee_id && (
                <button className="btn small ghost" onClick={() => run(() => backend.setReferee(room.id, p.id))} aria-label={`Pasar el silbato a ${p.name}`}>Silbato</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isReferee && (
        <section className="card-block">
          <div className="block-head"><h3 className="display">Mesa del árbitro</h3></div>
          {lobby && (
            <>
              <p className="muted small">Al empezar se bloquean los cartones.</p>
              <button className="btn big hot" onClick={() => (missing.length ? setAskStart(true) : start())}>Empezar partida</button>
            </>
          )}
          {room.status === 'live' && (
            <>
              <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'finished'))}>Terminar partida</button>
              <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'lobby'))}>Volver a preparación</button>
              <p className="muted small">Volver a preparación desbloquea los cartones y mantiene lo que ya ha pasado.</p>
            </>
          )}
          {room.status === 'finished' && (
            <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'live'))}>Reabrir partida</button>
          )}
        </section>
      )}

      <button className="btn ghost" onClick={() => goToRoom(null)}>Salir al inicio</button>

      {askStart && (
        <ConfirmDialog
          title="Faltan cartones"
          text={`${missing.map((m) => `${m.player.name} (${m.filled ? `${m.filled}/${total}` : 'sin empezar'})`).join(', ')}. Si empiezas ahora, quien no tenga el cartón completo solo podrá cantar y votar.`}
          confirm="Empezar igual"
          onCancel={() => setAskStart(false)}
          onConfirm={() => { setAskStart(false); start(); }}
        />
      )}
    </div>
  );
}
