import { describe, expect, it } from 'vitest';
import { mixHex } from './themePresets';

describe('mixHex', () => {
  it('returns the endpoints at 0 and 1', () => {
    expect(mixHex('#1C1917', '#F5EDE6', 0)).toBe('#1C1917');
    expect(mixHex('#1C1917', '#F5EDE6', 1)).toBe('#F5EDE6');
  });

  it('blends channel by channel', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('falls back to the first color for invalid input', () => {
    expect(mixHex('#123', '#FFFFFF', 0.5)).toBe('#123');
  });
});
