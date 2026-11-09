import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend } from './api';
import { randomCode } from './api';
import type { Item, Player, Room } from '../types';

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key);

  let sessionReady: Promise<string> | null = null;
  const ensureSession = () => {
    sessionReady ??= (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: signed, error } = await sb.auth.signInAnonymously();
      if (error) throw new Error('No se pudo iniciar sesión anónima: ' + error.message);
      return signed.user!.id;
    })();
    return sessionReady;
  };

  const ok = <T>(res: { data: T; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  const api: Backend = {
    mode: 'supabase',

    async createRoom({ name, candidates, boardSize, playerName, seedItems }) {
      await ensureSession();
      // reintento por si el código aleatorio choca
      let room: Room | null = null;
      for (let i = 0; i < 5 && !room; i++) {
        const res = await sb.from('rooms')
          .insert({ code: randomCode(), name, candidates, board_size: boardSize })
          .select().single();
        if (!res.error) room = res.data as Room;
        else if (!res.error.message.includes('duplicate')) throw new Error(res.error.message);
      }
      if (!room) throw new Error('No se pudo crear la sala');
      const player = ok(await sb.from('players').insert({ room_id: room.id, name: playerName }).select().single()) as Player;
      ok(await sb.from('rooms').update({ referee_id: player.id }).eq('id', room.id));
      room.referee_id = player.id;
      if (seedItems.length) {
        ok(await sb.from('items').insert(seedItems.map((s) => ({ room_id: room!.id, text: s.text, candidate: s.candidate }))));
      }
      return { room, player };
    },

    async findRoom(code) {
      await ensureSession();
      const res = await sb.from('rooms').select().eq('code', code.toUpperCase()).maybeSingle();
      return (ok(res) as Room | null) ?? null;
    },

    async me(roomId) {
      const uid = await ensureSession();
      const res = await sb.from('players').select('id, room_id, name, created_at')
        .eq('room_id', roomId).eq('auth_uid', uid).maybeSingle();
      return (ok(res) as Player | null) ?? null;
    },

    async joinRoom(code, playerName) {
      const room = await api.findRoom(code);
      if (!room) throw new Error('No existe ninguna sala con ese código');
      const existing = await api.me(room.id);
      if (existing) return { room, player: existing };
      const player = ok(await sb.from('players').insert({ room_id: room.id, name: playerName })
        .select('id, room_id, name, created_at').single()) as Player;
      return { room, player };
    },

    async snapshot(roomId) {
      await ensureSession();
      const [room, players, items, cards, claims] = await Promise.all([
        sb.from('rooms').select().eq('id', roomId).single(),
        sb.from('players').select('id, room_id, name, created_at').eq('room_id', roomId).order('created_at'),
        sb.from('items').select().eq('room_id', roomId).order('created_at'),
        sb.from('cards').select().eq('room_id', roomId),
        sb.from('claims').select().eq('room_id', roomId).order('created_at'),
      ]);
      const claimRows = ok(claims) as { id: string }[];
      const votes = claimRows.length
        ? ok(await sb.from('votes').select().in('claim_id', claimRows.map((c) => c.id)))
        : [];
      return {
        room: ok(room) as Room,
        players: ok(players) as Player[],
        items: ok(items) as Item[],
        cards: ok(cards) as never,
        claims: claimRows as never,
        votes: votes as never,
      };
    },

    subscribe(roomId, onChange) {
      const ch = sb.channel('room-' + roomId);
      for (const table of ['players', 'items', 'cards', 'claims']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${roomId}` }, onChange);
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange);
      // votes no tiene room_id: escuchamos todo (somos pocos)
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, onChange);
      ch.subscribe();
      // red de seguridad: si el móvil se duerme y se pierde algún evento
      const onVisible = () => document.visibilityState === 'visible' && onChange();
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        sb.removeChannel(ch);
      };
    },

    async addItems(roomId, playerId, items) {
      const res = await sb.from('items')
        .insert(items.map((s) => ({ room_id: roomId, text: s.text, candidate: s.candidate, created_by: playerId })))
        .select();
      return ok(res) as Item[];
    },

    async deleteItem(itemId) {
      ok(await sb.from('items').delete().eq('id', itemId));
    },

    async saveCard(roomId, playerId, cells) {
      ok(await sb.from('cards').upsert(
        { room_id: roomId, player_id: playerId, cells, updated_at: new Date().toISOString() },
        { onConflict: 'player_id' },
      ));
    },

    async claim(roomId, playerId, itemId) {
      const res = await sb.from('claims').insert({ room_id: roomId, item_id: itemId, player_id: playerId });
      if (res.error) {
        // ya había un cante pendiente → nos sumamos con un voto a favor
        const pending = ok(await sb.from('claims').select('id').eq('item_id', itemId).eq('status', 'pending').maybeSingle()) as { id: string } | null;
        if (!pending) throw new Error(res.error.message);
        await api.vote(pending.id, playerId, true);
      }
    },

    async vote(claimId, playerId, value) {
      ok(await sb.from('votes').upsert({ claim_id: claimId, player_id: playerId, value }));
    },

    async setStatus(roomId, status) {
      ok(await sb.from('rooms').update({ status }).eq('id', roomId));
    },

    async setReferee(roomId, playerId) {
      ok(await sb.from('rooms').update({ referee_id: playerId }).eq('id', roomId));
    },

    async resolveClaim(claimId, accept) {
      ok(await sb.rpc('resolve_claim', { p_claim: claimId, p_accept: accept }));
    },

    async setHappened(itemId, happened) {
      ok(await sb.rpc('set_happened', { p_item: itemId, p_happened: happened }));
    },

    async updateCandidates(roomId, candidates) {
      ok(await sb.from('rooms').update({ candidates }).eq('id', roomId));
    },
  };
  return api;
}
