import { useState } from 'react';
import { backend } from '../backend';
import type { Candidate, Item } from '../types';
import type { RoomCtx } from './RoomScreen';

const brokenLogos = new Set<string>();

const acronym = (party = '') => (party.includes(' ') ? party.split(/\s+/).map((w) => w[0]).join('') : party);

/** Logo real del partido si está en public/logos; si no, sus siglas en tipografía (nunca un logo dibujado). */
export function PartyMark({ cand, size = 20 }: { cand?: Candidate; size?: number }) {
  const [broken, setBroken] = useState(() => !cand?.logo || brokenLogos.has(cand.logo));
  if (!cand) return null;
  const style = { '--cand': cand.color, '--mark': `${size}px` } as React.CSSProperties;
  if (!broken && cand.logo) {
    return (
      <span className="mark logo" style={style}>
        <img
          src={import.meta.env.BASE_URL + cand.logo} alt="" width={size} height={size}
          onError={() => { brokenLogos.add(cand.logo!); setBroken(true); }}
        />
      </span>
    );
  }
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

export function CandFilter({
  value, onChange, candidates,
}: { value: 'all' | 'g' | number; onChange: (v: 'all' | 'g' | number) => void; candidates: Candidate[] }) {
  const opts: ['all' | 'g' | number, React.ReactNode][] = [
    ['all', <Tag label="Todos" />],
    ['g', <Tag label="General" />],
    ...candidates.map((c, i) => [i, <Tag cand={c} />] as [number, React.ReactNode]),
  ];
  return (
    <div className="chips" role="group" aria-label="Filtrar por candidato">
      {opts.map(([v, tag]) => (
        <button key={String(v)} className="tag-btn" aria-pressed={value === v} onClick={() => onChange(v)}>{tag}</button>
      ))}
    </div>
  );
}

export function matchesFilter(item: Item, f: 'all' | 'g' | number) {
  return f === 'all' || (f === 'g' ? item.candidate == null : item.candidate === f);
}

/** Escribir un evento a mano. Usa {c} implícito: si eliges candidato, el nombre va delante. */
export function AddItemForm({ ctx, onAdded }: { ctx: RoomCtx; onAdded?: (item: Item) => void }) {
  const [text, setText] = useState('');
  const [cand, setCand] = useState<number | null>(null);
  const { snap, me, run } = ctx;
  return (
    <form
      className="add-item"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        run(async () => {
          // si eligen candidato y no lo nombran, lo ponemos delante: "{c} se tropieza"
          const final = cand != null && !t.includes('{c}') ? `{c} ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
          const [item] = await backend.addItems(snap.room.id, me.id, [{ text: final, candidate: cand }]);
          setText('');
          onAdded?.(item);
        });
      }}
    >
      <label className="field">
        <span>Escribe tu propio evento</span>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={110} placeholder="se le cae el boli" />
      </label>
      <div className="add-item-row">
        <select
          aria-label="De qué candidato" value={cand ?? ''}
          onChange={(e) => setCand(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">General</option>
          {snap.room.candidates.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
        </select>
        <button className="btn" disabled={!text.trim()}>Añadir evento</button>
      </div>
    </form>
  );
}
