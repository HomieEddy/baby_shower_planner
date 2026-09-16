import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';
import type { EventSettings } from '../../types';
import { renderWithProviders } from '../../test/renderWithProviders';

import { EventSetup } from './EventSetup';

const t = translations.EN;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ language: 'EN' });
});

const renderSetup = () => {
  const onSave = vi.fn(async (data: Partial<EventSettings>) => data as EventSettings);
  const view = renderWithProviders(<EventSetup language="EN" t={t} onSave={onSave} />);
  return { onSave, ...view };
};

describe('first-run setup step', () => {
  it('writes the first settings row through the existing save path', async () => {
    const { onSave } = renderSetup();

    fireEvent.change(screen.getByLabelText(t.eventTitleLabel), { target: { value: "Sophie's Shower" } });
    fireEvent.change(screen.getByLabelText(t.parentsNamesLabel2), { target: { value: 'Sophie & Marc' } });
    fireEvent.change(screen.getByLabelText(t.eventDateLabel2), { target: { value: '2026-11-07' } });
    fireEvent.change(screen.getByLabelText(t.venueNameLabel2), { target: { value: 'Salle Lachine' } });
    fireEvent.change(screen.getByLabelText(t.fullVenueAddressLabel), { target: { value: '1 rue' } });
    fireEvent.click(screen.getByRole('button', { name: t.setupSubmitBtn }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload).toMatchObject({
      eventTitle: "Sophie's Shower",
      parentsNames: 'Sophie & Marc',
      venueName: 'Salle Lachine',
      venueAddress: '1 rue',
    });
    // The stored shape is the display shape the rest of the app reads.
    expect(payload.date).toContain('November 7, 2026');
    expect(payload.time).toContain('2:00 PM');
  });

  it('keeps a half-filled setup for the next visit', () => {
    const first = renderSetup();
    fireEvent.change(screen.getByLabelText(t.venueNameLabel2), { target: { value: 'Salle Lachine' } });
    first.unmount();

    renderSetup();
    expect(screen.getByLabelText(t.venueNameLabel2)).toHaveValue('Salle Lachine');
  });
});
