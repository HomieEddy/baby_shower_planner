import { describe, it, expect } from 'vitest';
import { COLLECTION_DEFS, COLLECTION_SCHEMAS } from '../db/collectionDefs';

// Guards the exact drift this refactor exists to prevent: a field present in
// the domain schema but missing from the derived PB collection (or vice versa).
describe('collection defs track the domain schemas', () => {
  for (const def of COLLECTION_DEFS) {
    it(`${def.name}: PB fields and Zod keys agree`, () => {
      const zodKeys = Object.keys(COLLECTION_SCHEMAS[def.name].shape).sort();
      const pbKeys = def.schema.map((f) => f.name).sort();
      expect(pbKeys).toEqual(zodKeys);
    });
  }

  it('settings carries the agenda reminder fields', () => {
    const settings = COLLECTION_DEFS.find((d) => d.name === 'settings')!;
    const names = settings.schema.map((f) => f.name);
    for (const field of ['hostEmail', 'hostPhone', 'reminderChannels', 'reminderAdvance', 'language']) {
      expect(names).toContain(field);
    }
  });
});
