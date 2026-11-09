import { useEffect, useMemo, useState } from 'react';
import { backend } from '../backend';
import { itemBody, itemText } from '../lib/suggestions';
import type { Candidate, Cell, Item } from '../types';
import type { RoomCtx } from './RoomScreen';
import FitText from './FitText';

export const acronym = (party = '') => (party.includes(' ') ? party.split(/\s+/).map((w) => w[0]).join('') : party);

/** Siglas del partido en su bloque de color. */
export function PartyMark({ cand, size = 20 }: { cand?: Candidate; size?: number }) {
  if (!cand) return null;
  const style = { '--cand': cand.color, '--mark': `${size}px` } as React.CSSProperties;
  return <span className="mark text" style={style} aria-hidden>{acronym(cand.party) || cand.name[0]}</span>;
}

export type TagSize = 'sm' | 'md' | 'lg';
const MARK_PX: Record<TagSize, number> = { sm: 18, md: 24, lg: 40 };

/**
 * EL rótulo de candidato (estilo debate de tele): bloque de color + marca del partido + apellido.
 * Es el único componente para pintar a un candidato en toda la app; solo cambia el tamaño.
 * Sin candidato pinta el mismo rótulo en neutro (General, Todos…).
 */
export function Tag({ cand, label, size = 'md' }: { cand?: Candidate; label?: string; size?: TagSize }) {
  return (
    <span className={`tag tag-${size}`} style={{ '--cand': cand?.color ?? '#3a3a3a', '--mark': `${MARK_PX[size]}px` } as React.CSSProperties}>
      {cand && <PartyMark cand={cand} size={MARK_PX[size]} />}
      <span className="tag-name">{label ?? cand?.name}</span>
    </span>
  );
}

export function CandTag({ index, candidates, size }: { index: number | null; candidates: Candidate[]; size?: TagSize }) {
  if (index == null) return <Tag label="General" size={size} />;
  return <Tag cand={candidates[index]} size={size} />;
}

type Filter = 'all' | 'g' | number;

/**
 * Fila de rótulos para elegir candidato.
 * - modo filtro (por defecto): ninguno marcado = todos; tocar el marcado lo desmarca.
 * - modo elegir (pick): uno siempre marcado, General incluido.
 */
export function CandFilter({
  value, onChange, candidates, pick = false,
}: { value: Filter; onChange: (v: Filter) => void; candidates: Candidate[]; pick?: boolean }) {
  const opts: [Filter, React.ReactNode][] = [
    ['g', <Tag label="General" size="lg" />],
    ...candidates.map((c, i) => [i, <Tag cand={c} size="lg" />] as [number, React.ReactNode]),
  ];
  const active = (v: Filter) => value === v;
  return (
    <div className={`cand-pick ${!pick && value === 'all' ? 'none' : ''}`} role="group" aria-label={pick ? 'Candidato' : 'Filtrar por candidato'} style={{ '--cols': opts.length } as React.CSSProperties}>
      {opts.map(([v, tag]) => (
        <button
          type="button" key={String(v)} className="tag-btn" aria-pressed={active(v)}
          onClick={() => onChange(!pick && active(v) ? 'all' : v)}
        >{tag}</button>
      ))}
    </div>
  );
}

export function matchesFilter(item: Item, f: Filter) {
  return f === 'all' || (f === 'g' ? item.candidate == null : item.candidate === f);
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lo que va dentro de una casilla: rótulo + acción. Igual en editor, partida y vista previa. */
export function CellFace({ item, candidates }: { item: Pick<Item, 'text' | 'candidate'>; candidates: Candidate[] }) {
  return (
    <>
      <span className="cell-tag"><CandTag index={item.candidate} candidates={candidates} size="sm" /></span>
      <FitText className="cell-text">{itemBody(item, candidates)}</FitText>
    </>
  );
}

/** Pantalla completa tipo menú de videojuego para opciones, guía y confirmaciones. */
export function Screen({ title, label, onClose, children }: {
  /** sin título si la pantalla ya se explica sola */
  title?: React.ReactNode; label?: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="screen" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <div className="screen-head">
        <button className="btn ghost small back-btn" onClick={onClose}><span aria-hidden>←</span> Volver</button>
      </div>
      <div className="screen-body">
        <div className="screen-inner">
          {title && <h2 className="display screen-title">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Diálogo de confirmación centrado en la pantalla. */
export function ConfirmDialog({
  title, text, confirm, onConfirm, onCancel,
}: { title: string; text: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title" className="display">{title}</h2>
        <p>{text}</p>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>Cancelar</button>
          <button className="btn hot" onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Escribir un evento propio: de quién + qué pasa, con vista previa de la casilla. */
export function EventComposer({
  ctx, initialCand = null, submitLabel, onAdded, onDraft,
}: {
  ctx: RoomCtx; initialCand?: number | null; submitLabel: string;
  onAdded: (item: Item) => void;
  /** recibe el evento a medio escribir para pintarlo en vivo en el cartón */
  onDraft: (draft: Pick<Item, 'text' | 'candidate'> | null) => void;
}) {
  const { snap, me, run } = ctx;
  const candidates = snap.room.candidates;
  const [cand, setCand] = useState<number | null>(initialCand);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const t = text.trim();
  const stored = cand != null && t && !t.includes('{c}') ? `{c} ${lowerFirst(t)}` : t;
  useEffect(() => { onDraft(t ? { text: stored, candidate: cand } : null); }, [stored, cand]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDraft(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const dup = t && snap.items.some((i) => i.candidate === cand && norm(itemText(i, candidates)) === norm(itemText({ text: stored, candidate: cand }, candidates)));

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!t || dup) return;
        setBusy(true);
        run(async () => {
          const [item] = await backend.addItems(snap.room.id, me.id, [{ text: stored, candidate: cand }]);
          setText('');
          onAdded(item);
        }).finally(() => setBusy(false));
      }}
    >
      <div className="field">
        <span>¿De quién?</span>
        <CandFilter pick value={cand ?? 'g'} onChange={(v) => setCand(v === 'g' || v === 'all' ? null : v)} candidates={candidates} />
      </div>
      <label className="field">
        <span>¿Qué va a pasar?</span>
        <div className="composer-input">
          <input
            value={text} onChange={(e) => setText(e.target.value)} maxLength={100} autoFocus
            placeholder={cand != null ? 'se le cae el boli' : 'Alguien se equivoca de nombre'}
          />
        </div>
      </label>
      {dup && <p className="warn">Ese evento ya existe en el banco.</p>}
      <div className="composer-foot">
        <button className="btn" disabled={!t || !!dup || busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

/**
 * Panel de edición acoplado (lateral en ordenador, mitad inferior en móvil).
 * Todo lo que haces se ve en el cartón al momento.
 */
export function EventPanel({
  ctx, index, total, currentId, usedAt, onPick, onMove, onClose, onDraft,
}: {
  ctx: RoomCtx; index: number; total: number; currentId: string | null; usedAt: Map<string, number>;
  onPick: (id: string) => void; onMove: (delta: number) => void; onClose: () => void;
  onDraft: (d: Pick<Item, 'text' | 'candidate'> | null) => void;
}) {
  const { snap } = ctx;
  const candidates = snap.room.candidates;
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const nq = norm(q.trim());
    return snap.items
      .filter((i) => matchesFilter(i, filter))
      .filter((i) => !nq || norm(itemText(i, candidates)).includes(nq))
      .sort((a, b) => Number(usedAt.has(a.id)) - Number(usedAt.has(b.id)));
  }, [snap.items, filter, q, candidates, usedAt]);

  return (
    <aside className="panel-dock" aria-label={`Editar casilla ${index + 1}`}>
      <div className="dock-head">
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Casilla anterior">◀</button>
        <h2 className="display">Casilla {index + 1}<span className="muted">/{total}</span></h2>
        <button className="icon-btn" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Casilla siguiente">▶</button>
        <button className="btn ghost small" onClick={onClose}>Listo</button>
      </div>

      <div className="dock-tabs seg small" role="tablist">
        <button role="tab" aria-selected={mode === 'list'} onClick={() => setMode('list')}>Elegir</button>
        <button role="tab" aria-selected={mode === 'new'} onClick={() => setMode('new')}>Escribir</button>
      </div>

      <div className="dock-body">
        {mode === 'new' ? (
          <EventComposer
            key={index}
            ctx={ctx} initialCand={typeof filter === 'number' ? filter : null}
            submitLabel="Poner en la casilla" onDraft={onDraft}
            onAdded={(it) => { onPick(it.id); setMode('list'); }}
          />
        ) : (
          <>
            <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento…" aria-label="Buscar evento" />
            <CandFilter value={filter} onChange={setFilter} candidates={candidates} />
            <ul className="pick-list">
              {list.map((it) => {
                const at = usedAt.get(it.id);
                const here = it.id === currentId;
                return (
                  <li key={it.id}>
                    <button className={`pick ${here ? 'current' : ''}`} onClick={() => onPick(it.id)} disabled={here}>
                      <CandTag index={it.candidate} candidates={candidates} />
                      <span className="pick-text">{itemBody(it, candidates)}</span>
                      {at != null && <small className="pick-meta">{here ? 'Aquí' : `En la ${at + 1} · cambiar`}</small>}
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="empty-line">Nada con ese filtro. Escríbelo tú.</li>}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

/** Reparto del cartón como barra de hemiciclo: un tramo por candidato y los huecos. */
export function SeatBar({ cells, items, candidates }: { cells: Cell[]; items: Item[]; candidates: Candidate[] }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const per = candidates.map(() => 0);
  let general = 0;
  let filled = 0;
  for (const id of cells) {
    const it = id != null ? byId.get(id) : undefined;
    if (!it) continue;
    filled++;
    if (it.candidate == null) general++;
    else per[it.candidate]++;
  }
  const empty = cells.length - filled;
  const max = Math.max(...per);
  const warning =
    filled >= cells.length / 2 && per.some((n) => n === 0) ? `${candidates[per.indexOf(0)].name} no sale en tu cartón`
      : max > cells.length / 2 ? 'Mucho de un mismo candidato'
        : null;

  const seats = [
    ...candidates.map((c, i) => ({ key: String(i), n: per[i], label: acronym(c.party) || c.name, color: c.color, name: c.name })),
    { key: 'g', n: general, label: 'GEN', color: '#3a3a3a', name: 'General' },
  ];
  return (
    <div className="seatbar-wrap">
      <div className="seatbar" role="img" aria-label={seats.map((s) => `${s.name} ${s.n}`).join(', ') + (empty ? `, ${empty} huecos` : '')}>
        {seats.filter((s) => s.n > 0).map((s) => (
          <span key={s.key} className="seat" style={{ flexGrow: s.n, '--cand': s.color } as React.CSSProperties}>
            <b>{s.label}</b><i className="num">{s.n}</i>
          </span>
        ))}
        {empty > 0 && <span className="seat empty" style={{ flexGrow: empty }}><i className="num">{empty}</i></span>}
      </div>
      {warning && <p className="warn">{warning}</p>}
    </div>
  );
}
