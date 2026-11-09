import type { NewItem } from '../backend/api';
import type { Candidate, Item } from '../types';

/** {c} se sustituye por el nombre del candidato al pintar, así renombrar funciona */
export const CANDIDATE_TEMPLATES = [
  '{c} interrumpe a otro candidato',
  '{c} saca un papel o un gráfico',
  '{c} dice "mire usted"',
  '{c} acusa a alguien de mentir',
  '{c} esquiva una pregunta directa',
  '{c} se ríe de una respuesta',
  '{c} habla de su familia',
  '{c} cita una encuesta',
  '{c} pide que le dejen terminar',
  '{c} nombra a su propio partido 3 veces seguidas',
  '{c} mira a cámara para hablar a la gente de casa',
  '{c} promete bajar impuestos',
];

export const GENERAL_SUGGESTIONS = [
  'Sale el tema de la vivienda',
  'Alguien dice "los españoles"',
  'Alguien dice "con todo el respeto"',
  'Sale el tema de las pensiones',
  'Sale el tema de la inmigración',
  'Hablan de corrupción',
  'Mencionan Europa o Bruselas',
  'Alguien cita un dato del paro',
  'Alguien dice "eso es mentira"',
  'Dos hablan a la vez más de 10 segundos',
  'El presentador pide calma',
  'El presentador cuenta una anécdota personal',
  'Pregunta totalmente fuera de guion',
  'Se ríen todos a la vez',
  'Alguien menciona TikTok o las redes',
  'Alguien dice "populismo"',
  'Alguien bebe agua en mitad de una réplica',
  'Sale el tema de la inteligencia artificial',
  'Alguien menciona a un líder extranjero',
  'Alguien dice "fango"',
  'Se cita un dato que nadie se cree',
  'Alguien se queda en blanco',
];

export function seedItems(candidates: Candidate[]): NewItem[] {
  const out: NewItem[] = GENERAL_SUGGESTIONS.map((text) => ({ text, candidate: null }));
  candidates.forEach((_, i) => CANDIDATE_TEMPLATES.forEach((text) => out.push({ text, candidate: i })));
  return out;
}

export function itemText(item: Pick<Item, 'text' | 'candidate'>, candidates: Candidate[]): string {
  const name = item.candidate != null ? candidates[item.candidate]?.name ?? '¿?' : '';
  return item.text.replace(/\{c\}/g, name);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Asistente: rellena los huecos vacíos de un cartón con eventos del banco,
 * repartiendo entre candidatos y generales para que no quede descompensado.
 */
export function fillCard(cells: string[], bank: Item[], candidateCount: number): string[] {
  const used = new Set(cells.filter(Boolean));
  const groupKey = (c: number | null) => (c == null ? 'g' : String(c));
  const counts = new Map<string, number>();
  for (const id of used) {
    const it = bank.find((b) => b.id === id);
    if (it) counts.set(groupKey(it.candidate), (counts.get(groupKey(it.candidate)) ?? 0) + 1);
  }
  const groups = new Map<string, Item[]>();
  for (const it of shuffle(bank.filter((b) => !used.has(b.id) && !b.happened_at))) {
    const k = groupKey(it.candidate);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const keys = ['g', ...Array.from({ length: candidateCount }, (_, i) => String(i))];
  const out = [...cells];
  const empties = shuffle(out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0));
  for (const idx of empties) {
    // el grupo con menos casillas que aún tenga eventos
    const k = keys
      .filter((key) => groups.get(key)?.length)
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || Math.random() - 0.5)[0];
    if (!k) break;
    out[idx] = groups.get(k)!.pop()!.id;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return out;
}

export function balance(cells: string[], bank: Item[], candidateCount: number) {
  const per = Array.from({ length: candidateCount }, () => 0);
  let general = 0;
  for (const id of cells) {
    const it = bank.find((b) => b.id === id);
    if (!it) continue;
    if (it.candidate == null) general++;
    else per[it.candidate]++;
  }
  const filled = cells.filter((id) => bank.some((b) => b.id === id)).length;
  const max = Math.max(...per);
  const warning =
    filled >= cells.length / 2 && per.some((n) => n === 0)
      ? 'Hay algún candidato sin casillas'
      : filled > 0 && max > cells.length / 2
        ? 'Demasiadas casillas de un mismo candidato'
        : null;
  return { per, general, filled, warning };
}
