import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './i18n';
import i18n from 'i18next';
import { translations } from '../../translations';

// `useTf` is a thin wrapper over i18next's `t`; this exercises the underlying
// interpolation the hook relies on.
describe('i18n interpolation', () => {
  it('substitutes every placeholder and leaves none behind', () => {
    const out = i18n.t('fpSeatedToast', { guest: 'Alice', size: 3, table: 'Table 1' });
    expect(out).toContain('Alice');
    expect(out).toContain('Table 1');
    expect(out).not.toMatch(/\{\{\w+\}\}/);
  });

  it('interpolates `count` without needing plural forms', () => {
    const out = i18n.t('unseatedCountLabel', { count: 3 });
    expect(out).toContain('3');
    expect(out).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('plural selection', () => {
  it('picks singular for 1 and plural for 2 (EN)', () => {
    const one = i18n.t('applySeatingBtn', { count: 1, lng: 'en' });
    const many = i18n.t('applySeatingBtn', { count: 2, lng: 'en' });
    expect(one).not.toBe(many);
    expect(one).toContain('1');
    expect(many).toContain('2');
    expect(one).not.toMatch(/\{\{\w+\}\}/);
    expect(many).not.toMatch(/\{\{\w+\}\}/);
  });

  it('French treats 0 and 1 as singular, 2 as plural', () => {
    const zero = i18n.t('applySeatingBtn', { count: 0, lng: 'fr' });
    const one = i18n.t('applySeatingBtn', { count: 1, lng: 'fr' });
    const many = i18n.t('applySeatingBtn', { count: 2, lng: 'fr' });
    // Singular form ("placement") for 0 and 1; plural ("placements") for 2.
    expect(zero).toContain('placement');
    expect(zero).not.toContain('placements');
    expect(one).not.toContain('placements');
    expect(many).toContain('placements');
  });
});

// Guards the refactor: placeholders are filled by useTf, so no call site should
// substitute `{{...}}` by hand again.
describe('no manual placeholder substitution', () => {
  it('src has no .replace against a {{placeholder}}', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (/\.replace\(\s*['"]\{\{/.test(src)) offenders.push(path.relative(process.cwd(), full));
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

// Guards the clean-text pass: a key carrying `{{...}}` must be read through
// `tf(...)`, never `t.key` (which leaves the raw token visible).
describe('no raw placeholder keys read via t.key', () => {
  const placeholderKeys = new Set<string>();
  for (const lang of ['EN', 'FR'] as const) {
    for (const [key, value] of Object.entries(translations[lang] as unknown as Record<string, string>)) {
      if (/\{\{/.test(value)) placeholderKeys.add(key);
    }
  }

  it('every t.<key> whose value has a placeholder uses tf()', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          const re = /(?<![.\w])t\.([A-Za-z0-9_]+)\b/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(src))) {
            if (placeholderKeys.has(m[1])) {
              offenders.push(`${path.relative(process.cwd(), full)}: t.${m[1]}`);
            }
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });

  it('no translation is a bare bracketed mock label', () => {
    const offenders: string[] = [];
    for (const lang of ['EN', 'FR'] as const) {
      for (const [key, value] of Object.entries(translations[lang] as unknown as Record<string, string>)) {
        if (/^\[[^\]]*\]$/.test(value)) offenders.push(`${lang} ${key} = ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
