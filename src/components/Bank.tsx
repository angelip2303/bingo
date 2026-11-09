import { useMemo, useState } from 'react';
import { backend } from '../backend';
import { itemBody, itemText } from '../lib/suggestions';
import { CandFilter, CandTag, EventComposer, Screen, matchesFilter } from './shared';
import type { RoomCtx } from './RoomScreen';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Banco común de eventos. El árbitro puede pitar cualquiera directamente. */
export default function Bank({ ctx }: { ctx: RoomCtx }) {
  const { snap, me, isReferee, run } = ctx;
  const candidates = snap.room.candidates;
  const [filter, setFilter] = useState<'all' | 'g' | number>('all');
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(false);
  const live = snap.room.status === 'live';
  const lobby = snap.room.status === 'lobby';
  const myCard = new Set(snap.cards.find((c) => c.player_id === me.id)?.cells ?? []);
  const inCards = new Map<string, number>();
  snap.cards.forEach((c) => c.cells.forEach((id) => inCards.set(id, (inCards.get(id) ?? 0) + 1)));
  const pendingIds = new Set(snap.claims.filter((c) => c.status === 'pending').map((c) => c.item_id));
  const done = snap.items.filter((i) => i.happened_at).length;

  const list = useMemo(() => {
    const nq = norm(q.trim());
    return snap.items
      .filter((it) => matchesFilter(it, filter))
      .filter((it) => !nq || norm(itemText(it, candidates)).includes(nq))
      // en partida: lo pendiente arriba y lo que ya pasó al fondo
      .sort((a, b) => Number(!!a.happened_at) - Number(!!b.happened_at) || (inCards.get(b.id) ?? 0) - (inCards.get(a.id) ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.items, snap.cards, filter, q, candidates]);

  return (
    <section className="bank">
      <div className="view-head">
        <h2 className="display">Eventos</h2>
        <span className="muted small">{lobby ? `${snap.items.length} en el banco` : `${done} de ${snap.items.length} han pasado`}</span>
      </div>

      <div className="bank-tools">
        <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento…" aria-label="Buscar evento" />
        {snap.room.status !== 'finished' && <button className="btn" onClick={() => setComposing(true)}>Nuevo evento</button>}
      </div>
      <CandFilter value={filter} onChange={setFilter} candidates={candidates} />

      <ul className="bank-list">
        {list.map((it) => {
          const count = inCards.get(it.id) ?? 0;
          const canDelete = lobby && (isReferee || it.created_by === me.id);
          const canClaim = live && !isReferee && !it.happened_at && !pendingIds.has(it.id);
          return (
            <li key={it.id} data-id={it.id} className={`bank-item ${it.happened_at ? 'done' : ''} ${myCard.has(it.id) ? 'mine' : ''}`}>
              <div className="bank-text">
                <CandTag index={it.candidate} candidates={candidates} size="sm" />
                <span>{itemBody(it, candidates)}</span>
                <small className="bank-meta">
                  {it.happened_at ? 'Ha pasado' : pendingIds.has(it.id) ? 'En el VAR' : count ? `${count} ${count === 1 ? 'cartón' : 'cartones'}` : 'Nadie lo lleva'}
                  {myCard.has(it.id) && ' · en el tuyo'}
                </small>
              </div>
              <div className="bank-actions">
                {isReferee && !lobby && (
                  <button
                    className={`btn small ${it.happened_at ? 'ghost' : 'good'}`}
                    onClick={() => run(() => backend.setHappened(it.id, !it.happened_at))}
                  >{it.happened_at ? 'Anular' : 'Pitar'}</button>
                )}
                {canClaim && (
                  <button className="btn small ghost" onClick={() => run(() => backend.claim(snap.room.id, me.id, it.id))}>Cantar</button>
                )}
                {canDelete && (
                  <button className="icon-btn" aria-label={`Borrar ${itemText(it, candidates)}`} onClick={() => run(() => backend.deleteItem(it.id))}>✕</button>
                )}
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="empty-line">Nada por aquí. ¿Lo escribes tú?</li>}
      </ul>

      {composing && (
        <Screen title="Evento nuevo" onClose={() => setComposing(false)}>
          <EventComposer
            ctx={ctx} initialCand={typeof filter === 'number' ? filter : null}
            onAdded={() => setComposing(false)} onCancel={() => setComposing(false)}
          />
        </Screen>
      )}
    </section>
  );
}
