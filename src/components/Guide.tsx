import { POINTS } from '../lib/scoring';

const STEPS = [
  { title: 'Monta tu cartón', text: 'Toca cada casilla y elige qué va a pasar, o escríbelo tú.' },
  { title: 'Arranca el debate', text: 'El árbitro da la salida y los cartones se bloquean.' },
  { title: 'Canta', text: 'Si pasa algo de tu cartón, tócalo. Va al VAR y la sala vota.' },
  { title: 'Pita el árbitro', text: 'Valida el cante o saca tarjeta amarilla. Su palabra va a misa.' },
];

const SCORES: { value: number; label: string }[] = [
  { value: POINTS.cell, label: 'Casilla' },
  { value: POINTS.line, label: 'Línea' },
  { value: POINTS.firstLine, label: 'Primera línea' },
  { value: POINTS.bingo, label: 'Bingo' },
  { value: POINTS.firstBingo, label: 'Primer bingo' },
  { value: POINTS.hawkEye, label: 'Cante validado' },
  { value: POINTS.yellowCard, label: 'Tarjeta amarilla' },
];

/** Guía global: cómo se juega y el marcador de puntos. Se abre con el "?" de arriba. */
export default function Guide() {
  return (
    <div className="guide">
      <ol className="guide-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="guide-num" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
            <b className="display">{s.title}</b>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <h3 className="guide-title display">Puntos</h3>
      <dl className="pointlist">
        {SCORES.map((s) => (
          <div key={s.label} className={s.value < 0 ? 'bad' : ''}>
            <dt>{s.label}</dt>
            <span className="leader" aria-hidden />
            <dd className="display">{s.value > 0 ? `+${s.value}` : `−${Math.abs(s.value)}`}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Una línea es una fila, una columna o una diagonal completas. Si dos completan a la vez, los dos se llevan el bonus.</p>
    </div>
  );
}
