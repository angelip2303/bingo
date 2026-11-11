export type RoomStatus = 'lobby' | 'live' | 'finished';

export interface Candidate {
  name: string;
  color: string;
  /** siglas del partido */
  party?: string;
  /** se ha bajado del debate: sus eventos no se pueden poner en el cartón ni pitar */
  out?: boolean;
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

export type Cell = string | null;

export interface Card {
  id: string;
  room_id: string;
  player_id: string;
  /** board_size² casillas fila a fila: id del evento, o null si está vacía */
  cells: Cell[];
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

/** Clasificación final de una partida, para el histórico */
export interface Result {
  room_id: string;
  room_name: string;
  player_name: string;
  points: number;
  position: number;
  finished_at: string;
}

export interface Snapshot {
  room: Room;
  players: Player[];
  items: Item[];
  cards: Card[];
  claims: Claim[];
  votes: Vote[];
}
