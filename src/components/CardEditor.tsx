import { useEffect, useMemo, useRef, useState } from 'react';
import { backend } from '../backend';
import { balance, fillCard, itemBody, itemText } from '../lib/suggestions';
import { AddItemForm, CandFilter, CandTag, matchesFilter } from './shared';
import type { RoomCtx } from './RoomScreen';

export default function CardEditor({ ctx }: { ctx: RoomCtx }) {
  const { snap, me } = ctx;
  const n = snap.room.board_size;
  const total = n * n;
  const bank = snap.items;
  const bankIds = useMemo(() => new Set(bank.map((b) => b.id)), [bank]);
  const saved = snap.cards.find((c) => c.player_id === me.id);

  const [cells, setCells] = useState<string[]>(() => {
    const base = saved?.cells ?? [];
    return Array.from({ length: total }, (_, i) => base[i] ?? '');
  });
  const [selected, setSelected] = useState<number | null>(0);
  const [filter, setFilter] = useState<'all' | 'g' | number>('all');
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // limpia casillas cuyo evento se borró del banco
  const view = cells.map((id) => (bankIds.has(id) ? id : ''));

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

  const put = (id: string) => {
    setCells((prev) => {
      const next = prev.map((x) => (bankIds.has(x) ? x : ''));
      const target = selected ?? next.findIndex((x) => !x);
      if (target < 0) return prev;
      const existing = next.indexOf(id);
      if (existing >= 0) next[existing] = next[target]; // si ya estaba, intercambia
      next[target] = id;
      // salta al siguiente hueco
      const after = next.findIndex((x, i) => !x && i > target);
      const anyEmpty = next.findIndex((x) => !x);
      setSelected(after >= 0 ? after : anyEmpty >= 0 ? anyEmpty : null);
      return next;
    });
  };

  const bal = balance(view, bank, snap.room.candidates.length);
  const used = new Set(view.filter(Boolean));
  const list = bank.filter((it) => matchesFilter(it, filter));
  const byId = (id: string) => bank.find((b) => b.id === id);

  return (
    <div className="editor">
      <section className="editor-card">
        <div className="section-head">
          <h2 className="display">Tu cartón</h2>
          <span className={`save-state ${status}`} role="status">
            {status === 'saving' ? 'Guardando…' : status === 'error' ? 'Error al guardar' : bal.filled === total ? 'Completo y guardado' : `${bal.filled}/${total} casillas`}
          </span>
        </div>

        <div className="grid" style={{ '--n': n } as React.CSSProperties}>
          {view.map((id, i) => {
            const it = id ? byId(id) : null;
            return (
              <button
                key={i}
                className={`cell ${it ? 'filled' : 'empty'} ${selected === i ? 'selected' : ''}`}
                style={it?.candidate != null ? ({ '--cand': snap.room.candidates[it.candidate]?.color } as React.CSSProperties) : undefined}
                onClick={() => setSelected(selected === i ? null : i)}
                aria-label={it ? `Casilla ${i + 1}: ${itemText(it, snap.room.candidates)}` : `Casilla ${i + 1} vacía`}
                aria-pressed={selected === i}
              >
                {it && it.candidate != null && <span className="cell-tag"><CandTag index={it.candidate} candidates={snap.room.candidates} size="sm" /></span>}
                {it ? <span className="cell-text">{itemBody(it, snap.room.candidates)}</span> : <span className="plus" aria-hidden>+</span>}
              </button>
            );
          })}
        </div>

        <div className="balance" aria-label="Reparto por candidato">
          {snap.room.candidates.map((c, i) => (
            <span key={i} className="bal"><CandTag index={i} candidates={snap.room.candidates} /><b className="num">{bal.per[i]}</b></span>
          ))}
          <span className="bal"><CandTag index={null} candidates={snap.room.candidates} /><b className="num">{bal.general}</b></span>
        </div>
        {bal.warning && <p className="warn">{bal.warning}</p>}

        <div className="row-actions">
          <button className="btn" onClick={() => setCells(fillCard(view, bank, snap.room.candidates.length))} disabled={bal.filled === total}>
            Rellenar huecos
          </button>
          <button className="btn ghost" onClick={() => setCells(fillCard(Array(total).fill(''), bank, snap.room.candidates.length))}>
            Cartón al azar
          </button>
          {selected != null && view[selected] && (
            <button className="btn ghost" onClick={() => setCells(view.map((x, i) => (i === selected ? '' : x)))}>Vaciar casilla</button>
          )}
        </div>
      </section>

      <section className="editor-bank">
        <div className="section-head">
          <h2 className="display">Elige eventos</h2>
          <span className="muted small">
            {selected != null ? `Para la casilla ${selected + 1}` : 'Toca una casilla primero'}
          </span>
        </div>
        <CandFilter value={filter} onChange={setFilter} candidates={snap.room.candidates} />
        <ul className="pick-list">
          {list.map((it) => (
            <li key={it.id}>
              <button className={`pick ${used.has(it.id) ? 'used' : ''}`} onClick={() => put(it.id)}>
                <CandTag index={it.candidate} candidates={snap.room.candidates} />
                <span>{itemBody(it, snap.room.candidates)}</span>
                {used.has(it.id) && <small className="muted">En tu cartón</small>}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted">No hay eventos con este filtro.</li>}
        </ul>
        <AddItemForm ctx={ctx} onAdded={(item) => { bankIds.add(item.id); put(item.id); }} />
      </section>
    </div>
  );
}
