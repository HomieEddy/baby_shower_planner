// Shared in-memory PocketBase adapter for db/route tests. It implements the
// slice of the `pb.collection()` API the data layer uses, including the subset
// of the filter grammar (`field="value"`, `field!="value"`, `field=true|false`,
// joined by `&&`) so compound filters can be exercised. One adapter for tests,
// the real SDK for production: the seam is `pb.collection`.

export type PbRecord = { id: string } & Record<string, unknown>;

interface ListOpts {
  filter?: string;
  sort?: string;
}

function fieldEquals(actual: unknown, expected: string): boolean {
  const exp = expected === 'true' ? true : expected === 'false' ? false : expected;
  return String(actual ?? '') === String(exp);
}

// Supports the clause subset above; an unrecognised clause never excludes a row.
export function pbFilterMatches(rec: Record<string, unknown>, filter: string): boolean {
  if (!filter) return true;
  return filter.split('&&').every((clause) => {
    const m = clause.trim().match(/^(\w+)\s*(=|!=)\s*(?:"([^"]*)"|'([^']*)'|(\S+))$/);
    if (!m) return true;
    const [, field, op, dq, sq, bare] = m;
    const expected = dq ?? sq ?? bare ?? '';
    const eq = fieldEquals(rec[field], expected);
    return op === '=' ? eq : !eq;
  });
}

function sortRecords(items: PbRecord[], sort: string): PbRecord[] {
  const desc = sort.startsWith('-');
  const key = sort.replace(/^-/, '');
  return [...items].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * (desc ? -1 : 1));
}

export function createPbFake(initial: Record<string, PbRecord[]> = {}) {
  const stores: Record<string, PbRecord[]> = {};
  for (const [name, rows] of Object.entries(initial)) stores[name] = [...rows];
  let seq = 0;
  const ensure = (name: string): PbRecord[] => (stores[name] ??= []);

  const collection = (name: string) => ({
    getList: async (_page: number, _perPage: number, opts: ListOpts = {}) => {
      let items = [...ensure(name)];
      if (opts.filter) items = items.filter((r) => pbFilterMatches(r, opts.filter as string));
      if (opts.sort) items = sortRecords(items, opts.sort);
      return { items, totalItems: items.length };
    },
    getFirstListItem: async (filter: string) => {
      const found = ensure(name).find((r) => pbFilterMatches(r, filter));
      if (!found) throw new Error('not found');
      return found;
    },
    getFullList: async (opts: ListOpts = {}) => {
      let items = [...ensure(name)];
      if (opts.filter) items = items.filter((r) => pbFilterMatches(r, opts.filter as string));
      if (opts.sort) items = sortRecords(items, opts.sort);
      return items;
    },
    getOne: async (id: string) => {
      const found = ensure(name).find((r) => r.id === id);
      if (!found) throw new Error('not found');
      return found;
    },
    create: async (data: Record<string, unknown>) => {
      const rec: PbRecord = { id: `${name}-${++seq}`, ...data };
      ensure(name).push(rec);
      return rec;
    },
    update: async (id: string, data: Record<string, unknown>) => {
      const found = ensure(name).find((r) => r.id === id);
      if (!found) throw new Error('not found');
      Object.assign(found, data);
      return found;
    },
    delete: async (id: string) => {
      stores[name] = ensure(name).filter((r) => r.id !== id);
    },
  });

  return {
    stores,
    ensure,
    pb: { collection },
    reset: () => {
      for (const name of Object.keys(stores)) stores[name].length = 0;
      seq = 0;
    },
  };
}
