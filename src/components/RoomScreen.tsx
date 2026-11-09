import { useEffect, useMemo, useRef, useState } from 'react';
import { computeScores } from '../lib/scoring';
import { itemText } from '../lib/suggestions';
import { useRoom, vibrate } from '../lib/useRoom';
import type { Player, Snapshot } from '../types';
import CardEditor from './CardEditor';
import Board from './Board';
import Var from './Var';
import Ranking from './Ranking';
import Bank from './Bank';
import RoomSettings from './RoomSettings';
import Guide from './Guide';
import { Screen } from './shared';

type Tab = 'card' | 'var' | 'ranking' | 'bank';

export interface RoomCtx {
  snap: Snapshot;
  me: Player;
  isReferee: boolean;
  reload: () => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

interface Toast { id: number; text: string; tone: 'info' | 'good' | 'bad' }
interface Celebration { name: string; kind: 'line' | 'bingo'; count: number; mine: boolean }

export default function RoomScreen({ roomId, me }: { roomId: string; me: Player }) {
  const { snap, error, reload } = useRoom(roomId);
  const [tab, setTab] = useState<Tab>('card');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [panel, setPanel] = useState<'room' | 'guide' | null>(null);

  const toast = (text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); reload(); } catch (e) { toast((e as Error).message, 'bad'); }
  };

  const scoring = useMemo(
    () => snap && computeScores(snap.room.board_size, snap.players, snap.cards, snap.items, snap.claims),
    [snap],
  );

  useAnnouncements(snap, me, scoring?.achievements ?? [], toast, setCelebration);

  if (!snap) {
    return (
      <div className="center-screen">
        {error ? <p className="error">{error}</p> : <div className="spinner" aria-label="Cargando sala" />}
      </div>
    );
  }

  const isReferee = snap.room.referee_id === me.id;
  const ctx: RoomCtx = { snap, me, isReferee, reload, run };
  const pending = snap.claims.filter((c) => c.status === 'pending').length;
  const live = snap.room.status === 'live';
  const statusLabel = live ? 'En directo' : snap.room.status === 'lobby' ? 'Preparando' : 'Terminado';

  return (
    <div className="room">
      <header className="topbar">
        <div className="topbar-in">
          <span className={`onair compact ${live ? '' : 'off'}`} title={statusLabel}>
            <i aria-hidden /><span className="onair-label">{statusLabel}</span>
          </span>
          <h1 className="room-title">{snap.room.name}</h1>
          <button className="icon-btn" onClick={() => setPanel('guide')} aria-label="Cómo se juega">?</button>
          <button className="code-chip" onClick={() => setPanel('room')} aria-label={`Sala ${snap.room.code}: compartir, jugadores y árbitro`}>
            {snap.room.code}
          </button>
        </div>
      </header>

      <main className="room-main">
        {tab === 'card' && (snap.room.status === 'lobby' ? <CardEditor ctx={ctx} /> : <Board ctx={ctx} scores={scoring!.scores} />)}
        {tab === 'var' && <Var ctx={ctx} />}
        {tab === 'ranking' && <Ranking ctx={ctx} scores={scoring!.scores} />}
        {tab === 'bank' && <Bank ctx={ctx} />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        {([
          ['card', 'Cartón'],
          ['var', 'VAR'],
          ['ranking', 'Ranking'],
          ['bank', 'Eventos'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {label}
            {id === 'var' && pending > 0 && <b className="badge" aria-label={`${pending} pendientes`}>{pending}</b>}
          </button>
        ))}
      </nav>

      {panel === 'room' && <Screen title={`Sala ${snap.room.code}`} onClose={() => setPanel(null)}><RoomSettings ctx={ctx} /></Screen>}
      {panel === 'guide' && <Screen title="Cómo se juega" onClose={() => setPanel(null)}><Guide /></Screen>}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>

      {celebration && (
        <button className={`celebrate ${celebration.kind}`} onClick={() => setCelebration(null)} aria-label="Cerrar celebración">
          <span className="celebrate-kind">{celebration.kind === 'bingo' ? '¡Bingo!' : celebration.count > 1 ? `¡${celebration.count}ª línea!` : '¡Línea!'}</span>
          <span className="celebrate-name">{celebration.mine ? '¡Es tuya!' : celebration.name}</span>
        </button>
      )}
    </div>
  );
}

/** Avisos en directo: cantes nuevos, decisiones del árbitro, líneas y bingos. */
function useAnnouncements(
  snap: Snapshot | null,
  me: Player,
  achievements: { playerId: string; kind: 'line' | 'bingo'; count: number }[],
  toast: (t: string, tone?: Toast['tone']) => void,
  celebrate: (c: Celebration) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!snap) return;
    const keys = [
      ...snap.claims.map((c) => `claim:${c.id}:${c.status}`),
      ...achievements.map((a) => `ach:${a.playerId}:${a.kind}:${a.count}`),
    ];
    if (!seen.current) { seen.current = new Set(keys); return; } // primera carga: no repetir lo viejo
    const name = (id: string) => snap.players.find((p) => p.id === id)?.name ?? 'Alguien';
    for (const c of snap.claims) {
      const k = `claim:${c.id}:${c.status}`;
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      const it = snap.items.find((i) => i.id === c.item_id);
      const what = it ? itemText(it, snap.room.candidates) : 'algo';
      if (c.status === 'pending' && c.player_id !== me.id) { toast(`${name(c.player_id)} canta: ${what}`); vibrate(80); }
      if (c.status === 'accepted') { toast(`Validado: ${what}`, 'good'); vibrate([60, 40, 60]); }
      if (c.status === 'rejected') toast(`Tarjeta amarilla para ${name(c.player_id)}`, 'bad');
    }
    for (const a of achievements) {
      const k = `ach:${a.playerId}:${a.kind}:${a.count}`;
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      celebrate({ name: name(a.playerId), kind: a.kind, count: a.count, mine: a.playerId === me.id });
      vibrate(a.kind === 'bingo' ? [200, 80, 200, 80, 400] : [150, 60, 150]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);
}
