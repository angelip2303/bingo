import { useState } from 'react';
import { backend } from '../backend';
import { allLines, completedLines, type PlayerScore } from '../lib/scoring';
import { itemText } from '../lib/suggestions';
import { vibrate } from '../lib/useRoom';
import type { Item } from '../types';
import type { RoomCtx } from './RoomScreen';
import { CellFace, Screen } from './shared';
import { STICKERS, firstGrapheme, stickerImage, useSticker } from '../lib/sticker';

export default function Board({ ctx, scores }: { ctx: RoomCtx; scores: PlayerScore[] }) {
  const { snap, me, run } = ctx;
  const n = snap.room.board_size;
  const card = snap.cards.find((c) => c.player_id === me.id);
  const [asking, setAsking] = useState<Item | null>(null);
  const [sticker, setSticker] = useSticker();
  const [picking, setPicking] = useState(false);

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
                {done && (sticker === 'SÍ'
                  ? <i className="stamp" aria-hidden>Sí</i>
                  : <i className="sticker" aria-hidden style={stickerPose(it.id)}><StickerArt s={sticker} /></i>)}
                {pending && !done && <i className="var-tag" aria-hidden>VAR</i>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="board-foot">
        <p className="board-hint">{finished ? 'La partida ha terminado.' : 'Toca una casilla cuando pase para cantarla.'}</p>
        <button className="sticker-btn" onClick={() => setPicking(true)} aria-label="Cambiar tu sello">
          {sticker === 'SÍ' ? <span className="mini-stamp">Sí</span> : <span className="sticker-ico"><StickerArt s={sticker} /></span>} Tu sello
        </button>
      </div>
      {picking && <StickerPicker value={sticker} onPick={(s) => { setSticker(s); setPicking(false); }} onClose={() => setPicking(false)} />}

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

/** Elegir el sello con el que marcas tus casillas. */
function StickerPicker({ value, onPick, onClose }: { value: string; onPick: (s: string) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="stk-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="stk-title" className="display">Tu sello</h2>
        <p>Así se marcan tus casillas cuando pasan. Solo lo ves tú.</p>
        <div className="sticker-grid">
          {STICKERS.map((s) => (
            <button key={s} className={`sticker-opt ${s === 'SÍ' ? 'classic' : ''}`} aria-pressed={value === s} onClick={() => onPick(s)} aria-label={s === 'SÍ' ? 'Sello clásico SÍ' : s}>
              {s === 'SÍ' ? <span className="mini-stamp">Sí</span> : <StickerArt s={s} />}
            </button>
          ))}
        </div>
        <form className="sticker-custom" onSubmit={(e) => { e.preventDefault(); const g = firstGrapheme(custom); if (g) onPick(g); }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="O pon el tuyo 🫡" aria-label="Tu propio emoji" maxLength={16} />
          <button className="btn" disabled={!firstGrapheme(custom)}>Usar</button>
        </form>
      </div>
    </div>
  );
}

/** Pose "pegada a mano" estable por evento: giro, desplazamiento y tamaño pseudoaleatorios. */
function stickerPose(seed: string): React.CSSProperties {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const r = (n: number) => ((h >>> (n * 5)) & 1023) / 1023; // 0..1
  return {
    '--rot': `${Math.round(r(0) * 56 - 28)}deg`,
    '--dx': `${Math.round(r(1) * 24 - 12)}%`,
    '--dy': `${Math.round(r(2) * 20 - 10)}%`,
    '--sc': (0.9 + r(3) * 0.25).toFixed(2),
  } as React.CSSProperties;
}

/** Dibujo del sticker: Fluent 3D si existe, si no el emoji del sistema. */
function StickerArt({ s }: { s: string }) {
  const src = stickerImage(s);
  return src ? <img className="sticker-img" src={src} alt="" draggable={false} /> : <>{s}</>;
}
