import { describe, it, expect } from 'vitest';
import type { Guest, TableElement } from '../../types';
import { translations, type Translations } from '../../translations';
import { seatTooltipContent, tableTooltipContent } from './floorPlanHelpers';

// Hover tooltip content used to be assembled inline in the page with FR/EN
// ternaries, so it could only be checked by hovering a canvas that jsdom does
// not have. It is content now: localized here, asserted here.

// The real strings, with the same {{var}} interpolation i18next performs.
const translatorFor = (t: Translations) => (key: keyof Translations, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    t[key] as string
  );

const en = translatorFor(translations.EN);
const fr = translatorFor(translations.FR);

const table = (over: Partial<TableElement> = {}): TableElement => ({
  id: 't1',
  name: 'Table 1',
  shape: 'circle',
  x: 0,
  y: 0,
  width: 120,
  height: 120,
  capacity: 4,
  assignedGuestIds: [],
  seats: [null, null, null, null],
  ...over,
});

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@x.com',
  code: '1234',
  max_party_size: 4,
  rsvp_status: 'Attending',
  attending_party_size: 2,
  attendee_names: ['Alice', 'Bob'],
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: 'tok',
  token_used: true,
  created_at: '',
  ...over,
});

const seatedTable = () =>
  table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }, null, null], assignedGuestIds: ['g1'] });

describe('seatTooltipContent: occupied chair', () => {
  it('names the member, the party, the seat, the lead, the code and the party size', () => {
    const content = seatTooltipContent(seatedTable(), 1, [guest()], translations.EN, en);

    expect(content.title).toBe('Bob');
    expect(content.subtitle).toBe('Party: Alice');
    expect(content.details).toEqual([
      'Table & Seat: Seat #2 at Table 1',
      'Primary Host: Alice',
      'Reservation Code: 1234',
      'Party of 2',
    ]);
  });

  it('omits the primary-host line when the chair holds the lead', () => {
    const content = seatTooltipContent(seatedTable(), 0, [guest()], translations.EN, en);
    expect(content.title).toBe('Alice');
    expect(content.details).not.toContain('Primary Host: Alice');
  });

  it('is localized: the same seat in French', () => {
    const content = seatTooltipContent(seatedTable(), 1, [guest()], translations.FR, fr);

    expect(content.subtitle).toBe('Groupe : Alice');
    expect(content.details).toEqual([
      'Table & Siège : Siège n°2 (Table 1)',
      'Hôte principal : Alice',
      'Code de réservation : 1234',
      'Groupe de 2',
    ]);
  });

  it('falls back to a numbered label for an unnamed extra member', () => {
    const orphan = guest({ attendee_names: ['Alice'], attendee_details: [{ name: 'Alice' }], attending_party_size: 3 });
    const content = seatTooltipContent(seatedTable(), 1, [orphan], translations.EN, en);
    expect(content.title).toBe('Alice (Guest #2)');
  });

  it('falls back to a generic name and party when the lead has no name at all', () => {
    const nameless = guest({ name: '', attendee_names: [] });
    const content = seatTooltipContent(seatedTable(), 0, [nameless], translations.EN, en);
    expect(content.title).toBe('Assigned Guest');
    expect(content.subtitle).toBe('Party: Guest Party');
  });
});

describe('seatTooltipContent: free chair', () => {
  it('reports the seat, its table capacity and its status', () => {
    const content = seatTooltipContent(table(), 2, [], translations.EN, en);

    expect(content.title).toBe('Seat #3 (Table 1)');
    expect(content.subtitle).toBe('Available Seat');
    expect(content.details).toEqual([
      'Capacity: 4 seats (4 available)',
      'Status: Unassigned / Available Chair',
    ]);
  });

  it('is localized', () => {
    const content = seatTooltipContent(table(), 2, [], translations.FR, fr);
    expect(content.title).toBe('Siège n°3 (Table 1)');
    expect(content.subtitle).toBe('Siège disponible');
  });
});

describe('tableTooltipContent', () => {
  it('lists the seated people and the remaining capacity', () => {
    const content = tableTooltipContent(seatedTable(), [guest()], translations.EN, en);

    expect(content.title).toBe('Table 1');
    expect(content.subtitle).toBe('Round Table • 2/4 Seats');
    expect(content.details).toEqual([
      'Seated (2): Alice, Bob',
      'Capacity: 4 seats (2 available)',
    ]);
  });

  it('says so when nobody is seated yet', () => {
    const content = tableTooltipContent(table(), [], translations.EN, en);
    expect(content.subtitle).toBe('Round Table • 0/4 Seats');
    expect(content.details[0]).toBe('Seated (0): No guests assigned yet');
  });

  it('names a rectangular table in French', () => {
    const content = tableTooltipContent(table({ shape: 'rectangle' }), [], translations.FR, fr);
    expect(content.subtitle).toBe('Table Rectangulaire • 0/4 Places');
  });
});
