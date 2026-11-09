/**
 * Prueba de tipografías: abre la app con ?font=<id> y toda la interfaz cambia.
 * Se recuerda en este navegador; ?font=barlow vuelve a la de serie.
 */
interface FontOption { body: string; cell: string; css: string; cellStretch?: string }

export const FONTS: Record<string, FontOption> = {
  barlow: { body: 'Barlow', cell: 'Barlow Semi Condensed', css: 'family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600' },
  archivo: { body: 'Archivo', cell: 'Archivo Narrow', css: 'family=Archivo:wght@400;500;600;700&family=Archivo+Narrow:wght@500;600' },
  saira: { body: 'Saira', cell: 'Saira Semi Condensed', css: 'family=Saira:wght@400;500;600;700&family=Saira+Semi+Condensed:wght@500;600' },
  instrument: { body: 'Instrument Sans', cell: 'Instrument Sans', css: 'family=Instrument+Sans:wdth,wght@75..100,400..700', cellStretch: '85%' },
  schibsted: { body: 'Schibsted Grotesk', cell: 'Schibsted Grotesk', css: 'family=Schibsted+Grotesk:wght@400;500;600;700' },
  plex: { body: 'IBM Plex Sans', cell: 'IBM Plex Sans Condensed', css: 'family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@500;600' },
};

const KEY = 'bingo-salvaje-font';

export function applyFontChoice() {
  let id: string | null = new URLSearchParams(location.search).get('font');
  try {
    if (id) localStorage.setItem(KEY, id);
    else id = localStorage.getItem(KEY);
  } catch { /* sin persistencia */ }
  const f = id ? FONTS[id] : undefined;
  if (!f || id === 'barlow') return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${f.css}&display=swap`;
  document.head.appendChild(link);
  const root = document.documentElement.style;
  root.setProperty('--body', `'${f.body}', system-ui, sans-serif`);
  root.setProperty('--cell', `'${f.cell}', '${f.body}', system-ui, sans-serif`);
  if (f.cellStretch) root.setProperty('--cell-stretch', f.cellStretch);
}
