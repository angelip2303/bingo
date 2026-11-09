import { useLayoutEffect, useRef } from 'react';

const MIN_PX = 10;

/**
 * Texto que se encoge hasta caber en su caja (como adjustsFontSizeToFitWidth
 * en iOS o el autosize de Android): parte del tamaño del CSS y baja de medio
 * en medio píxel mientras alguna palabra se salga a lo ancho o el texto a lo alto.
 */
export default function FitText({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      const overflows = () => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      while (overflows() && size > MIN_PX) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, [children]);

  return <span ref={ref} className={className}>{children}</span>;
}
