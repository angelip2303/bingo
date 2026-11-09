import { useState } from 'react';
import { backend } from '../backend';
import { itemBody, itemText } from '../lib/suggestions';
import { AddItemForm, CandFilter, CandTag, matchesFilter } from './shared';
import type { RoomCtx } from './RoomScreen';

/** Banco común de eventos. El árbitro puede pitar cualquiera directamente. */
export default function Bank({ ctx }: { ctx: RoomCtx }) {
  const { snap, me, isReferee, run } = ctx;
  const [filter, setFilter] = useState<'all' | 'g' | number>('all');
  const [show, setShow] = useState<'all' | 'done' | 'open'>('all');
  const live = snap.room.status === 'live';
  const lobby = snap.room.status === 'lobby';
  const inCards = new Map<string, number>();
  snap.cards.forEach((c) => c.cells.forEach((id) => inCards.set(id, (inCards.get(id) ?? 0) + 1)));
  const pendingIds = new Set(snap.claims.filter((c) => c.status === 'pending').map((c) => c.item_id));

  const list = snap.items
    .filter((it) => matchesFilter(it, filter))
    .filter((it) => show === 'all' || (show === 'done' ? !!it.happened_at : !it.happened_at))
    .sort((a, b) => (inCards.get(b.id) ?? 0) - (inCards.get(a.id) ?? 0));

  return (
    <section className="bank">
      <div className="section-head">
        <h2 className="display">Eventos</h2>
        <span className="muted small">{snap.items.length} en el banco</span>
      </div>
      <p className="muted small">
        {isReferee
          ? 'Eres el árbitro: puedes marcar cualquier evento como pasado sin esperar a que alguien lo cante.'
          : 'Los cartones de todos salen de aquí. Puedes cantar cualquier evento, aunque no esté en tu cartón.'}
      </p>

      <CandFilter value={filter} onChange={setFilter} candidates={snap.room.candidates} />
      <div className="seg small">
        {([['all', 'Todos'], ['open', 'Pendientes'], ['done', 'Han pasado']] as const).map(([v, l]) => (
          <button key={v} aria-pressed={show === v} onClick={() => setShow(v)}>{l}</button>
        ))}
      </div>

      <ul className="bank-list">
        {list.map((it) => {
          const count = inCards.get(it.id) ?? 0;
          const canDelete = lobby && (isReferee || it.created_by === me.id);
          return (
            <li key={it.id} className={`bank-item ${it.happened_at ? 'done' : ''}`}>
              <div className="bank-text">
                <CandTag index={it.candidate} candidates={snap.room.candidates} />
                <span>{itemBody(it, snap.room.candidates)}</span>
                <small className="muted">
                  {count ? `En ${count} ${count === 1 ? 'cartón' : 'cartones'}` : 'En ningún cartón'}
                  {pendingIds.has(it.id) && ' · en el VAR'}
                </small>
              </div>
              <div className="bank-actions">
                {isReferee && !lobby && (
                  <button
                    className={`btn small ${it.happened_at ? 'ghost' : 'good'}`}
                    onClick={() => run(() => backend.setHappened(it.id, !it.happened_at))}
                  >{it.happened_at ? 'Anular' : 'Pitar'}</button>
                )}
                {!isReferee && live && !it.happened_at && !pendingIds.has(it.id) && (
                  <button className="btn small ghost" onClick={() => run(() => backend.claim(snap.room.id, me.id, it.id))}>Cantar</button>
                )}
                {canDelete && (
                  <button className="btn small ghost" aria-label={`Borrar ${itemText(it, snap.room.candidates)}`} onClick={() => run(() => backend.deleteItem(it.id))}>Borrar</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {snap.room.status !== 'finished' && <AddItemForm ctx={ctx} />}
    </section>
  );
}
