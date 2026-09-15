import { describe, expect, it } from 'vitest';
import { reconcileCollectionFields } from './schema';

describe('reconcileCollectionFields', () => {
  it('merges a new select value and reports the change', () => {
    const col = [{ name: 'roomShape', type: 'select', values: ['rectangle', 'circle'] }];
    const def = [{ name: 'roomShape', type: 'select', values: ['rectangle', 'circle', 'ellipse'] }];
    const { fields, changed } = reconcileCollectionFields(col, def);
    expect(changed).toBe(true);
    expect(fields[0].values).toEqual(['rectangle', 'circle', 'ellipse']);
    // The stored fields are left untouched (no aliasing).
    expect(col[0].values).toEqual(['rectangle', 'circle']);
  });

  it('appends fields added after the collection existed', () => {
    const col = [{ name: 'canvasWidth', type: 'number' }];
    const def = [{ name: 'canvasWidth', type: 'number' }, { name: 'roomShape', type: 'select', values: ['rectangle'] }];
    const { fields, changed } = reconcileCollectionFields(col, def);
    expect(changed).toBe(true);
    expect(fields.map(f => f.name)).toEqual(['canvasWidth', 'roomShape']);
  });

  it('reports no change when the collection already matches', () => {
    const col = [{ name: 'roomShape', type: 'select', values: ['rectangle', 'circle'] }];
    const def = [{ name: 'roomShape', type: 'select', values: ['rectangle', 'circle'] }];
    const { changed } = reconcileCollectionFields(col, def);
    expect(changed).toBe(false);
  });
});
