import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';

// The dashboard's tab panels are other surfaces with their own tests; this file
// pins the first-run gating only.
vi.mock('./AdminGuestsTab', () => ({ AdminGuestsTab: () => null }));
vi.mock('../shared/ConfirmDialog', () => ({
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
  useConfirm: () => async () => true,
  useActionConfirm: () => async () => true,
}));
vi.mock('../shared/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ toast: { love: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() } }),
}));

import { renderWithProviders } from '../../test/renderWithProviders';
import { AdminDashboard } from './AdminDashboard';

const t = translations.EN;

const json = (data: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 400, json: async () => data }) as unknown as Response;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useAppStore.setState({ language: 'EN' });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    if (url.startsWith('/api/settings')) {
      // Unseeded until the setup step writes the first row.
      if (method === 'POST') return json({ success: true, settings: JSON.parse(String(init?.body)) });
      return json({ settings: null });
    }
    if (url.startsWith('/api/guests')) return json({ guests: [] });
    if (url.startsWith('/api/guestbook')) return json({ entries: [] });
    if (url.startsWith('/api/alerts')) return json({ alerts: [] });
    if (url.startsWith('/api/gifts')) return json({ gifts: [] });
    if (url.startsWith('/api/photos')) return json({ photos: [] });
    if (url.startsWith('/api/rehearsal')) return json({ active: false });
    return json({});
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('first-run gating', () => {
  it('shows the setup step for an unconfigured event, then the dashboard once saved', async () => {
    renderWithProviders(<AdminDashboard />, { route: '/admin' });

    await screen.findByText(t.setupTitle);
    expect(screen.queryByText(t.adminTitle)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(t.eventTitleLabel), { target: { value: "Sophie's Shower" } });
    fireEvent.change(screen.getByLabelText(t.parentsNamesLabel2), { target: { value: 'Sophie & Marc' } });
    fireEvent.change(screen.getByLabelText(t.eventDateLabel2), { target: { value: '2026-11-07' } });
    fireEvent.change(screen.getByLabelText(t.venueNameLabel2), { target: { value: 'Salle Lachine' } });
    fireEvent.change(screen.getByLabelText(t.fullVenueAddressLabel), { target: { value: '1 rue' } });
    fireEvent.click(screen.getByRole('button', { name: t.setupSubmitBtn }));

    // Same mount, no reload: the cached settings row flips the dashboard in.
    // (The dashboard names itself in the header, breadcrumb and mobile bar.)
    await screen.findAllByText(t.adminTitle);
    expect(screen.queryByText(t.setupTitle)).not.toBeInTheDocument();
  });
});

describe('premium surfaces lock on a Basic deploy', () => {
  const stubApi = (plan: string) =>
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('/api/capabilities')) return json({ email: false, sms: false, plan });
      if (url.startsWith('/api/settings')) {
        if (method === 'POST') return json({ success: true, settings: JSON.parse(String(init?.body)) });
        return json({ settings: { eventTitle: 'Shower', parentsNames: 'Sophie', date: '2026-11-07' } });
      }
      if (url.startsWith('/api/guests')) return json({ guests: [] });
      if (url.startsWith('/api/guestbook')) return json({ entries: [] });
      if (url.startsWith('/api/alerts')) return json({ alerts: [] });
      if (url.startsWith('/api/gifts')) return json({ gifts: [] });
      if (url.startsWith('/api/photos')) return json({ photos: [] });
      if (url.startsWith('/api/rehearsal')) return json({ active: false });
      return json({});
    }));

  const openGuestbookTab = async () => {
    renderWithProviders(<AdminDashboard />, { route: '/admin' });
    await screen.findAllByText(t.adminTitle);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.tabGuestbookFeed) }));
  };

  it('shows the upgrade panel in place of the feature', async () => {
    stubApi('Basic');
    await openGuestbookTab();

    expect(await screen.findByText(t.upgradeLockedTitle)).toBeInTheDocument();
    expect(screen.getByText(t.upgradeCta)).toBeInTheDocument();
  });

  it('renders the feature on Premium', async () => {
    stubApi('Premium');
    await openGuestbookTab();

    expect(screen.queryByText(t.upgradeLockedTitle)).not.toBeInTheDocument();
  });
});
