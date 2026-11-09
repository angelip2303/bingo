/**
 * Backend en el navegador: guarda todo en localStorage y avisa al resto de
 * pestañas con BroadcastChannel. Sirve para probar sin Supabase: cada pestaña
 * es un jugador distinto (la identidad va en sessionStorage).
 */
import type { Backend, NewItem } from './api';
import { randomCode } from './api';
import type { Card, Claim, Item, Player, Result, Room, Snapshot, Vote } from '../types';

interface DB {
  rooms: Room[];
  players: (Player & { device: string })[];
  items: Item[];
  cards: Card[];
  claims: Claim[];
  votes: Vote[];
  results: Result[];
}

const KEY = 'bingo-salvaje-local-db';
const empty = (): DB => ({ rooms: [], players: [], items: [], cards: [], claims: [], votes: [], results: [] });
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function safeGet(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}
function safeSet(storage: Storage, key: string, value: string) {
  try { storage.setItem(key, value); } catch { /* modo privado, sin persistencia */ }
}

function deviceId(): string {
  let id = safeGet(sessionStorage, 'bingo-device');
  if (!id) {
    id = uid();
    safeSet(sessionStorage, 'bingo-device', id);
  }
  return id;
}

export function createLocalBackend(): Backend {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bingo-salvaje') : null;
  const listeners = new Set<() => void>();
  channel?.addEventListener('message', () => listeners.forEach((l) => l()));
  window.addEventListener('storage', (e) => e.key === KEY && listeners.forEach((l) => l()));

  const read = (): DB => {
    const raw = safeGet(localStorage, KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  };
  const write = (mut: (db: DB) => void) => {
    const db = read();
    mut(db);
    safeSet(localStorage, KEY, JSON.stringify(db));
    channel?.postMessage('changed');
    listeners.forEach((l) => l());
  };
  const strip = ({ device: _d, ...p }: Player & { device: string }): Player => p;

  const api: Backend = {
    mode: 'local',

    async createRoom({ name, candidates, boardSize, playerName, seedItems }) {
      const room: Room = {
        id: uid(), code: randomCode(), name, status: 'lobby', board_size: boardSize,
        candidates, referee_id: null, created_at: now(),
      };
      const player = { id: uid(), room_id: room.id, name: playerName, created_at: now(), device: deviceId() };
      room.referee_id = player.id;
      write((db) => {
        db.rooms.push(room);
        db.players.push(player);
        db.items.push(...seedItems.map((s) => ({
          id: uid(), room_id: room.id, text: s.text, candidate: s.candidate,
          created_by: null, happened_at: null, created_at: now(),
        })));
      });
      return { room, player: strip(player) };
    },

    async findRoom(code) {
      return read().rooms.find((r) => r.code === code.toUpperCase()) ?? null;
    },

    async me(roomId) {
      const p = read().players.find((x) => x.room_id === roomId && x.device === deviceId());
      return p ? strip(p) : null;
    },

    async joinRoom(code, playerName) {
      const room = await api.findRoom(code);
      if (!room) throw new Error('No existe ninguna sala con ese código');
      const existing = await api.me(room.id);
      if (existing) return { room, player: existing };
      const player = { id: uid(), room_id: room.id, name: playerName, created_at: now(), device: deviceId() };
      write((db) => db.players.push(player));
      return { room, player: strip(player) };
    },

    async snapshot(roomId) {
      const db = read();
      const room = db.rooms.find((r) => r.id === roomId);
      if (!room) throw new Error('Sala no encontrada');
      const claimIds = new Set(db.claims.filter((c) => c.room_id === roomId).map((c) => c.id));
      const snap: Snapshot = {
        room,
        players: db.players.filter((p) => p.room_id === roomId).map(strip),
        items: db.items.filter((i) => i.room_id === roomId),
        cards: db.cards.filter((c) => c.room_id === roomId),
        claims: db.claims.filter((c) => c.room_id === roomId),
        votes: db.votes.filter((v) => claimIds.has(v.claim_id)),
      };
      return snap;
    },

    subscribe(_roomId, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    async addItems(roomId, playerId, items: NewItem[]) {
      const created = items.map<Item>((s) => ({
        id: uid(), room_id: roomId, text: s.text, candidate: s.candidate,
        created_by: playerId, happened_at: null, created_at: now(),
      }));
      write((db) => db.items.push(...created));
      return created;
    },

    async deleteItem(itemId) {
      write((db) => { db.items = db.items.filter((i) => i.id !== itemId); });
    },

    async saveCard(roomId, playerId, cells) {
      write((db) => {
        const existing = db.cards.find((c) => c.player_id === playerId);
        if (existing) { existing.cells = cells; existing.updated_at = now(); }
        else db.cards.push({ id: uid(), room_id: roomId, player_id: playerId, cells, updated_at: now() });
      });
    },

    async claim(roomId, playerId, itemId) {
      write((db) => {
        const pending = db.claims.find((c) => c.item_id === itemId && c.status === 'pending');
        if (pending) {
          // ya cantado: cuenta como voto a favor
          if (!db.votes.some((v) => v.claim_id === pending.id && v.player_id === playerId))
            db.votes.push({ claim_id: pending.id, player_id: playerId, value: true });
          return;
        }
        db.claims.push({
          id: uid(), room_id: roomId, item_id: itemId, player_id: playerId,
          status: 'pending', created_at: now(), resolved_at: null,
        });
      });
    },

    async vote(claimId, playerId, value) {
      write((db) => {
        db.votes = db.votes.filter((v) => !(v.claim_id === claimId && v.player_id === playerId));
        db.votes.push({ claim_id: claimId, player_id: playerId, value });
      });
    },

    async setStatus(roomId, status) {
      write((db) => { db.rooms.find((r) => r.id === roomId)!.status = status; });
    },

    async setReferee(roomId, playerId) {
      write((db) => { db.rooms.find((r) => r.id === roomId)!.referee_id = playerId; });
    },

    async resolveClaim(claimId, accept) {
      write((db) => {
        const c = db.claims.find((x) => x.id === claimId);
        if (!c || c.status !== 'pending') return;
        c.status = accept ? 'accepted' : 'rejected';
        c.resolved_at = now();
        if (accept) {
          const it = db.items.find((i) => i.id === c.item_id);
          if (it && !it.happened_at) it.happened_at = now();
        }
      });
    },

    async setHappened(itemId, happened) {
      write((db) => {
        const it = db.items.find((i) => i.id === itemId);
        if (it) it.happened_at = happened ? (it.happened_at ?? now()) : null;
        if (happened) {
          // cantes pendientes de ese evento: el árbitro lo ha confirmado
          db.claims.filter((c) => c.item_id === itemId && c.status === 'pending')
            .forEach((c) => { c.status = 'accepted'; c.resolved_at = now(); });
        }
      });
    },

    async updateCandidates(roomId, candidates) {
      write((db) => { db.rooms.find((r) => r.id === roomId)!.candidates = candidates; });
    },

    async saveResults(roomId, results) {
      write((db) => {
        db.results = db.results.filter((r) => r.room_id !== roomId);
        db.results.push(...results.map((r) => ({ ...r, room_id: roomId, finished_at: now() })));
      });
    },

    async listResults() {
      return read().results;
    },
  };
  return api;
}
