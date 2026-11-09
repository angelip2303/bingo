import { useEffect, useState } from 'react';

/** "SÍ" es el sello clásico de tinta; el resto, stickers emoji. */
export const STICKERS = ['SÍ', '🔥', '💀', '🤡', '🎯', '🥊', '🍿', '😂', '🫠', '🚨', '💣', '👀', '🐐', '🧂', '📢', '🗳️'];
const KEY = 'bingo-salvaje-sticker';

/**
 * Microsoft Fluent Emoji 3D (MIT, github.com/microsoft/fluentui-emoji), fijado a un commit.
 * Mismo dibujo en todos los móviles y con volumen de pegatina. Un emoji propio que no
 * esté aquí se pinta con el del sistema.
 */
const FLUENT = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@1ffb34c752ecf5d402f04cfb4b392c77f57c54bc/assets/';
const FLUENT_ASSETS: Record<string, string> = {
  '🔥': 'Fire/3D/fire_3d.png',
  '💀': 'Skull/3D/skull_3d.png',
  '🤡': 'Clown face/3D/clown_face_3d.png',
  '🎯': 'Bullseye/3D/bullseye_3d.png',
  '🥊': 'Boxing glove/3D/boxing_glove_3d.png',
  '🍿': 'Popcorn/3D/popcorn_3d.png',
  '😂': 'Face with tears of joy/3D/face_with_tears_of_joy_3d.png',
  '🫠': 'Melting face/3D/melting_face_3d.png',
  '🚨': 'Police car light/3D/police_car_light_3d.png',
  '💣': 'Bomb/3D/bomb_3d.png',
  '👀': 'Eyes/3D/eyes_3d.png',
  '🐐': 'Goat/3D/goat_3d.png',
  '🧂': 'Salt/3D/salt_3d.png',
  '📢': 'Megaphone/3D/megaphone_3d.png',
  '🗳️': 'Ballot box with ballot/3D/ballot_box_with_ballot_3d.png',
};

export function stickerImage(s: string): string | null {
  const a = FLUENT_ASSETS[s];
  return a ? FLUENT + a.split('/').map(encodeURIComponent).join('/') : null;
}
const EVENT = 'bingo-sticker-change';

const read = () => { try { return localStorage.getItem(KEY) || 'SÍ'; } catch { return 'SÍ'; } };

/** Sello con el que marcas tus casillas. Personal: se guarda en este dispositivo. */
export function useSticker(): [string, (s: string) => void] {
  const [sticker, setSticker] = useState(read);
  useEffect(() => {
    const on = () => setSticker(read());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  const set = (s: string) => {
    try { localStorage.setItem(KEY, s); } catch { /* sin persistencia */ }
    setSticker(s);
    window.dispatchEvent(new Event(EVENT));
  };
  return [sticker, set];
}

/** Primer grafema de lo que escriba el usuario (un emoji puede ocupar varios code points). */
export function firstGrapheme(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) for (const { segment } of new Seg('es', { granularity: 'grapheme' }).segment(t)) return segment;
  return Array.from(t)[0];
}
