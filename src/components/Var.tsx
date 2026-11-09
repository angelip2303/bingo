import { useMemo, useState } from 'react';
import { backend } from '../backend';
import { itemBody, itemText } from '../lib/suggestions';
import { useMediaQuery, vibrate } from '../lib/useRoom';
import type { Claim, Item } from '../types';
import { CandFilter, CandTag, matchesFilter } from './shared';
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
  const wide = useMediaQuery('(min-width: 900px)');
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

  // árbitro en ordenador: panel de pitar siempre a la derecha, como el editor del cartón
  const panelOpen = live && (browsing || (wide && isReferee));
  const pinned = wide && isReferee;
  const openButton = live && !panelOpen && (
    <button className={`btn big ${isReferee ? 'hot' : ''}`} onClick={() => setBrowsing(true)}>
      {isReferee ? 'Pitar' : 'Cantar un evento'}
    </button>
  );
  // barra fija al pie, separada de la lista (como la barra de estado del cartón)
  const actionBar = live && !panelOpen && (
    <div className="var-actions">
      <button className={`btn big ${isReferee ? 'hot' : ''}`} onClick={() => setBrowsing(true)}>
        {isReferee ? 'Pitar un evento' : 'Cantar un evento'}
      </button>
    </div>
  );
  const empty = pending.length === 0 && timeline.length === 0;

  return (
    <section className={`var ${live ? 'editor' : ''} ${panelOpen ? 'editing' : ''}`}>
      <div className="editor-main var-main">
        {empty ? (
          <div className="var-empty">
            <h2 className="display">Sin jugadas</h2>
            <p className="muted">Todavía no ha pasado nada. Cuando alguien cante o el árbitro pite, aparecerá aquí.</p>
            {openButton}
            <p className="muted small">Árbitro: <b>{referee?.name ?? 'nadie'}</b></p>
          </div>
        ) : (
          <>
           <div className="var-scroll">
            {pending.length > 0 && <VarCheck claims={pending} ctx={ctx} />}

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
           </div>
            {actionBar}
          </>
        )}
      </div>
      {panelOpen && <WhistlePanel ctx={ctx} referee={isReferee} onClose={pinned ? undefined : () => setBrowsing(false)} />}
    </section>
  );
}

/**
 * Buscar entre los eventos que aún no han pasado.
 * Árbitro: pita varios seguidos sin salir, ordenados por cuántos cartones afectan, con deshacer.
 * Jugador: canta uno y vuelve.
 */
function WhistlePanel({ ctx, referee, onClose }: { ctx: RoomCtx; referee: boolean; onClose?: () => void }) {
  const { snap, me, run } = ctx;
  const candidates = snap.room.candidates;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'g' | number>('all');
  const [last, setLast] = useState<Item | null>(null);
  const pendingIds = new Set(snap.claims.filter((c) => c.status === 'pending').map((c) => c.item_id));
  const inCards = new Map<string, number>();
  snap.cards.forEach((c) => c.cells.forEach((id) => inCards.set(id, (inCards.get(id) ?? 0) + 1)));
  const myCard = new Set(snap.cards.find((c) => c.player_id === me.id)?.cells ?? []);
  const nq = norm(q.trim());
  const list = snap.items
    .filter((i) => !i.happened_at && !pendingIds.has(i.id))
    .filter((i) => matchesFilter(i, filter))
    .filter((i) => !nq || norm(itemText(i, candidates)).includes(nq))
    .sort((a, b) => (inCards.get(b.id) ?? 0) - (inCards.get(a.id) ?? 0));

  const select = (it: Item) => {
    vibrate(40);
    if (referee) {
      setLast(it);
      run(() => backend.setHappened(it.id, true));
    } else {
      onClose?.();
      run(() => backend.claim(snap.room.id, me.id, it.id));
    }
  };

  return (
    <aside className="panel-dock" aria-label={referee ? 'Pitar' : 'Cantar'}>
      <div className="dock-head">
        <h2 className="display dock-title">{referee ? 'Pitar' : 'Cantar'}</h2>
        {onClose && <button className="btn ghost small" onClick={onClose}>Listo</button>}
      </div>
      <div className="dock-body">
      <p className="muted small">
        {referee
          ? 'Toca lo que acaba de pasar. Cuenta al momento para todos, sin pasar por el VAR.'
          : 'Si ha pasado algo que no está en tu cartón, cántalo igual: si el árbitro lo valida, ganas el punto.'}
      </p>
      {last && (
        <div className="whistle-done" role="status">
          <span>Pitado: <b>{itemText(last, candidates)}</b></span>
          <button className="btn small ghost" onClick={() => { const it = last; setLast(null); run(() => backend.setHappened(it.id, false)); }}>Deshacer</button>
        </div>
      )}
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento…" aria-label="Buscar evento" />
      <CandFilter value={filter} onChange={setFilter} candidates={candidates} />
      <ul className="pick-list">
        {list.map((it) => {
          const count = inCards.get(it.id) ?? 0;
          return (
            <li key={it.id} data-id={it.id}>
              <button className="pick" onClick={() => select(it)}>
                <CandTag index={it.candidate} candidates={candidates} />
                <span className="pick-text">{itemBody(it, candidates)}</span>
                <small className="pick-meta">
                  {referee ? (count ? `${count} ${count === 1 ? 'cartón' : 'cartones'}` : 'Nadie') : myCard.has(it.id) ? 'En tu cartón' : ''}
                </small>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="empty-line">Nada con ese filtro.</li>}
      </ul>
      </div>
    </aside>
  );
}

/** Recuadro "VAR revisando": un cante cada vez, flechas si hay cola. */
function VarCheck({ claims, ctx }: { claims: Claim[]; ctx: RoomCtx }) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, claims.length - 1);
  return (
    <section className="var-check" aria-label="VAR revisando">
      <div className="vc-head">
        <span className="vc-badge">VAR</span>
        <span className="vc-title">Revisando</span>
        {(
          <span className="vc-nav">
            <button className="icon-btn" onClick={() => setI(Math.max(0, idx - 1))} disabled={idx === 0} aria-label="Cante anterior">◀</button>
            <b className="num">{idx + 1}/{claims.length}</b>
            <button className="icon-btn" onClick={() => setI(Math.min(claims.length - 1, idx + 1))} disabled={idx === claims.length - 1} aria-label="Cante siguiente">▶</button>
          </span>
        )}
      </div>
      <ClaimRow claim={claims[idx]} ctx={ctx} />
    </section>
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
    <div className="claim pending">
      <div className="claim-top">
        <CandTag index={item.candidate} candidates={snap.room.candidates} />
        <span className="muted small">{who} canta · {hhmm(claim.created_at)}</span>
      </div>
      <p className="claim-text">{itemBody(item, snap.room.candidates)}</p>
      <div className="votes" aria-label={`${yes} a favor, ${no} en contra`}>
        <span className="vote-bar"><i style={{ width: `${(yes / (yes + no)) * 100}%` }} /></span>
        <span className="small"><b>{yes}</b> sí · <b>{no}</b> no</span>
      </div>
      {claim.player_id === me.id && <div className="row-actions own-claim">Es tu cante: espera al árbitro</div>}
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
    </div>
  );
}
