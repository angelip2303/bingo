import { useState } from 'react';
import { backend } from '../backend';
import { goToRoom } from '../App';
import { finalStandings } from '../lib/history';
import { ConfirmDialog } from './shared';
import type { RoomCtx } from './RoomScreen';
import type { RoomStatus } from '../types';

const PHASES: { id: RoomStatus; label: string }[] = [
  { id: 'lobby', label: 'Preparación' },
  { id: 'live', label: 'En directo' },
  { id: 'finished', label: 'Final' },
];

type Ask = null | 'start' | 'finish' | 'back';

export default function RoomSettings({ ctx }: { ctx: RoomCtx }) {
  const { snap, me, isReferee, run, scores } = ctx;
  const { room } = snap;
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const link = `${location.origin}${location.pathname}#/r/${room.code}`;
  const total = room.board_size ** 2;
  const lobby = room.status === 'lobby';
  const itemIds = new Set(snap.items.map((i) => i.id));

  const progress = snap.players.map((p) => {
    const card = snap.cards.find((c) => c.player_id === p.id);
    const filled = card ? card.cells.filter((id) => itemIds.has(id)).length : 0;
    return { player: p, filled, done: filled === total };
  });
  const missing = progress.filter((p) => !p.done);
  const ready = progress.length - missing.length;
  const happened = snap.items.filter((i) => i.happened_at).length;
  const inVar = snap.claims.filter((c) => c.status === 'pending').length;
  const yellows = snap.claims.filter((c) => c.status === 'rejected').length;
  const leader = scores[0];
  const phaseIdx = PHASES.findIndex((p) => p.id === room.status);

  const start = () => run(() => backend.setStatus(room.id, 'live'));
  const finish = () => run(async () => {
    await backend.saveResults(room.id, finalStandings(scores, room.name));
    await backend.setStatus(room.id, 'finished');
  });

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

      <section className="card-block desk">
        <div className="block-head">
          <h3 className="display">{isReferee ? 'Mesa del árbitro' : 'La partida'}</h3>
        </div>

        <ol className="phases" aria-label="Fase de la partida">
          {PHASES.map((p, i) => (
            <li key={p.id} className={i < phaseIdx ? 'past' : i === phaseIdx ? 'now' : ''} aria-current={i === phaseIdx ? 'step' : undefined}>
              <span className="phase-dot" aria-hidden>{i + 1}</span>{p.label}
            </li>
          ))}
        </ol>

        {lobby && (
          <div className="desk-stats">
            <div><b className="display num">{ready}/{progress.length}</b><span>cartones listos</span></div>
            <div><b className="display num">{snap.items.length}</b><span>eventos en juego</span></div>
          </div>
        )}
        {room.status === 'live' && (
          <div className="desk-stats">
            <div><b className="display num">{happened}</b><span>han pasado</span></div>
            <div className={inVar ? 'hot' : ''}><b className="display num">{inVar}</b><span>en el VAR</span></div>
            <div><b className="display num">{yellows}</b><span>amarillas</span></div>
          </div>
        )}
        {room.status !== 'lobby' && leader && (
          <p className="desk-leader">
            {room.status === 'finished' ? 'Gana' : 'Manda'} <b>{leader.player.name}</b> con {leader.total} puntos
          </p>
        )}

        {isReferee ? (
          <div className="desk-actions">
            {lobby && <button className="btn big hot" onClick={() => (missing.length ? setAsk('start') : start())}>Empezar partida</button>}
            {room.status === 'live' && (
              <>
                <button className="btn big hot" onClick={() => setAsk('finish')}>Terminar partida</button>
                <button className="btn ghost small" onClick={() => setAsk('back')}>Volver a preparación</button>
              </>
            )}
            {room.status === 'finished' && <button className="btn ghost" onClick={() => run(() => backend.setStatus(room.id, 'live'))}>Reabrir partida</button>}
          </div>
        ) : (
          <p className="muted small">Solo el árbitro puede cambiar de fase.</p>
        )}
      </section>

      <section className="card-block">
        <div className="block-head">
          <h3 className="display">Jugadores</h3>
          {lobby && <span className={`block-count ${missing.length ? '' : 'ok'}`}>{ready}/{progress.length} listos</span>}
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

      <button className="btn ghost" onClick={() => goToRoom(null)}>Salir al inicio</button>

      {ask === 'start' && (
        <ConfirmDialog
          title="Faltan cartones"
          text={`${missing.map((m) => `${m.player.name} (${m.filled ? `${m.filled}/${total}` : 'sin empezar'})`).join(', ')}. Si empiezas ahora, quien no tenga el cartón completo solo podrá cantar y votar.`}
          confirm="Empezar igual"
          onCancel={() => setAsk(null)}
          onConfirm={() => { setAsk(null); start(); }}
        />
      )}
      {ask === 'finish' && (
        <ConfirmDialog
          title="¿Terminar partida?"
          text={`Se cierra el marcador${leader ? ` y gana ${leader.player.name} con ${leader.total} puntos` : ''}. La clasificación queda en el histórico. Puedes reabrirla si te equivocas.`}
          confirm="Terminar"
          onCancel={() => setAsk(null)}
          onConfirm={() => { setAsk(null); finish(); }}
        />
      )}
      {ask === 'back' && (
        <ConfirmDialog
          title="¿Volver a preparación?"
          text="Los cartones se desbloquean para editarlos. Lo que ya ha pasado se mantiene."
          confirm="Volver"
          onCancel={() => setAsk(null)}
          onConfirm={() => { setAsk(null); run(() => backend.setStatus(room.id, 'lobby')); }}
        />
      )}
    </div>
  );
}
