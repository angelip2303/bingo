import { backend } from '../backend';
import { itemBody } from '../lib/suggestions';
import type { Claim } from '../types';
import { CandTag } from './shared';
import type { RoomCtx } from './RoomScreen';

/** El VAR: cantes pendientes, votos de la grada y decisión del árbitro. */
export default function Var({ ctx }: { ctx: RoomCtx }) {
  const { snap } = ctx;
  const pending = snap.claims.filter((c) => c.status === 'pending');
  const history = snap.claims.filter((c) => c.status !== 'pending').sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));
  const referee = snap.players.find((p) => p.id === snap.room.referee_id);

  return (
    <section className="var">
      <div className="section-head">
        <h2 className="display">VAR</h2>
        <span className="muted small">Árbitro: <b>{referee?.name ?? 'nadie'}</b></span>
      </div>

      {pending.length === 0 ? (
        <p className="empty-line">Nada en revisión. Cuando alguien cante un evento aparecerá aquí.</p>
      ) : (
        <ul className="claims">{pending.map((c) => <ClaimRow key={c.id} claim={c} ctx={ctx} />)}</ul>
      )}

      {history.length > 0 && (
        <>
          <h3 className="sub">Decisiones</h3>
          <ul className="claims history">{history.map((c) => <ClaimRow key={c.id} claim={c} ctx={ctx} />)}</ul>
        </>
      )}
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
  const pending = claim.status === 'pending';
  if (!item) return null;

  return (
    <li className={`claim ${claim.status}`}>
      <div className="claim-top">
        <CandTag index={item.candidate} candidates={snap.room.candidates} />
        <span className="muted small">
          {who} {pending ? 'canta' : claim.status === 'accepted' ? '· validado' : '· tarjeta amarilla'}
        </span>
      </div>
      <p className="claim-text">{itemBody(item, snap.room.candidates)}</p>

      {pending && (
        <>
          <div className="votes" aria-label={`${yes} a favor, ${no} en contra`}>
            <span className="vote-bar"><i style={{ width: `${(yes / (yes + no)) * 100}%` }} /></span>
            <span className="small"><b>{yes}</b> sí · <b>{no}</b> no</span>
          </div>
          <div className="row-actions">
            {claim.player_id !== me.id && (
              <>
                <button className="btn ghost" aria-pressed={myVote === true} onClick={() => run(() => backend.vote(claim.id, me.id, true))}>Ha pasado</button>
                <button className="btn ghost" aria-pressed={myVote === false} onClick={() => run(() => backend.vote(claim.id, me.id, false))}>Mentira</button>
              </>
            )}
          </div>
          {isReferee && (
            <div className="ref-actions">
              <button className="btn good" onClick={() => run(() => backend.resolveClaim(claim.id, true))}>Validar</button>
              <button className="btn yellow" onClick={() => run(() => backend.resolveClaim(claim.id, false))}>Tarjeta amarilla</button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
