import { describe, it, expect } from 'vitest';
import { foldToGsm, gsmLength, isGsm7, splitSms } from './gsm7';

describe('foldToGsm', () => {
  it('keeps GSM-7 accents, simplifies the rest, and drops emoji', () => {
    expect(foldToGsm('🌸 Fête à côté 🌸')).toBe('Fete à coté');
    expect(foldToGsm('l\u2019été « œuvre »')).toBe("l'été oeuvre");
    expect(isGsm7(foldToGsm('Noël, août, ça, ÎLE'))).toBe(true);
  });
});

describe('splitSms', () => {
  it('returns one part when the text fits', () => {
    expect(splitSms('Hello there')).toEqual(['Hello there']);
  });

  it('breaks at spaces so every part fits and no word is lost', () => {
    const text = Array(100).fill('hello').join(' ');
    const parts = splitSms(text);
    expect(parts.length).toBe(4);
    for (const p of parts) expect(gsmLength(p)).toBeLessThanOrEqual(160);
    expect(parts.join(' ')).toBe(text);
  });

  it('prefers a line break near the end of a text', () => {
    const text = `${'a '.repeat(70)}end\n${'b '.repeat(40)}`;
    expect(splitSms(text)[0]).toBe(`${'a '.repeat(70)}end`);
  });

  it('keeps a link whole', () => {
    const link = 'https://maps.google.com/?q=Salle+des+fetes,+12+rue+des+Lilas,+Montreal';
    const parts = splitSms(`${'a'.repeat(120)}\nMap: ${link}\nEnd`);
    expect(parts.some((p) => p.includes(link))).toBe(true);
  });

  it('hard-cuts a single word longer than one text', () => {
    const parts = splitSms('x'.repeat(400));
    expect(parts.map((p) => p.length)).toEqual([160, 160, 80]);
  });

  it('counts extension characters (like the euro sign) as two', () => {
    expect(gsmLength('€10')).toBe(4);
    const parts = splitSms('€'.repeat(100));
    expect(parts[0].length).toBe(80);
  });
});
