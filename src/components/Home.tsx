import { useState } from 'react';
import { backend } from '../backend';
import { goToRoom } from '../App';
import { seedItems } from '../lib/suggestions';
import type { Candidate, Player, Room } from '../types';

export const DEFAULT_CANDIDATES: Candidate[] = [
  { name: 'Sánchez', color: '#e8423f' }, // PSOE
  { name: 'Feijóo', color: '#2b8be0' }, // PP
  { name: 'Abascal', color: '#5fc72f' }, // Vox
  { name: 'Colau', color: '#e5468f' }, // Frente Amplio
];

const NAME_KEY = 'bingo-salvaje-name';
const savedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* sin persistencia */ } };

export default function Home() {
  const [tab, setTab] = useState<'join' | 'create'>('join');
  return (
    <main className="page narrow home">
      <header className="home-head">
        <span className="onair"><i aria-hidden /> En directo</span>
        <h1 className="display huge">Bingo<br />Salvaje</h1>
        <p className="lead">El bingo del debate del 29N. Rellena tu cartón con lo que crees que va a pasar, canta cuando pase y que el árbitro decida.</p>
      </header>

      <div className="seg" role="tablist" aria-label="Entrar o crear sala">
        <button role="tab" aria-selected={tab === 'join'} onClick={() => setTab('join')}>Entrar a una sala</button>
        <button role="tab" aria-selected={tab === 'create'} onClick={() => setTab('create')}>Crear sala</button>
      </div>
      {tab === 'join' ? <JoinByCode /> : <CreateRoom />}
    </main>
  );
}

function JoinByCode() {
  const [code, setCode] = useState('');
  return (
    <form className="panel stack" onSubmit={(e) => { e.preventDefault(); if (code.trim()) goToRoom(code.trim()); }}>
      <label className="field">
        <span>Código de la sala</span>
        <input
          className="code-input" value={code} maxLength={5} autoCapitalize="characters" autoComplete="off"
          placeholder="ABC12" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
      </label>
      <button className="btn" disabled={code.length < 5}>Entrar</button>
    </form>
  );
}

function CreateRoom() {
  const [name, setName] = useState('Debate del 29N');
  const [player, setPlayer] = useState(savedName);
  const [size, setSize] = useState(4);
  const [cands, setCands] = useState<Candidate[]>(DEFAULT_CANDIDATES);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      saveName(player.trim());
      const clean = cands.map((c, i) => ({ ...c, name: c.name.trim() || `Candidato ${i + 1}` }));
      const { room } = await backend.createRoom({
        name: name.trim() || 'Debate', candidates: clean, boardSize: size,
        playerName: player.trim(), seedItems: seedItems(clean),
      });
      goToRoom(room.code);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <label className="field"><span>Nombre de la sala</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <label className="field"><span>Tu nombre</span>
        <input value={player} onChange={(e) => setPlayer(e.target.value)} maxLength={24} required placeholder="Cómo te verán los demás" />
      </label>
      <fieldset className="field">
        <legend>Candidatos</legend>
        <div className="cand-grid">
          {cands.map((c, i) => (
            <div key={i} className="cand-input" style={{ '--cand': c.color } as React.CSSProperties}>
              <input
                type="color" value={c.color} aria-label={`Color del candidato ${i + 1}`}
                onChange={(e) => setCands(cands.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
              />
              <input
                value={c.name} maxLength={20} aria-label={`Nombre del candidato ${i + 1}`}
                onChange={(e) => setCands(cands.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
            </div>
          ))}
        </div>
        <small className="muted">Puedes cambiarlos luego desde la pestaña Sala.</small>
      </fieldset>
      <fieldset className="field">
        <legend>Tamaño del cartón</legend>
        <div className="seg small">
          {[3, 4, 5].map((n) => (
            <button type="button" key={n} aria-pressed={size === n} onClick={() => setSize(n)}>{n}×{n}</button>
          ))}
        </div>
      </fieldset>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn" disabled={busy || !player.trim()}>{busy ? 'Creando…' : 'Crear sala y ser árbitro'}</button>
    </form>
  );
}

export function JoinForm({ room, onJoined }: { room: Room; onJoined: (p: Player) => void }) {
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="page narrow home">
      <header className="home-head">
        <span className="onair"><i aria-hidden /> Sala {room.code}</span>
        <h1 className="display big">{room.name}</h1>
        <p className="lead">Pon tu nombre para entrar. Desde este móvil serás siempre tú.</p>
      </header>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErr(null);
          try {
            saveName(name.trim());
            const { player } = await backend.joinRoom(room.code, name.trim());
            onJoined(player);
          } catch (e) { setErr((e as Error).message); setBusy(false); }
        }}
      >
        <label className="field"><span>Tu nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required autoFocus />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn" disabled={busy || !name.trim()}>{busy ? 'Entrando…' : 'Entrar a la sala'}</button>
      </form>
    </main>
  );
}
