import { useMemo, useState } from 'react';
import { backend } from '../backend';
import { useMediaQuery } from '../lib/useRoom';
import { useAutosave } from '../lib/autosave';
import { fillCard, itemText } from '../lib/suggestions';
import type { Cell, Item } from '../types';
import { CellFace, ConfirmDialog, EventPanel, SeatBar } from './shared';
import { IconShuffle, IconSparkles } from './icons';
import type { RoomCtx } from './RoomScreen';

type Draft = Pick<Item, 'text' | 'candidate'>;

export default function CardEditor({ ctx }: { ctx: RoomCtx }) {
  const { snap, me } = ctx;
  const n = snap.room.board_size;
  const total = n * n;
  const bank = snap.items;
  const candidates = snap.room.candidates;
  const byId = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);
  const saved = snap.cards.find((c) => c.player_id === me.id);

  // el cartón se edita en local y se guarda solo; lo de la sala no lo pisa mientras editas
  const [cells, setCells] = useState<Cell[]>(() => Array.from({ length: total }, (_, i) => saved?.cells[i] ?? null));
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const empties = cells.filter((id) => id == null).length;
  const usedAt = useMemo(() => new Map(cells.flatMap((id, i) => (id != null ? [[id, i] as [string, number]] : []))), [cells]);

  const { status, retry } = useAutosave(cells, (c) => backend.saveCard(snap.room.id, me.id, c));


  /** Pone un evento en la casilla (si ya estaba en otra, intercambia) y salta al siguiente hueco. */
  const place = (idx: number, id: string) => {
    const next = [...cells];
    const from = next.indexOf(id);
    if (from >= 0 && from !== idx) next[from] = next[idx];
    next[idx] = id;
    setCells(next);
    setDraft(null);
    const after = next.findIndex((x, i) => x == null && i > idx);
    const any = next.findIndex((x) => x == null);
    if (after >= 0) setOpen(after);
    else if (any >= 0) setOpen(any);
  };

  const editing = open != null;
  const wide = useMediaQuery('(min-width: 900px)');

  return (
    <div className={`stage-view editor ${editing ? 'editing' : ''}`}>
      <div className="editor-main">
        <div className="stage">
          <div className="grid" style={{ '--n': n } as React.CSSProperties}>
            {cells.map((id, i) => {
              const showDraft = i === open && draft;
              const it = showDraft ? draft : id != null ? byId.get(id) : null;
              return (
                <div key={i} className="cell-slot">
                  <button
                    className={`cell ${it ? 'filled' : 'empty'} ${open === i ? 'selected' : ''} ${showDraft ? 'draft' : ''}`}
                    style={it?.candidate != null ? ({ '--cand': candidates[it.candidate]?.color } as React.CSSProperties) : undefined}
                    onClick={() => { setDraft(null); setOpen(open === i ? null : i); }}
                    aria-label={it ? `Casilla ${i + 1}: ${itemText(it, candidates)}. Editar` : `Casilla ${i + 1} vacía. Elegir evento`}
                    aria-pressed={open === i}
                  >
                    {it ? <CellFace item={it} candidates={candidates} /> : <span className="plus" aria-hidden>+</span>}
                  </button>
                  {open === i && id && !showDraft && (
                    <button className="cell-clear" onClick={() => setCells(cells.map((x, j) => (j === i ? null : x)))} aria-label={`Vaciar casilla ${i + 1}`}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="statusbar">
          <SeatBar cells={cells} items={bank} candidates={candidates} />
          <button
            className={`icon-btn ${empties === total ? 'nudge' : ''}`} disabled={empties === 0}
            onClick={() => setCells(fillCard(cells, bank, candidates))}
            aria-label={`Rellenar ${empties} huecos al azar`} title="Rellenar huecos al azar"
          ><IconSparkles /></button>
          <button
            className="icon-btn" disabled={empties === total}
            onClick={() => setConfirmReset(true)}
            aria-label="Cartón nuevo al azar" title="Cartón nuevo al azar"
          ><IconShuffle /></button>
        </div>
        {status === 'error' && (
          <p className="save-error" role="alert">
            Tu cartón no se ha guardado. Reintentando…
            <button className="btn small" onClick={retry}>Reintentar ya</button>
          </p>
        )}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="¿Cartón nuevo?"
          text={`Se cambian tus ${total - empties} casillas por eventos al azar. Lo que tenías se pierde.`}
          confirm="Barajar"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { setCells(fillCard(Array<Cell>(total).fill(null), bank, candidates)); setConfirmReset(false); setOpen(null); }}
        />
      )}

      {editing ? (
        <EventPanel
          ctx={ctx}
          index={open}
          total={total}
          currentId={cells[open]}
          usedAt={usedAt}
          onPick={(id) => place(open, id)}
          onMove={(d) => { setDraft(null); setOpen(Math.min(total - 1, Math.max(0, open + d))); }}
          onClose={() => { setDraft(null); setOpen(null); }}
          onDraft={setDraft}
        />
      ) : wide && (
        <aside className="panel-dock idle" aria-label="Editor">
          <div className="idle-in">
            <h2 className="display">Edita tu cartón</h2>
            <p className="muted">Toca una casilla para elegir qué va en ella o escribir lo tuyo. Lo verás en el cartón al momento.</p>
          </div>
        </aside>
      )}
    </div>
  );
}
