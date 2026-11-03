// Font sizing for printed cards. Browsers can't measure text before it's
// printed, so this estimates the size from the character count: long names
// shrink until they fit in the given width over at most `lines` lines.

export interface FitOptions {
  maxPx: number;
  minPx: number;
  widthPx: number;
  /** Average advance width of one character, in em. */
  emPerChar?: number;
  lines?: number;
}

export function fitFontPx(text: string, opts: FitOptions): number {
  const { maxPx, minPx, widthPx, emPerChar = 0.55, lines = 2 } = opts;
  const len = Math.max(1, text.trim().length);
  const charsPerLine = Math.ceil(len / lines);
  const fit = widthPx / (charsPerLine * emPerChar);
  return Math.round(Math.min(maxPx, Math.max(minPx, fit)));
}
