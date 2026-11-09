import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR en SVG (nítido a cualquier tamaño), con los colores de la app. */
export default function QrCode({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a0a0a', light: '#f3efe7' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [value]);
  return <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
