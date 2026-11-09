import { useEffect, useState } from 'react';
import { backend, configMissing } from './backend';
import type { Player, Room } from './types';
import Home, { LoginForm } from './components/Home';
import RoomScreen from './components/RoomScreen';
import { usernameKey } from './lib/account';

/** ?as=<nombre> en el enlace: QR personal para entrar como ese jugador sin escribir nada */
function parseAs(): string | null {
  const m = location.hash.match(/[?&]as=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseHash(): string | null {
  const m = location.hash.match(/^#\/r\/([A-Za-z0-9]+)/);
  return m ? m[1].toUpperCase() : null;
}

export function goToRoom(code: string | null) {
  location.hash = code ? `#/r/${code}` : '#/';
}

export default function App() {
  const [code, setCode] = useState(parseHash);
  useEffect(() => {
    const on = () => setCode(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <>
      {configMissing
        ? (
          <main className="page narrow">
            <h1 className="display">Falta configurar Supabase</h1>
            <p className="muted">Faltan VITE_SUPABASE_URL y VITE_SUPABASE_KEY. En local van en .env.local; en GitHub, en Settings → Secrets and variables → Actions → Variables.</p>
          </main>
        )
        : code ? <RoomGate key={code} code={code} /> : <Home />}
    </>
  );
}

function RoomGate({ code }: { code: string }) {
  const [state, setState] = useState<
    { s: 'loading' } | { s: 'login' } | { s: 'missing' } | { s: 'error'; msg: string } | { s: 'in'; room: Room; me: Player }
  >({ s: 'loading' });

  const enter = async () => {
    setState({ s: 'loading' });
    try {
      const as = parseAs();
      if (as) {
        const cur = await backend.currentUser();
        if (!cur || usernameKey(cur.username) !== usernameKey(as)) await backend.signIn(as);
        history.replaceState(null, '', `#/r/${code}`);
      }
      if (!(await backend.currentUser())) return setState({ s: 'login' });
      const room = await backend.findRoom(code);
      if (!room) return setState({ s: 'missing' });
      // con cuenta no hay nada que preguntar: si no estabas en la sala, entras
      const me = (await backend.me(room.id)) ?? (await backend.joinRoom(code)).player;
      setState({ s: 'in', room, me });
    } catch (e) {
      setState({ s: 'error', msg: (e as Error).message });
    }
  };
  useEffect(() => { enter(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.s === 'loading') return <div className="center-screen"><div className="spinner" aria-label="Cargando" /></div>;
  if (state.s === 'login') return <LoginForm tag={`Sala ${code}`} onDone={() => enter()} />;
  if (state.s === 'missing' || state.s === 'error')
    return (
      <main className="page narrow">
        <h1 className="display">{state.s === 'missing' ? 'Esa sala no existe' : 'Algo ha fallado'}</h1>
        <p className="muted">{state.s === 'missing' ? `No hay ninguna sala con el código ${code}.` : state.msg}</p>
        <button className="btn" onClick={() => goToRoom(null)}>Volver al inicio</button>
      </main>
    );
  return <RoomScreen roomId={state.room.id} me={state.me} />;
}
