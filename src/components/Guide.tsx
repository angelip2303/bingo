import { POINTS } from '../lib/scoring';

/** Guía global: cómo se juega y cómo se puntúa. Se abre con el "?" de arriba. */
export default function Guide() {
  return (
    <div className="guide">
      <ol className="guide-steps">
        <li><b>Prepara tu cartón.</b> Toca cada casilla y elige qué crees que va a pasar, o escribe lo tuyo. <i>Rellenar huecos</i> lo hace por ti repartiendo entre candidatos.</li>
        <li><b>Empieza el debate.</b> El árbitro da la salida y los cartones se bloquean.</li>
        <li><b>Canta.</b> Cuando pase algo de tu cartón, tócalo. Va al VAR, donde el resto vota.</li>
        <li><b>El árbitro decide.</b> Valida o saca tarjeta amarilla. También puede pitar eventos sin que nadie los cante.</li>
      </ol>

      <h3 className="sub">Puntos</h3>
      <dl className="points">
        <div><dt>Casilla que pasa</dt><dd className="num">+{POINTS.cell}</dd></div>
        <div><dt>Línea (fila, columna o diagonal)</dt><dd className="num">+{POINTS.line}</dd></div>
        <div><dt>Primera línea de la sala</dt><dd className="num">+{POINTS.firstLine}</dd></div>
        <div><dt>Bingo, cartón completo</dt><dd className="num">+{POINTS.bingo}</dd></div>
        <div><dt>Primer bingo de la sala</dt><dd className="num">+{POINTS.firstBingo}</dd></div>
        <div><dt>Cante validado por el árbitro</dt><dd className="num">+{POINTS.hawkEye}</dd></div>
        <div className="bad"><dt>Tarjeta amarilla</dt><dd className="num">{POINTS.yellowCard}</dd></div>
      </dl>
    </div>
  );
}
