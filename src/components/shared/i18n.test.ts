import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './i18n';
import i18n from 'i18next';

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
