import { useEffect, useState } from 'react';
import { backend } from '../backend';
import { goToRoom } from '../App';
import { seedItems } from '../lib/suggestions';
import { hallOfFame, type FameRow } from '../lib/history';
import type { Candidate } from '../types';
import type { Account } from '../backend/api';
import { validateUsername } from '../lib/account';
import { CandTag, OutStamp, Screen, candidateOrder } from './shared';

export const DEFAULT_CANDIDATES: Candidate[] = [
  { name: 'Sánchez', party: 'PSOE', color: '#e30613' },
  { name: 'Feijóo', party: 'PP', color: '#1d84ce' },
  { name: 'Abascal', party: 'VOX', color: '#5ac035', out: true }, // se ha cagado: no va al debate
  { name: 'Colau', party: 'Frente Amplio', color: '#d8256f' },
];

/** Cabecera común: piloto, título y los cuatro candidatos. */
function Masthead({ tag = 'En directo' }: { tag?: string }) {
  return (
    <header className="home-head">
      <span className="onair"><i aria-hidden /> {tag}</span>
      <h1 className="display huge">Bingo<br />Salvaje</h1>
      <div className="cand-row">
        {candidateOrder(DEFAULT_CANDIDATES).map((i) => {
          const c = DEFAULT_CANDIDATES[i];
          return (
            <span key={c.name} className={`cand-cell ${c.out ? 'cand-out' : ''}`}>
              <CandTag index={i} candidates={DEFAULT_CANDIDATES} size="lg" />
              {c.out && <OutStamp />}
            </span>
          );
        })}
      </div>
      {DEFAULT_CANDIDATES.filter((c) => c.out).map((c) => (
        <p key={c.name} className="out-note"><b>{c.name} no va al debate.</b> Cagadón histórico: sus casillas se han borrado de todos los cartones.</p>
      ))}
    </header>
  );
}

/**
 * Solo tu nombre. El mismo nombre en el ordenador y en el móvil = el mismo jugador,
 * así preparas el cartón días antes y juegas con el móvil. El dispositivo lo recuerda.
 */
export function LoginForm({ onDone, tag }: { onDone: (a: Account) => void; tag?: string }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateUsername(username);
    if (v) return setErr(v);
    setBusy(true); setErr(null);
    try { onDone(await backend.signIn(username)); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main className="page narrow home">
      <Masthead tag={tag} />
      <form className="panel stack" onSubmit={submit}>
        <label className="field"><span>Tu nombre</span>
          <input value={username} onChange={(e) => { setUsername(e.target.value); setErr(null); }} maxLength={20} autoFocus
            autoComplete="nickname" autoCorrect="off" spellCheck={false} placeholder="Cómo te verán los demás" />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="muted small center">Pon el mismo nombre en el ordenador y en el móvil y serás tú en los dos.</p>
      </form>
    </main>
  );
}

/** Inicio: con sesión, entrar por código o crear sala. Sin sesión, el acceso. */
export default function Home() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  useEffect(() => { backend.currentUser().then(setAccount).catch(() => setAccount(null)); }, []);
  if (account === undefined) return <div className="center-screen"><div className="spinner" aria-label="Cargando" /></div>;
  if (!account) return <LoginForm onDone={setAccount} />;
  return <Lobby account={account} onSignOut={async () => { await backend.signOut(); setAccount(null); }} />;
}

function Lobby({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const [code, setCode] = useState('');
  const [size, setSize] = useState(4);
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length < 5) return;
    setBusy('join'); setErr(null);
    try { await backend.joinRoom(code); goToRoom(code); }
    catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  async function create() {
    setBusy('create'); setErr(null);
    try {
      const room = await backend.createRoom({
        name: 'Debate del 29N', candidates: DEFAULT_CANDIDATES, boardSize: size, seedItems: seedItems(DEFAULT_CANDIDATES),
      });
      goToRoom(room.code);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  return (
    <main className="page narrow home">
      <Masthead />
      <div className="panel stack">
        <div className="whoami">
          <span>Hola, <b>{account.username}</b></span>
          <button className="link-btn" onClick={onSignOut}>No soy yo</button>
        </div>

        <form className="join-row" onSubmit={join}>
          <input
            className="code-input" value={code} maxLength={5} autoCapitalize="characters" autoComplete="off"
            aria-label="Código de la sala" placeholder="CÓDIGO"
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setErr(null); }}
          />
          <button className="btn" disabled={code.length < 5 || !!busy}>{busy === 'join' ? 'Entrando…' : 'Entrar'}</button>
        </form>

        <div className="or" aria-hidden><span>o</span></div>

        <button className="btn ghost big" onClick={create} disabled={!!busy}>
          {busy === 'create' ? 'Creando…' : 'Crear sala nueva'}
        </button>
        <div className="size-pick" role="group" aria-label="Tamaño del cartón">
          <span className="muted small">Cartón</span>
          {[3, 4, 5].map((n) => (
            <button type="button" key={n} className="chip" aria-pressed={size === n} onClick={() => setSize(n)}>{n}×{n}</button>
          ))}
        </div>

        {err && <p className="error" role="alert">{err}</p>}
      </div>

      <p className="muted small home-foot">Quien crea la sala es el árbitro.</p>
      <HallOfFame />
    </main>
  );
}

/** Histórico de todas las partidas terminadas. Solo aparece si hay alguna. */
function HallOfFame() {
  const [rows, setRows] = useState<FameRow[] | null>(null);
  const [games, setGames] = useState(0);
  useEffect(() => {
    backend.listResults()
      .then((r) => { setRows(hallOfFame(r)); setGames(new Set(r.map((x) => x.room_id)).size); })
      .catch(() => setRows([]));
  }, []);
  const [open, setOpen] = useState(false);
  if (!rows?.length) return null;
  if (!open) {
    return (
      <button className="btn ghost fame-open" onClick={() => setOpen(true)}>
        Salón de la fama <span className="muted">· {games} {games === 1 ? 'partida' : 'partidas'}</span>
      </button>
    );
  }
  return (
    <Screen title="Salón de la fama" onClose={() => setOpen(false)}>
    <section className="fame">
      <span className="block-label">{games} {games === 1 ? 'partida' : 'partidas'} · se agrupa por nombre</span>
      <ol className="fame-list">
        {rows.slice(0, 10).map((r, i) => (
          <li key={r.name}>
            <span className="fame-pos display">{i + 1}</span>
            <div className="fame-main">
              <b>{r.name}</b>
              <span>{r.games} {r.games === 1 ? 'partida' : 'partidas'} · {r.podiums} {r.podiums === 1 ? 'podio' : 'podios'} · mejor {r.best}</span>
            </div>
            <div className="fame-wins"><b className="display num">{r.wins}</b><span>{r.wins === 1 ? 'victoria' : 'victorias'}</span></div>
            <div className="fame-pts"><b className="display num">{r.points}</b><span>puntos</span></div>
          </li>
        ))}
      </ol>
    </section>
    </Screen>
  );
}
