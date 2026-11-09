export type RoomStatus = 'lobby' | 'live' | 'finished';

export interface Candidate {
  name: string;
  color: string;
  /** siglas del partido, se usan si no hay logo */
  party?: string;
  /** ruta relativa a public/, p. ej. logos/psoe.svg */
  logo?: string;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  status: RoomStatus;
  board_size: number;
  candidates: Candidate[];
  referee_id: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
}

/** Un evento del banco común de la sala. Las casillas de los cartones apuntan a estos. */
export interface Item {
  id: string;
  room_id: string;
  text: string;
  /** índice del candidato en room.candidates, o null si es general */
  candidate: number | null;
  created_by: string | null;
  happened_at: string | null;
  created_at: string;
}

export interface Card {
  id: string;
  room_id: string;
  player_id: string;
  /** ids de items, longitud board_size², en orden fila a fila */
  cells: string[];
  updated_at: string;
}

export type ClaimStatus = 'pending' | 'accepted' | 'rejected';

/** "¡Ha pasado X!" — un cante que el árbitro tiene que validar */
export interface Claim {
  id: string;
  room_id: string;
  item_id: string;
  player_id: string;
  status: ClaimStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface Vote {
  claim_id: string;
  player_id: string;
  /** true = "¡sí ha pasado!", false = "¡mentira!" */
  value: boolean;
}

export interface Snapshot {
  room: Room;
  players: Player[];
  items: Item[];
  cards: Card[];
  claims: Claim[];
  votes: Vote[];
}
