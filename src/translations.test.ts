import { describe, it, expect } from 'vitest';
import { translations, Translations } from './translations';

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2728}\u{2705}\u{274C}\u{2753}\u{2764}\u{2763}\u{2795}-\u{2797}\u{2714}\u{2716}\u{271D}\u{267F}\u{2660}-\u{2667}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2757}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{2B50}\u{1F1E6}-\u{1F1FF}]/u;

describe('translations integrity', () => {
  it('EN and FR have identical key sets', () => {
    const enKeys = Object.keys(translations.EN).sort();
    const frKeys = Object.keys(translations.FR).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('no empty or emoji-laden values', () => {
    const entries: [string, string][] = [
      ...Object.entries(translations.EN),
      ...Object.entries(translations.FR),
    ];
    for (const [key, value] of entries) {
      expect(value.trim(), `EN/FR value for ${key}`).not.toBe('');
      expect(EMOJI_RE.test(value), `emoji in ${key}`).toBe(false);
    }
  });

  it('placeholders are symmetric between languages', () => {
    const enKeys = Object.keys(translations.EN);
    const enRecord = translations.EN as unknown as Record<string, string>;
    const frRecord = translations.FR as unknown as Record<string, string>;
    for (const key of enKeys) {
      const enPlaceholders = enRecord[key].match(/\{\{\w+\}\}/g) ?? [];
      const frPlaceholders = frRecord[key].match(/\{\{\w+\}\}/g) ?? [];
      expect(frPlaceholders.sort(), `placeholders in ${key}`).toEqual(enPlaceholders.sort());
    }
  });
});

describe('translations shape', () => {
  it('is typed as Translations and exposes key strings', () => {
    const t: Translations = translations.EN;
    expect(typeof t.tabCatering).toBe('string');
    expect(typeof t.wipeDbBtn).toBe('string');
  });
});
