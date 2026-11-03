import { describe, expect, it } from 'vitest';
import { fitFontPx } from './cardText';

describe('fitFontPx', () => {
  const opts = { maxPx: 24, minPx: 12, widthPx: 200 };

  it('uses the max size for short text', () => {
    expect(fitFontPx('Amy', opts)).toBe(24);
  });

  it('shrinks as the text gets longer', () => {
    const medium = fitFontPx('Marie-Claude Tremblay-Gagnon de la Rochelle', opts);
    const long = fitFontPx('Marie-Claude Tremblay-Gagnon de la Rochelle, Jean-Baptiste', opts);
    expect(medium).toBeLessThan(24);
    expect(long).toBeLessThan(medium);
  });

  it('never goes below the min size', () => {
    expect(fitFontPx('x'.repeat(500), opts)).toBe(12);
  });

  it('treats blank text as short', () => {
    expect(fitFontPx('   ', opts)).toBe(24);
  });
});
