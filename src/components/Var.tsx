import { useMemo, useState } from 'react';
import { backend } from '../backend';
import { itemBody, itemText } from '../lib/suggestions';
import { vibrate } from '../lib/useRoom';
import type { Claim, Item } from '../types';
import { CandFilter, CandTag, Screen, matchesFilter } from './shared';
import type { RoomCtx } from './RoomScreen';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * El directo: cantes en revisión (votos + decisión del árbitro), cantar/pitar
 * cualquier evento y la cronología de lo que ha pasado.
 */
export default function Var({ ctx }: { ctx: RoomCtx }) {
  const { snap, me, isReferee, run } = ctx;
  const [browsing, setBrowsing] = useState(false);
  const lobby = snap.room.status === 'lobby';
  const live = snap.room.status === 'live';
  const pending = snap.claims.filter((c) => c.status === 'pending');
  const referee = snap.players.find((p) => p.id === snap.room.referee_id);

  const timeline = useMemo(() => {
    const name = (id: string) => snap.players.find((p) => p.id === id)?.name ?? '¿?';
    const entries: { at: string; kind: 'happened' | 'yellow'; item: Item; by: string }[] = [];
    for (const it of snap.items) {
      if (!it.happened_at) continue;
      const claim = snap.claims.find((c) => c.item_id === it.id && c.status === 'accepted');
      entries.push({ at: it.happened_at, kind: 'happened', item: it, by: claim ? `Lo cantó ${name(claim.player_id)}` : 'Pitado por el árbitro' });
    }
    for (const c of snap.claims) {
      if (c.status !== 'rejected') continue;
      const it = snap.items.find((i) => i.id === c.item_id);
      if (it) entries.push({ at: c.resolved_at ?? c.created_at, kind: 'yellow', item: it, by: `Tarjeta amarilla a ${name(c.player_id)}` });
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at));
  }, [snap]);

  if (lobby) {
    return (
      <section className="var">
        <div className="var-empty">
          <h2 className="display">El VAR</h2>
          <p className="muted">Cuando empiece el debate, aquí verás los cantes en revisión y todo lo que va pasando.</p>
          <p className="muted small">Árbitro: <b>{referee?.name ?? 'nadie'}</b></p>
        </div>
      </section>
    );
  }

  const browser = browsing && (
    <EventBrowser
      ctx={ctx}
      title={isReferee ? 'Pitar evento' : 'Cantar evento'}
      onSelect={(it) => {
        setBrowsing(false);
        vibrate(40);
        run(() => (isReferee ? backend.setHappened(it.id, true) : backend.claim(snap.room.id, me.id, it.id)));
      }}
      onClose={() => setBrowsing(false)}
    />
  );

  // nada en revisión y nada pasado: un único bloque centrado
  if (pending.length === 0 && timeline.length === 0) {
    return (
      <section className="var">
        <div className="var-empty">
          <h2 className="display">Sin jugadas</h2>
          <p className="muted">Todavía no ha pasado nada. Cuando alguien cante o el árbitro pite, aparecerá aquí.</p>
          {live && <button className="btn" onClick={() => setBrowsing(true)}>{isReferee ? 'Pitar un evento' : 'Cantar un evento'}</button>}
          <p className="muted small">Árbitro: <b>{referee?.name ?? 'nadie'}</b></p>
        </div>
        {browser}
      </section>
    );
  }

  return (
    <section className="var">
      <div className="view-head">
        <h2 className="display">En revisión</h2>
        <span className="muted small">Árbitro: <b>{referee?.name ?? 'nadie'}</b></span>
      </div>
      {pending.length === 0 ? (
        <p className="empty-line">Nada en revisión. Canta desde tu cartón o desde aquí.</p>
      ) : (
        <ul className="claims">{pending.map((c) => <ClaimRow key={c.id} claim={c} ctx={ctx} />)}</ul>
      )}
      {live && (
        <button className="btn ghost" onClick={() => setBrowsing(true)}>
          {isReferee ? 'Pitar un evento' : 'Cantar algo que no está en tu cartón'}
        </button>
      )}

      <div className="view-head timeline-head">
        <h2 className="display">Lo que ha pasado</h2>
        <span className="muted small">{snap.items.filter((i) => i.happened_at).length} eventos</span>
      </div>
      {timeline.length === 0 ? (
        <p className="empty-line">Todavía no ha pasado nada.</p>
      ) : (
        <ol className="timeline">
          {timeline.map((e) => (
            <li key={`${e.kind}-${e.item.id}-${e.at}`} className={e.kind}>
              <time className="tl-time">{hhmm(e.at)}</time>
              <div className="tl-body">
                <CandTag index={e.item.candidate} candidates={snap.room.candidates} size="sm" />
                <span className="tl-text">{itemBody(e.item, snap.room.candidates)}</span>
                <small className="tl-by">{e.by}</small>
              </div>
              {isReferee && e.kind === 'happened' && (
                <button className="btn small ghost" onClick={() => run(() => backend.setHappened(e.item.id, false))} aria-label={`Anular: ${itemText(e.item, snap.room.candidates)}`}>Anular</button>
              )}
            </li>
          ))}
        </ol>
      )}

      {browser}
    </section>
  );
}

/** Buscar entre los eventos que aún no han pasado y elegir uno. */
function EventBrowser({ ctx, title, onSelect, onClose }: { ctx: RoomCtx; title: string; onSelect: (it: Item) => void; onClose: () => void }) {
  const { snap } = ctx;
  const candidates = snap.room.candidates;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'g' | number>('all');
  const pendingIds = new Set(snap.claims.filter((c) => c.status === 'pending').map((c) => c.item_id));
  const nq = norm(q.trim());
  const list = snap.items
    .filter((i) => !i.happened_at && !pendingIds.has(i.id))
    .filter((i) => matchesFilter(i, filter))
    .filter((i) => !nq || norm(itemText(i, candidates)).includes(nq));

  return (
    <Screen title={title} onClose={onClose}>
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento…" aria-label="Buscar evento" autoFocus />
      <CandFilter value={filter} onChange={setFilter} candidates={candidates} />
      <ul className="pick-list">
        {list.map((it) => (
          <li key={it.id} data-id={it.id}>
            <button className="pick" onClick={() => onSelect(it)}>
              <CandTag index={it.candidate} candidates={candidates} />
              <span className="pick-text">{itemBody(it, candidates)}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="empty-line">Nada con ese filtro.</li>}
      </ul>
    </Screen>
  );
}

function ClaimRow({ claim, ctx }: { claim: Claim; ctx: RoomCtx }) {
  const { snap, me, isReferee, run } = ctx;
  const item = snap.items.find((i) => i.id === claim.item_id);
  const who = snap.players.find((p) => p.id === claim.player_id)?.name ?? '¿?';
  const votes = snap.votes.filter((v) => v.claim_id === claim.id);
  const yes = votes.filter((v) => v.value).length + 1; // quien canta vota sí
  const no = votes.filter((v) => !v.value).length;
  const myVote = claim.player_id === me.id ? true : votes.find((v) => v.player_id === me.id)?.value;
  if (!item) return null;

  return (
    <li className="claim pending">
      <div className="claim-top">
        <CandTag index={item.candidate} candidates={snap.room.candidates} />
        <span className="muted small">{who} canta · {hhmm(claim.created_at)}</span>
      </div>
      <p className="claim-text">{itemBody(item, snap.room.candidates)}</p>
      <div className="votes" aria-label={`${yes} a favor, ${no} en contra`}>
        <span className="vote-bar"><i style={{ width: `${(yes / (yes + no)) * 100}%` }} /></span>
        <span className="small"><b>{yes}</b> sí · <b>{no}</b> no</span>
      </div>
      {claim.player_id !== me.id && (
        <div className="row-actions">
          <button className="btn ghost" aria-pressed={myVote === true} onClick={() => run(() => backend.vote(claim.id, me.id, true))}>Ha pasado</button>
          <button className="btn ghost" aria-pressed={myVote === false} onClick={() => run(() => backend.vote(claim.id, me.id, false))}>Mentira</button>
        </div>
      )}
      {isReferee && (
        <div className="ref-actions">
          <button className="btn good" onClick={() => run(() => backend.resolveClaim(claim.id, true))}>Validar</button>
          <button className="btn yellow" onClick={() => run(() => backend.resolveClaim(claim.id, false))}>Tarjeta amarilla</button>
        </div>
      )}
    </li>
  );
}
