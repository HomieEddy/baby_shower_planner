import { describe, it, expect } from 'vitest';
import { csvCell, parseCsvLine, toCsv } from './csv';

describe('parseCsvLine', () => {
  it('splits plain and quoted fields, trimming cells', () => {
    expect(parseCsvLine('Alice, alice@example.com , 555')).toEqual(['Alice', 'alice@example.com', '555']);
  });

  it('keeps commas inside quotes and unescapes doubled quotes', () => {
    expect(parseCsvLine('"Doe, Jane","She said ""hi""",x')).toEqual(['Doe, Jane', 'She said "hi"', 'x']);
  });

  it('returns a single empty cell for a blank line', () => {
    expect(parseCsvLine('')).toEqual(['']);
  });
});

describe('csvCell + toCsv', () => {
  it('quotes and escapes cells', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
  });

  it('joins a header and rows with newlines', () => {
    expect(toCsv(['a', 'b'], [['1', '2'], ['3', '4']])).toBe('a,b\n1,2\n3,4');
  });
});
