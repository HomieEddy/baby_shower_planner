import { describe, it, expect } from 'vitest';
import { guestInitials } from './tableVisuals';

describe('guestInitials', () => {
  it('uses first and last name initials', () => {
    expect(guestInitials('Marie Tremblay')).toBe('MT');
  });
  it('treats hyphenated surnames as separate words', () => {
    expect(guestInitials('Marie-Claire Tremblay')).toBe('MT');
  });
  it('falls back to the second letter for a single name', () => {
    expect(guestInitials('Alice')).toBe('AL');
  });
  it('returns an empty string for a blank name', () => {
    expect(guestInitials('   ')).toBe('');
  });
});
