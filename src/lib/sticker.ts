import { useEffect, useState } from 'react';

/** "SÍ" es el sello clásico de tinta; el resto, stickers emoji. */
export const STICKERS = ['SÍ', '🔥', '💀', '🤡', '🎯', '🥊', '🍿', '😂', '🫠', '🚨', '💣', '👀', '🐐', '🧂', '📢', '🗳️'];
const KEY = 'bingo-salvaje-sticker';
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
