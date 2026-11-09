import { useEffect, useMemo, useRef, useState } from 'react';
import { backend } from '../backend';
import { fillCard, itemText } from '../lib/suggestions';
import type { Item } from '../types';
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

  const [cells, setCells] = useState<string[]>(() => {
    const base = saved?.cells ?? [];
    return Array.from({ length: total }, (_, i) => base[i] ?? '');
  });
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [confirmReset, setConfirmReset] = useState(false);

  // casillas cuyo evento se borró del banco cuentan como vacías
  const view = cells.map((id) => (byId.has(id) ? id : ''));
  const empties = view.filter((x) => !x).length;
  const usedAt = useMemo(() => new Map(view.flatMap((id, i) => (id ? [[id, i] as [string, number]] : []))), [view.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // guardado automático
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus('saving');
    const t = setTimeout(async () => {
      try { await backend.saveCard(snap.room.id, me.id, cells); setStatus('saved'); }
      catch { setStatus('error'); }
    }, 400);
    return () => clearTimeout(t);
  }, [cells, snap.room.id, me.id]);


  /** Pone un evento en la casilla (si ya estaba en otra, intercambia) y salta al siguiente hueco. */
  const place = (idx: number, id: string) => {
    const next = cells.map((x) => (byId.has(x) || x === id ? x : ''));
    const from = next.indexOf(id);
    if (from >= 0 && from !== idx) next[from] = next[idx];
    next[idx] = id;
    setCells(next);
    setDraft(null);
    const after = next.findIndex((x, i) => !x && i > idx);
    const any = next.findIndex((x) => !x);
    if (after >= 0) setOpen(after);
    else if (any >= 0) setOpen(any);
  };

  const editing = open != null;

  return (
    <div className={`stage-view editor ${editing ? 'editing' : ''}`}>
      <div className="editor-main">
        <div className="stage">
          <div className="grid" style={{ '--n': n } as React.CSSProperties}>
            {view.map((id, i) => {
              const showDraft = i === open && draft;
              const it = showDraft ? draft : id ? byId.get(id) : null;
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
                    <button className="cell-clear" onClick={() => setCells(view.map((x, j) => (j === i ? '' : x)))} aria-label={`Vaciar casilla ${i + 1}`}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="statusbar">
          <SeatBar cells={view} items={bank} candidates={candidates} />
          <button
            className={`icon-btn ${empties === total ? 'nudge' : ''}`} disabled={empties === 0}
            onClick={() => setCells(fillCard(view, bank, candidates.length))}
            aria-label={`Rellenar ${empties} huecos al azar`} title="Rellenar huecos al azar"
          ><IconSparkles /></button>
          <button
            className="icon-btn" disabled={empties === total}
            onClick={() => setConfirmReset(true)}
            aria-label="Cartón nuevo al azar" title="Cartón nuevo al azar"
          ><IconShuffle /></button>
        </div>
        {status === 'error' && <p className="error small" role="status">No se ha podido guardar el cartón</p>}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="¿Cartón nuevo?"
          text={`Se cambian tus ${total - empties} casillas por eventos al azar. Lo que tenías se pierde.`}
          confirm="Barajar"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { setCells(fillCard(Array(total).fill(''), bank, candidates.length)); setConfirmReset(false); setOpen(null); }}
        />
      )}

      {editing && (
        <EventPanel
          ctx={ctx}
          index={open}
          total={total}
          currentId={view[open] || null}
          usedAt={usedAt}
          onPick={(id) => place(open, id)}
          onMove={(d) => { setDraft(null); setOpen(Math.min(total - 1, Math.max(0, open + d))); }}
          onClose={() => { setDraft(null); setOpen(null); }}
          onDraft={setDraft}
        />
      )}
    </div>
  );
}
