import { useEffect, useState } from 'react';
import { backend } from './backend';
import type { Player, Room } from './types';
import Home, { JoinForm } from './components/Home';
import RoomScreen from './components/RoomScreen';

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
      {backend.mode === 'local' && (
        <div className="local-banner" role="status">
          Modo local: sin servidor, solo funciona en este navegador. Abre otra pestaña para simular a otro jugador.
        </div>
      )}
      {code ? <RoomGate key={code} code={code} /> : <Home />}
    </>
  );
}

function RoomGate({ code }: { code: string }) {
  const [state, setState] = useState<
    { s: 'loading' } | { s: 'missing' } | { s: 'error'; msg: string } | { s: 'join'; room: Room } | { s: 'in'; room: Room; me: Player }
  >({ s: 'loading' });

  useEffect(() => {
    (async () => {
      try {
        const room = await backend.findRoom(code);
        if (!room) return setState({ s: 'missing' });
        const me = await backend.me(room.id);
        setState(me ? { s: 'in', room, me } : { s: 'join', room });
      } catch (e) {
        setState({ s: 'error', msg: (e as Error).message });
      }
    })();
  }, [code]);

  if (state.s === 'loading') return <div className="center-screen"><div className="spinner" aria-label="Cargando" /></div>;
  if (state.s === 'missing' || state.s === 'error')
    return (
      <main className="page narrow">
        <h1 className="display">{state.s === 'missing' ? 'Esa sala no existe' : 'Algo ha fallado'}</h1>
        <p className="muted">{state.s === 'missing' ? `No hay ninguna sala con el código ${code}.` : state.msg}</p>
        <button className="btn" onClick={() => goToRoom(null)}>Volver al inicio</button>
      </main>
    );
  if (state.s === 'join')
    return <JoinForm room={state.room} onJoined={(me) => setState({ s: 'in', room: state.room, me })} />;
  return <RoomScreen roomId={state.room.id} me={state.me} />;
}
