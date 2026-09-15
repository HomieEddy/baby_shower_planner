import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import type { FloorMapData, Guest } from '../../types';
import { translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';

// The seating page is the surface the draft-state refactor can break silently:
// who is seated, what gets saved, and what undo restores are only observable by
// driving the page. Konva has no jsdom canvas, so the canvas primitives are
// stubbed — everything under test is the seat model, not the renderer.

const t = translations.EN;

vi.mock('react-konva', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Void = () => null;
  return {
    Stage: Box, Layer: Box, Group: Box,
    Rect: Void, Circle: Void, Ellipse: Void, Text: Void, Line: Void, Transformer: Void,
  };
});

vi.mock('../shared/ConfirmDialog', () => ({
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
  useConfirm: () => async () => true,
  useActionConfirm: () => async () => true,
}));

const toast = { love: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() };
vi.mock('../shared/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ toast }),
}));

vi.mock('../../lib/settingsQuery', () => ({ useSettings: () => ({ data: undefined }) }));

import { renderWithProviders } from '../../test/renderWithProviders';
import { FloorPlanPage } from './FloorPlanPage';

const PARTY: Guest = {
  id: 'g1',
  name: 'Alice',
  email: 'alice@x.com',
  code: '1111',
  max_party_size: 4,
  rsvp_status: 'Attending',
  attending_party_size: 2,
  attendee_names: ['Alice', 'Bob'],
  attendee_details: [{ name: 'Alice' }, { name: 'Bob' }],
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: 'tok-alice',
  token_used: true,
  created_at: '',
  table_id: '',
};

const EMPTY_MAP: FloorMapData = {
  id: 'map',
  canvasWidth: 900,
  canvasHeight: 650,
  roomShape: 'rectangle',
  tables: [
    { id: 't1', name: 'Table 1', shape: 'circle', x: 200, y: 200, width: 120, height: 120, capacity: 4, assignedGuestIds: [], seats: [null, null, null, null], color: '#8B735B' },
  ],
  landmarks: [],
  updatedAt: '',
};

const calls: Array<{ url: string; method: string; body: any }> = [];

const jsonResponse = (data: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 400, json: async () => data }) as unknown as Response;

// Every floor map POST this test observes, newest last.
const floorMapPosts = () => calls.filter((c) => c.url === '/api/floorplan' && c.method === 'POST');

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  toast.error.mockClear();
  useAppStore.setState({ language: 'EN' });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url === '/api/floorplan' && method === 'GET') return jsonResponse({ floorMap: EMPTY_MAP });
    if (url === '/api/guests') return jsonResponse({ guests: [PARTY] });
    if (url === '/api/capabilities') return jsonResponse({ email: true, sms: true });
    if (url === '/api/floorplan' && method === 'POST') return jsonResponse({ success: true, floorMap: body });
    return jsonResponse({});
  }));
});

afterEach(() => vi.unstubAllGlobals());

const setup = async () => {
  renderWithProviders(<FloorPlanPage />);
  await screen.findByText('Alice');
  return screen.getByText('Alice').closest('div') as HTMLElement;
};

const seatsOf = (table: any) => (table.seats || []).filter(Boolean);

describe('seating page: assign a party and persist', () => {
  it('seats the party into the free chairs and posts the seated map', async () => {
    await setup();

    // Select the unassigned party, then pick the table from the sidebar list.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.selectHighlightBtn) }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp('Table 1') }));

    await waitFor(() => expect(floorMapPosts()).toHaveLength(1));
    const table = floorMapPosts()[0].body.tables[0];
    expect(seatsOf(table)).toEqual([
      { guestId: 'g1', attendeeIndex: 0 },
      { guestId: 'g1', attendeeIndex: 1 },
    ]);
    expect(table.assignedGuestIds).toEqual(['g1']);
  });

  it('re-persists the previous map when the assignment is undone', async () => {
    await setup();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.selectHighlightBtn) }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp('Table 1') }));
    await waitFor(() => expect(floorMapPosts()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.undoBtn) }));

    await waitFor(() => expect(floorMapPosts()).toHaveLength(2));
    expect(seatsOf(floorMapPosts()[1].body.tables[0])).toEqual([]);
  });
});

describe('seating page: the full-screen editor keeps its draft pair in step', () => {
  const openEditor = async () => {
    fireEvent.click(screen.getByTitle(t.btnFullscreenEditor));
    return screen.findByRole('button', { name: new RegExp(t.btnSaveChanges) });
  };

  it('seats a party in the draft, shows the party fully seated, and saves it', async () => {
    await setup();
    await openEditor();

    // The palette row reads "Alice 0/2" (seated/total) — the chip for the
    // individual member is also named Alice, so match the row by its counter.
    const partyRow = () =>
      screen.getByRole('button', { name: (name) => name.startsWith('Alice') && name.includes('/') });

    // Guest workflow: pick the party, then the table that can take it. Two
    // controls switch to this workflow; either one does the same thing.
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.byGuest) })[0]);
    fireEvent.click(partyRow());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.seatPartyHere) }));

    // The counter is derived from BOTH draft halves, so a desync shows here.
    await waitFor(() => expect(partyRow()).toHaveTextContent('2/2'));

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.btnSaveChanges) }));

    await waitFor(() => expect(floorMapPosts()).toHaveLength(1));
    expect(seatsOf(floorMapPosts()[0].body.tables[0])).toHaveLength(2);
  });

  it('adds a table to the draft and saves it with the map', async () => {
    await setup();
    await openEditor();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.roundTableBtn) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.btnSaveChanges) }));

    await waitFor(() => expect(floorMapPosts()).toHaveLength(1));
    expect(floorMapPosts()[0].body.tables).toHaveLength(2);
    // A new table carries explicit empty seats, not just the legacy id list.
    expect(floorMapPosts()[0].body.tables[1].seats).toEqual(new Array(8).fill(null));
  });

  it('discards the draft without saving', async () => {
    await setup();
    await openEditor();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.roundTableBtn) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cancelBtn) }));

    await waitFor(() => expect(screen.queryByRole('button', { name: new RegExp(t.btnSaveChanges) })).not.toBeInTheDocument());
    expect(floorMapPosts()).toHaveLength(0);
  });
});

describe('seating page: host stats', () => {
  it('reports the confirmed party and how many chairs are assigned', async () => {
    await setup();

    const confirmedTile = screen.getByText(t.confirmedGuestsLabel).parentElement as HTMLElement;
    expect(confirmedTile).toHaveTextContent('2');

    const seatsTile = screen.getByText(t.seatsAssignedLabel).parentElement as HTMLElement;
    expect(seatsTile).toHaveTextContent('0');
  });

  it('counts the chairs once the party is seated', async () => {
    await setup();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.selectHighlightBtn) }));
    fireEvent.click(await screen.findByRole('button', { name: /Table 1/ }));

    const seatsTile = screen.getByText(t.seatsAssignedLabel).parentElement as HTMLElement;
    await waitFor(() => expect(seatsTile).toHaveTextContent('2'));
  });
});
