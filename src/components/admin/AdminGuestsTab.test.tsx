import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import type { Guest } from '../../types';
import { translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';

// The admin guest list is the surface a controller/interface refactor can
// silently break, so its behaviour is pinned through the rendered page: the
// metrics, the filters, the add form, the CSV import and the wired actions.

const t = translations.EN;

// Confirm/Toast are separate surfaces; here they resolve immediately so the
// test observes what the tab does once an action is confirmed.
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

import { renderWithProviders } from '../../test/renderWithProviders';
import { AdminGuestsTab } from './AdminGuestsTab';

const guest = (over: Partial<Guest> = {}): Guest => ({
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
  ...over,
});

const GUESTS: Guest[] = [
  guest(),
  guest({ id: 'g2', name: 'Cara', email: 'cara@x.com', code: '2222', rsvp_status: 'Pending', magic_token: 'tok-cara', invited_by_guest_id: 'g1' }),
];

const calls: Array<{ url: string; method: string; body: any }> = [];

const jsonResponse = (data: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 400, json: async () => data }) as unknown as Response;

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  toast.love.mockClear();
  // The child components label themselves through i18next, which follows the
  // store; the tab's own strings come from the `t` prop below.
  useAppStore.setState({ language: 'EN' });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.startsWith('/api/capabilities')) return jsonResponse({ email: true, sms: true });
    if (url.startsWith('/api/floorplan')) return jsonResponse({ floorMap: null });
    if (url.startsWith('/api/guests')) return jsonResponse({ guest: {}, success: true, count: 0, guests: [], message: '' });
    return jsonResponse({});
  }));
});

afterEach(() => vi.unstubAllGlobals());

// Render, then wait for the store language to reach the rendered tree.
const setup = async (guests: Guest[] = GUESTS) => {
  const onRefresh = vi.fn(async () => {});
  renderWithProviders(<AdminGuestsTab language="EN" t={t} guests={guests} onRefresh={onRefresh} />);
  await screen.findByLabelText(t.searchGuestsPh);
  await screen.findByText('Alice');
  return { onRefresh };
};

const metricCard = (label: string, footer: string) =>
  screen.getByRole('button', { name: new RegExp(`${label}[\\s\\S]*${footer}`) });

describe('admin guest list: metrics', () => {
  it('counts invites by default and party members in party mode', async () => {
    await setup();

    const attendingCard = metricCard(t.statAttending, t.statTotalAttendingParty);
    expect(within(attendingCard).getByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.colPartySize }));
    expect(within(attendingCard).getByText('2')).toBeInTheDocument();
  });

  it('filters the list from a metric card', async () => {
    await setup();

    fireEvent.click(metricCard(t.statPending, t.awaitingResponse));
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
    expect(screen.getByText('Cara')).toBeInTheDocument();
  });
});

describe('admin guest list: filtering', () => {
  it('narrows the list by name and clears back to everyone', async () => {
    await setup();

    fireEvent.change(screen.getByLabelText(t.searchGuestsPh), { target: { value: 'cara' } });
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
    expect(screen.getByText('Cara')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(t.searchGuestsPh), { target: { value: '' } });
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  it('filters by source (guest-invited)', async () => {
    await setup();

    fireEvent.click(screen.getByRole('button', { name: t.sourceGuestOption }));
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
    expect(screen.getByText('Cara')).toBeInTheDocument();
  });
});

describe('admin guest list: add a guest', () => {
  it('posts the form values and the selected channel', async () => {
    await setup();

    fireEvent.change(screen.getByPlaceholderText(t.nameExamplePh), { target: { value: 'Grandma' } });
    fireEvent.click(screen.getByRole('button', { name: t.createInviteBtn }));

    await waitFor(() => {
      const post = calls.find((c) => c.url === '/api/guests' && c.method === 'POST');
      expect(post?.body).toMatchObject({
        name: 'Grandma',
        delivery_channel: 'none',
        going: false,
        max_party_size: 2,
      });
    });
  });
});

describe('admin guest list: CSV import', () => {
  it('parses the pasted rows and batch-imports them', async () => {
    await setup();

    fireEvent.click(screen.getByRole('button', { name: t.actionsLabel }));
    fireEvent.click(screen.getByRole('menuitem', { name: t.importCsvBtn }));

    const textarea = screen.getByPlaceholderText(/Grandma Ellen/);
    fireEvent.change(textarea, { target: { value: `${t.csvColumnsHint}\nGrandma, grandma@x.com, 555, 3, text` } });
    fireEvent.click(screen.getByRole('button', { name: t.processImportBtn }));

    await waitFor(() => {
      const post = calls.find((c) => c.url === '/api/guests/batch-import');
      expect(post?.body.guests).toEqual([
        { name: 'Grandma', email: 'grandma@x.com', phone: '555', max_party_size: 3, delivery_channel: 'text', language_pref: 'EN' },
      ]);
    });
  });

  it('keeps the modal open and shows the invalid-CSV toast when nothing parsed', async () => {
    await setup();

    fireEvent.click(screen.getByRole('button', { name: t.actionsLabel }));
    fireEvent.click(screen.getByRole('menuitem', { name: t.importCsvBtn }));
    fireEvent.change(screen.getByPlaceholderText(/Grandma Ellen/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: t.processImportBtn }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.csvEmptyToast));
    expect(calls.some((c) => c.url === '/api/guests/batch-import')).toBe(false);
  });
});

describe('admin guest list: guest actions', () => {
  it('removes one party member after confirmation', async () => {
    await setup();

    fireEvent.click(screen.getAllByRole('button', { name: t.viewBtn })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getAllByTitle(t.removeAttendeeTitle)[0]);

    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/remove-attendee'));
      expect(post?.url).toBe('/api/guests/g1/remove-attendee');
      expect(post?.body).toMatchObject({ index: 0 });
    });
  });

  it('deletes the guest after confirmation and refreshes', async () => {
    const { onRefresh } = await setup();

    fireEvent.click(screen.getAllByRole('button', { name: t.viewBtn })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(t.deleteGuestTitle) }));

    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/guests/g1' && c.method === 'DELETE')).toBe(true);
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
