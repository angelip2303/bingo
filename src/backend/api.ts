import type { Candidate, Cell, Item, Player, Result, Room, RoomStatus, Snapshot } from '../types';

export interface NewItem {
  text: string;
  candidate: number | null;
}

export interface Account {
  id: string;
  username: string;
}

export interface Backend {

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
  }): Promise<Room>;
  /** Entra a la sala con tu cuenta; si ya estabas te devuelve tu jugador */
  joinRoom(code: string): Promise<{ room: Room; player: Player }>;
  /** Tu jugador en la sala (con tu cuenta, desde cualquier dispositivo), si existe */
  me(roomId: string): Promise<Player | null>;
  findRoom(code: string): Promise<Room | null>;
  snapshot(roomId: string): Promise<Snapshot>;
  /** Llama a onChange cada vez que algo cambia en la sala. Devuelve unsubscribe. */
  subscribe(roomId: string, onChange: () => void): () => void;

  addItems(roomId: string, playerId: string, items: NewItem[]): Promise<Item[]>;
  saveCard(roomId: string, playerId: string, cells: Cell[]): Promise<void>;

  /** canta un evento de tu cartón (si ya estaba cantado, suma tu voto a favor) */
  claim(itemId: string): Promise<void>;
  vote(claimId: string, playerId: string, value: boolean): Promise<void>;

  // Solo árbitro
  setStatus(roomId: string, status: RoomStatus): Promise<void>;
  setReferee(roomId: string, playerId: string): Promise<void>;
  resolveClaim(claimId: string, accept: boolean): Promise<void>;
  setHappened(itemId: string, happened: boolean): Promise<void>;
  /** guarda (o reemplaza) la clasificación final y cierra la partida */
  finishRoom(roomId: string, results: Omit<Result, 'room_id' | 'finished_at'>[]): Promise<void>;

  /** histórico de todas las partidas terminadas */
  listResults(): Promise<Result[]>;
}
