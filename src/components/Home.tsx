import { useEffect, useRef, useState } from 'react';
import { backend } from '../backend';
import { goToRoom } from '../App';
import { seedItems } from '../lib/suggestions';
import type { Candidate, Player, Room } from '../types';
import { CandTag } from './shared';

export const DEFAULT_CANDIDATES: Candidate[] = [
  { name: 'Sánchez', party: 'PSOE', color: '#e30613', logo: 'logos/psoe.svg' },
  { name: 'Feijóo', party: 'PP', color: '#1d84ce', logo: 'logos/pp.svg' },
  { name: 'Abascal', party: 'VOX', color: '#5ac035', logo: 'logos/vox.svg' },
  { name: 'Colau', party: 'Frente Amplio', color: '#d8256f', logo: 'logos/frente-amplio.svg' },
];

const NAME_KEY = 'bingo-salvaje-name';
export const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* sin persistencia */ } };

/**
 * Una sola pantalla: tu nombre arriba y debajo las dos salidas (código o crear).
 * Time to smile: escribir nombre + un toque.
 */
export default function Home() {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const [size, setSize] = useState(4);
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const hasName = name.trim().length > 0;

  const needName = () => {
    if (hasName) return false;
    setErr('Pon tu nombre primero');
    nameRef.current?.focus();
    return true;
  };

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    if (needName() || code.length < 5) return;
    setBusy('join'); setErr(null);
    try {
      saveName(name.trim());
      await backend.joinRoom(code, name.trim());
      goToRoom(code);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  async function create() {
    if (needName()) return;
    setBusy('create'); setErr(null);
    try {
      saveName(name.trim());
      const { room } = await backend.createRoom({
        name: 'Debate del 29N', candidates: DEFAULT_CANDIDATES, boardSize: size,
        playerName: name.trim(), seedItems: seedItems(DEFAULT_CANDIDATES),
      });
      goToRoom(room.code);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  return (
    <main className="page narrow home">
      <header className="home-head">
        <span className="onair"><i aria-hidden /> En directo</span>
        <h1 className="display huge">Bingo<br />Salvaje</h1>
        <div className="cand-row">
          {DEFAULT_CANDIDATES.map((c, i) => <CandTag key={c.name} index={i} candidates={DEFAULT_CANDIDATES} size="lg" />)}
        </div>
      </header>

      <div className="panel stack">
        <label className="field"><span>Tu nombre</span>
          <input
            ref={nameRef} value={name} maxLength={24} placeholder="Cómo te verán los demás" autoComplete="nickname"
            onChange={(e) => { setName(e.target.value); setErr(null); }}
          />
        </label>

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

      <p className="muted small">Quien crea la sala es el árbitro. Comparte el código o el enlace con el resto.</p>
    </main>
  );
}

/**
 * Llegas por enlace. Si este móvil ya sabe tu nombre entras directo;
 * si no, solo te lo pide a ti.
 */
export function JoinForm({ room, onJoined }: { room: Room; onJoined: (p: Player) => void }) {
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async (n: string) => {
    setBusy(true); setErr(null);
    try {
      saveName(n);
      const { player } = await backend.joinRoom(room.code, n);
      onJoined(player);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const auto = useRef(false);
  useEffect(() => {
    const n = savedName().trim();
    if (n && !auto.current) { auto.current = true; go(n); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (busy && !err) return <div className="center-screen"><div className="spinner" aria-label="Entrando" /></div>;

  return (
    <main className="page narrow home">
      <header className="home-head">
        <span className="onair"><i aria-hidden /> Sala {room.code}</span>
        <h1 className="display big">{room.name}</h1>
      </header>
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); if (name.trim()) go(name.trim()); }}>
        <label className="field"><span>Tu nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required autoFocus autoComplete="nickname" />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn big" disabled={busy || !name.trim()}>Entrar a jugar</button>
      </form>
    </main>
  );
}
