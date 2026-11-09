import type { Candidate, Item, Player, Result, Room, RoomStatus, Snapshot } from '../types';

export interface NewItem {
  text: string;
  candidate: number | null;
}

export interface Account {
  id: string;
  username: string;
}

export interface Backend {
  readonly mode: 'local' | 'supabase';

  /** Cuenta con sesión abierta en este dispositivo */
  currentUser(): Promise<Account | null>;
  /** Entra con tu nombre: el mismo nombre en otro dispositivo es el mismo jugador */
  signIn(username: string): Promise<Account>;
  signOut(): Promise<void>;

  createRoom(input: {
    name: string;
    candidates: Candidate[];
    boardSize: number;
    seedItems: NewItem[];
  }): Promise<{ room: Room; player: Player }>;
  /** Entra a la sala con tu cuenta; si ya estabas te devuelve tu jugador */
  joinRoom(code: string): Promise<{ room: Room; player: Player }>;
  /** Tu jugador en la sala (con tu cuenta, desde cualquier dispositivo), si existe */
  me(roomId: string): Promise<Player | null>;
  findRoom(code: string): Promise<Room | null>;
  snapshot(roomId: string): Promise<Snapshot>;
  /** Llama a onChange cada vez que algo cambia en la sala. Devuelve unsubscribe. */
  subscribe(roomId: string, onChange: () => void): () => void;

  addItems(roomId: string, playerId: string, items: NewItem[]): Promise<Item[]>;
  deleteItem(itemId: string): Promise<void>;
  saveCard(roomId: string, playerId: string, cells: string[]): Promise<void>;

  claim(roomId: string, playerId: string, itemId: string): Promise<void>;
  vote(claimId: string, playerId: string, value: boolean): Promise<void>;

  // Solo árbitro
  setStatus(roomId: string, status: RoomStatus): Promise<void>;
  setReferee(roomId: string, playerId: string): Promise<void>;
  resolveClaim(claimId: string, accept: boolean): Promise<void>;
  setHappened(itemId: string, happened: boolean): Promise<void>;
  updateCandidates(roomId: string, candidates: Candidate[]): Promise<void>;
  /** guarda (o reemplaza) la clasificación final de la sala */
  saveResults(roomId: string, results: Omit<Result, 'room_id' | 'finished_at'>[]): Promise<void>;

  /** histórico de todas las partidas terminadas */
  listResults(): Promise<Result[]>;
}

export function randomCode(): string {
  // sin caracteres ambiguos (0/O, 1/I/L)
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}
