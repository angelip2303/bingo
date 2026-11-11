import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Account, Backend } from './api';
import { usernameKey } from '../lib/account';
import type { Item, Player, Result, Room, Vote } from '../types';

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key);

  /**
   * Identidad ligera para amigos: cada dispositivo tiene una sesión anónima de Supabase
   * (invisible) y al poner tu nombre queda vinculada a él. El mismo nombre en otro
   * dispositivo = el mismo jugador. Requiere "Allow anonymous sign-ins" activado.
   */
  let anon: Promise<string> | null = null;
  const anonSession = () => {
    anon ??= (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: signed, error } = await sb.auth.signInAnonymously();
      if (error) { anon = null; throw new Error('No se pudo conectar: ' + error.message); }
      return signed.user!.id;
    })();
    return anon;
  };
  let me_: Account | null = null;
  const loadAccount = async (): Promise<Account | null> => {
    if (me_) return me_;
    const uid = await anonSession();
    const res = await sb.from('profile_devices').select('key, profiles(username)').eq('auth_uid', uid).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    const row = res.data as { key: string; profiles: { username: string } | { username: string }[] | null } | null;
    if (!row) return null;
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    me_ = { id: row.key, username: prof?.username ?? row.key };
    return me_;
  };
  const ensureSession = async () => {
    const acc = await loadAccount();
    if (!acc) throw new Error('Pon tu nombre primero');
    return acc.id; // clave del nombre
  };

  const ok = <T>(res: { data: T; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  const api: Backend = {

    async currentUser() {
      return loadAccount();
    },

    async signIn(username) {
      await anonSession();
      const key = usernameKey(username);
      ok(await sb.rpc('claim_username', { p_key: key, p_name: username.trim() }));
      me_ = { id: key, username: username.trim() };
      return me_;
    },

    async signOut() {
      await anonSession();
      ok(await sb.rpc('release_username'));
      me_ = null;
    },

    async createRoom({ name, candidates, boardSize, seedItems }) {
      await ensureSession();
      return ok(await sb.rpc('create_room', {
        p_name: name, p_candidates: candidates, p_board_size: boardSize, p_items: seedItems,
      })) as Room;
    },

    async findRoom(code) {
      await ensureSession();
      const res = await sb.from('rooms').select().eq('code', code.toUpperCase()).maybeSingle();
      return (ok(res) as Room | null) ?? null;
    },

    async me(roomId) {
      const uid = await ensureSession();
      const res = await sb.from('players').select('id, room_id, name, created_at')
        .eq('room_id', roomId).eq('username_key', uid).maybeSingle();
      return (ok(res) as Player | null) ?? null;
    },

    async joinRoom(code) {
      await ensureSession();
      const player = ok(await sb.rpc('join_room', { p_code: code })) as Player;
      const room = ok(await sb.from('rooms').select().eq('id', player.room_id).single()) as Room;
      return { room, player };
    },

    async snapshot(roomId) {
      await ensureSession();
      const [room, players, items, cards, claims, votes] = await Promise.all([
        sb.from('rooms').select().eq('id', roomId).single(),
        sb.from('players').select('id, room_id, name, created_at').eq('room_id', roomId).order('created_at'),
        sb.from('items').select().eq('room_id', roomId).order('created_at'),
        sb.from('cards').select().eq('room_id', roomId),
        sb.from('claims').select().eq('room_id', roomId).order('created_at'),
        // votes no tiene room_id: se filtra por la sala de su cante (con una lista de ids
        // en la URL, una partida larga acabaría superando el límite de tamaño de la petición)
        sb.from('votes').select('claim_id, player_id, value, claims!inner(room_id)').eq('claims.room_id', roomId),
      ]);
      return {
        room: ok(room) as Room,
        players: ok(players) as Player[],
        items: ok(items) as Item[],
        cards: ok(cards) as never,
        claims: ok(claims) as never,
        votes: (ok(votes) as Vote[]).map(({ claim_id, player_id, value }) => ({ claim_id, player_id, value })),
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


    async saveCard(roomId, playerId, cells) {
      // una fila: escritura directa. La validan RLS (solo el tuyo y en preparación) y el trigger check_card.
      ok(await sb.from('cards').upsert({ room_id: roomId, player_id: playerId, cells }, { onConflict: 'player_id' }));
    },

    async claim(itemId) {
      ok(await sb.rpc('claim_item', { p_item: itemId }));
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

    async growBoard(roomId, size) {
      ok(await sb.rpc('grow_board', { p_room: roomId, p_size: size }));
    },

    async resolveClaim(claimId, accept) {
      ok(await sb.rpc('resolve_claim', { p_claim: claimId, p_accept: accept }));
    },

    async setHappened(itemId, happened) {
      ok(await sb.rpc('set_happened', { p_item: itemId, p_happened: happened }));
    },


    async finishRoom(roomId, results) {
      ok(await sb.rpc('finish_room', { p_room: roomId, p_results: results }));
    },

    async listResults() {
      await ensureSession();
      return ok(await sb.from('results').select().order('finished_at', { ascending: false }).limit(500)) as Result[];
    },
  };
  return api;
}
