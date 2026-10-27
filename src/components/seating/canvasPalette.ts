import { useEffect, useState } from 'react';

// Konva draws to a canvas, so it can't read CSS variables. This reads the theme
// vars once and re-reads them whenever the root element's theme changes.
export interface CanvasPalette {
  surface: string;
  accent: string;
}

const FALLBACK: CanvasPalette = { surface: '#FFFDF9', accent: '#CBAE94' };

const readPalette = (): CanvasPalette => {
  if (typeof window === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    surface: pick('--surface', FALLBACK.surface),
    accent: pick('--accent', FALLBACK.accent),
  };
};

export const useCanvasPalette = (): CanvasPalette => {
  const [palette, setPalette] = useState(readPalette);

  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return palette;
};
