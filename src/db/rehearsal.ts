// Rehearsal mode: seed disposable demo data so a host can smoke-test every
// flow the night before, then remove only what the rehearsal created.
//
// Data is differentiated by creation time: `startedAt` is captured when the
// rehearsal begins and `deleteRecordsSince` removes only rows created after it.
// The floor map (the one collection without created_at) is snapshotted and
// restored. Real pre-existing data is never deleted.

import type { Guest, TableElement, LandmarkElement, SeatOccupant } from '../types';
import { fromRecord, newMagicToken, newReservationCode, pb } from './client';
import { deleteRecordsSince } from './schema';

// ponytail: in-memory flag + cutoff. If the server restarts mid-rehearsal the
// banner is lost and demo rows linger until manually cleared. Upgrade path:
// persist `startedAt` in settings if cross-restart survival matters.
let active = false;
let startedAt = '';
let savedMap: { id: string; data: Record<string, unknown> } | null = null;
let rehearsalMapId: string | null = null;

export function isRehearsalActive(): boolean {
  return active;
}

interface DemoGuestSpec {
  slug: string;
  name: string;
  status: Guest['rsvp_status'];
  party: string[];
  max: number;
  lang: Guest['language_pref'];
  dietary?: string;
  table: 'A' | 'B' | 'C' | null;
}

const DEMO_GUESTS: DemoGuestSpec[] = [
  { slug: 'amelia', name: 'Amelia Laurent', status: 'Attending', party: ['Amelia Laurent', 'Noah Laurent'], max: 2, lang: 'FR', dietary: 'Vegetarian', table: 'A' },
  { slug: 'marcus', name: 'Marcus Chen', status: 'Attending', party: ['Marcus Chen'], max: 1, lang: 'EN', table: 'A' },
  { slug: 'sofia', name: 'Sofia Rossi', status: 'Attending', party: ['Sofia Rossi', 'Luca Rossi', 'Mia Rossi'], max: 3, lang: 'EN', dietary: 'Gluten-free', table: 'B' },
  { slug: 'david', name: 'David Okafor', status: 'Attending', party: ['David Okafor', 'Grace Okafor'], max: 2, lang: 'EN', table: 'C' },
  { slug: 'elias', name: 'Elias Novak', status: 'Attending', party: ['Elias Novak'], max: 1, lang: 'FR', table: 'C' },
  { slug: 'priya', name: 'Priya Patel', status: 'Declined', party: [], max: 1, lang: 'EN', table: null },
  { slug: 'jules', name: 'Jules Tremblay', status: 'Pending', party: [], max: 2, lang: 'FR', table: null },
  { slug: 'hana', name: 'Hana Kim', status: 'Pending', party: [], max: 1, lang: 'EN', table: null },
];

async function createDemoGuest(spec: DemoGuestSpec): Promise<Guest> {
  const attending = spec.status === 'Attending';
  const r = await pb.collection('guests').create({
    name: spec.name,
    email: `demo+${spec.slug}@example.com`,
    phone: '',
    delivery_channel: 'none',
    code: newReservationCode(),
    max_party_size: Math.max(spec.max, spec.party.length, 1),
    rsvp_status: spec.status,
    attending_party_size: attending ? spec.party.length : 0,
    attendee_names: attending ? spec.party : [],
    attendee_details: attending ? spec.party.map((n) => ({ name: n, contact: '' })) : [],
    dietary_restrictions: spec.dietary || '',
    language_pref: spec.lang,
    magic_token: newMagicToken(),
    token_used: spec.status !== 'Pending',
    approval_status: 'approved',
    is_read_only: false,
    created_at: new Date().toISOString(),
  });
  return fromRecord<Guest>(r);
}

function emptySeats(capacity: number): (SeatOccupant | null)[] {
  return new Array(capacity).fill(null);
}

// Build a table's explicit seat list from the parties assigned to it.
function seatTable(
  id: string,
  name: string,
  shape: TableElement['shape'],
  x: number,
  y: number,
  width: number,
  height: number,
  capacity: number,
  parties: Array<{ guest: Guest; size: number }>
): TableElement {
  const seats = emptySeats(capacity);
  const assignedGuestIds: string[] = [];
  let cursor = 0;
  for (const { guest, size } of parties) {
    if (!assignedGuestIds.includes(guest.id)) assignedGuestIds.push(guest.id);
    for (let i = 0; i < size && cursor < capacity; i++) {
      seats[cursor++] = { guestId: guest.id, attendeeIndex: i };
    }
  }
  return { id, name, shape, x, y, width, height, capacity, seats, assignedGuestIds };
}

async function seedFloorMap(guestsBySlug: Record<string, Guest>): Promise<number> {
  const party = (slug: string, size: number) => ({
    guest: guestsBySlug[slug],
    size: Math.min(size, guestsBySlug[slug].attendee_names?.length || 1),
  });
  const tables: TableElement[] = [
    seatTable('rehearsal-table-a', 'Table A', 'circle', 120, 120, 120, 120, 6, [party('amelia', 2), party('marcus', 1)]),
    seatTable('rehearsal-table-b', 'Table B', 'rectangle', 420, 120, 160, 90, 6, [party('sofia', 3)]),
    seatTable('rehearsal-table-c', 'Table C', 'circle', 680, 300, 120, 120, 6, [party('david', 2), party('elias', 1)]),
  ];
  const landmarks: LandmarkElement[] = [
    { id: 'rehearsal-lm-entrance', name: 'Entrance', type: 'entrance', x: 20, y: 440, width: 90, height: 40 },
    { id: 'rehearsal-lm-gifts', name: 'Gifts', type: 'gifts', x: 420, y: 430, width: 100, height: 50 },
    { id: 'rehearsal-lm-food', name: 'Food', type: 'food', x: 700, y: 40, width: 110, height: 50 },
  ];
  const payload = {
    canvasWidth: 850,
    canvasHeight: 520,
    roomShape: 'rectangle',
    tables,
    landmarks,
    updatedAt: new Date().toISOString(),
  };

  const existing = await pb.collection('floor_maps').getFullList();
  if (existing.length > 0) {
    const record = existing[0];
    savedMap = {
      id: record.id,
      data: {
        canvasWidth: record.canvasWidth,
        canvasHeight: record.canvasHeight,
        roomShape: record.roomShape,
        tables: record.tables ?? [],
        landmarks: record.landmarks ?? [],
        updatedAt: record.updatedAt,
      },
    };
    rehearsalMapId = record.id;
    await pb.collection('floor_maps').update(record.id, payload);
  } else {
    savedMap = null;
    const created = await pb.collection('floor_maps').create(payload);
    rehearsalMapId = created.id;
  }

  // Mirror the assigned table id onto the seated guests (legacy scalar).
  for (const table of tables) {
    for (const guestId of table.assignedGuestIds) {
      await pb.collection('guests').update(guestId, { table_id: table.id });
    }
  }
  return tables.length;
}

async function seedGuestbookAndGifts(guestsBySlug: Record<string, Guest>): Promise<void> {
  const now = () => new Date().toISOString();
  const entries = [
    { name: guestsBySlug.amelia.name, message: 'Congratulations! So excited to meet the little one.' },
    { name: guestsBySlug.sofia.name, message: 'Felicitations pour ce heureux evenement !' },
    { name: guestsBySlug.marcus.name, message: 'Wishing you all the best on this new adventure.' },
    { name: guestsBySlug.david.name, message: 'Can not wait to celebrate with you all.' },
  ];
  for (const e of entries) {
    await pb.collection('guestbook').create({
      guest_name: e.name,
      message: e.message,
      photo_url: '',
      visible: true,
      created_at: now(),
    });
  }

  const gifts = [
    { slug: 'amelia', desc: 'Wooden stacking rings', category: 'Toys', sent: true },
    { slug: 'sofia', desc: 'Cotton sleep sack', category: 'Clothing', sent: false },
    { slug: 'marcus', desc: 'Nursery monitor', category: 'Nursery', sent: true },
    { slug: 'david', desc: 'Bottle sterilizer', category: 'Feeding', sent: false },
  ] as const;
  for (const g of gifts) {
    const guest = guestsBySlug[g.slug];
    await pb.collection('gifts').create({
      guest_name: guest.name,
      guest_id: guest.id,
      gift_description: g.desc,
      category: g.category,
      thank_you_sent: g.sent,
      thank_you_date: g.sent ? now().split('T')[0] : null,
      created_at: now(),
    });
  }
}

async function seedMisc(): Promise<void> {
  const now = () => new Date().toISOString();
  await pb.collection('alerts').create({
    type: 'CUSTOM',
    title: 'Rehearsal notice',
    message: 'This is demo data for a smoke test.',
    active: true,
    target_audience: 'ALL',
    notified_guests_count: 0,
    created_at: now(),
  });

  const tasks = [
    { title: 'Rehearsal: confirm catering headcount', status: 'todo' },
    { title: 'Rehearsal: print escort cards', status: 'in_progress' },
    { title: 'Rehearsal: test the photo slideshow', status: 'done' },
  ] as const;
  let position = 0;
  for (const task of tasks) {
    await pb.collection('agenda_tasks').create({
      title: task.title,
      description: '',
      due_date: '',
      due_time: '',
      status: task.status,
      position: position++,
      reminder_sent: false,
      created_at: now(),
    });
  }
}

export async function startRehearsal(): Promise<{
  active: true;
  startedAt: string;
  sample: { name: string; code: string; magic_token: string };
  pendingToken: string;
  counts: { guests: number; tables: number };
}> {
  if (active) await runStopCleanup();

  startedAt = new Date().toISOString();
  active = true;

  const guestsBySlug: Record<string, Guest> = {};
  for (const spec of DEMO_GUESTS) {
    guestsBySlug[spec.slug] = await createDemoGuest(spec);
  }
  const tables = await seedFloorMap(guestsBySlug);
  await seedGuestbookAndGifts(guestsBySlug);
  await seedMisc();

  const sample = guestsBySlug.amelia;
  return {
    active: true,
    startedAt,
    sample: { name: sample.name, code: sample.code, magic_token: sample.magic_token },
    pendingToken: guestsBySlug.jules.magic_token,
    counts: { guests: DEMO_GUESTS.length, tables },
  };
}

async function runStopCleanup(): Promise<number> {
  const deleted = startedAt ? await deleteRecordsSince(startedAt) : 0;

  if (savedMap) {
    await pb.collection('floor_maps').update(savedMap.id, savedMap.data);
  } else if (rehearsalMapId) {
    await pb.collection('floor_maps').delete(rehearsalMapId).catch(() => { /* already gone */ });
  }
  savedMap = null;
  rehearsalMapId = null;
  startedAt = '';
  return deleted;
}

export async function stopRehearsal(): Promise<{ active: false; deleted: number }> {
  const deleted = await runStopCleanup();
  active = false;
  return { active: false, deleted };
}
