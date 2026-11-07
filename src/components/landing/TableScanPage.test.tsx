import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';
import { renderWithProviders } from '../../test/renderWithProviders';
import { TableScanPage } from './TableScanPage';

// The table QR portal refuses a reservation that isn't checked in or isn't
// seated at this table, and the modal tells the guest what to do next.
const t = translations.EN;

const Where = () => <div data-testid="where">{useLocation().pathname + useLocation().search}</div>;

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<TableScanPage />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route }
  );

const respond = (accessStatus: number, accessBody: unknown) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/floorplan')) {
      return new Response(JSON.stringify({ floorMap: { tables: [{ id: 'B', name: 'Table 2' }] } }));
    }
    if (url.startsWith('/api/guest/table-access')) {
      return new Response(JSON.stringify(accessBody), { status: accessStatus });
    }
    return new Response('{}', { status: 404 });
  }));
};

const enterCode = async (code: string) => {
  fireEvent.click(await screen.findByText(t.scanGuestbookCard));
  fireEvent.change(await screen.findByLabelText(t.scanEnterCodeTitle), { target: { value: code } });
  fireEvent.click(screen.getByText(t.portalContinueBtn));
};

beforeEach(() => {
  useAppStore.setState({ language: 'EN' });
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('TableScanPage access safeguards', () => {
  it('sends a guest who has not checked in to the check-in page', async () => {
    respond(403, { error: 'NOT_CHECKED_IN' });
    renderAt('/scan?table=B');
    await enterCode('1234');
    expect(await screen.findByText(t.scanDeniedCheckInTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(t.scanDeniedCheckInBtn));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/check-in?code=1234&table=B'));
  });

  it('names the table a guest is really seated at', async () => {
    respond(403, { error: 'WRONG_TABLE', assignedTable: { id: 'A', name: 'Table 1' } });
    renderAt('/scan?table=B');
    await enterCode('1234');
    expect(await screen.findByText(t.scanDeniedWrongTableTitle)).toBeTruthy();
    expect(screen.getByText(/Your party is seated at Table 1/)).toBeTruthy();
  });

  it('opens the guestbook when the guest is seated here and checked in', async () => {
    respond(200, { ok: true, table: { id: 'B', name: 'Table 2' } });
    renderAt('/scan?table=B');
    await enterCode('1234');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/guestbook?code=1234&table=B'));
  });

  it('re-checks a remembered code before opening a page', async () => {
    sessionStorage.setItem('bsp.tableScanCode', '1234');
    respond(403, { error: 'NOT_CHECKED_IN' });
    renderAt('/scan?table=B');
    fireEvent.click(await screen.findByText(t.scanPhotosCard));
    expect(await screen.findByText(t.scanDeniedCheckInTitle)).toBeTruthy();
  });
});
