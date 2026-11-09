import { useState } from 'react';
import { backend } from '../backend';
import type { Candidate, Item } from '../types';
import type { RoomCtx } from './RoomScreen';

export function CandTag({ index, candidates }: { index: number | null; candidates: Candidate[] }) {
  if (index == null) return <span className="tag">General</span>;
  const c = candidates[index];
  return <span className="tag" style={{ '--cand': c?.color } as React.CSSProperties}>{c?.name ?? '¿?'}</span>;
}

export function CandFilter({
  value, onChange, candidates,
}: { value: 'all' | 'g' | number; onChange: (v: 'all' | 'g' | number) => void; candidates: Candidate[] }) {
  const opts: ['all' | 'g' | number, string, string?][] = [
    ['all', 'Todos'], ['g', 'General'], ...candidates.map((c, i) => [i, c.name, c.color] as [number, string, string]),
  ];
  return (
    <div className="chips" role="group" aria-label="Filtrar por candidato">
      {opts.map(([v, label, color]) => (
        <button
          key={String(v)} className="chip" aria-pressed={value === v} onClick={() => onChange(v)}
          style={color ? ({ '--cand': color } as React.CSSProperties) : undefined}
        >{label}</button>
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
