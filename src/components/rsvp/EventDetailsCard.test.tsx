import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ settings: { eventTitle: 'Sophie & Marc' } as Record<string, unknown> | null }));
vi.mock('../../lib/settingsQuery', () => ({ useSettings: () => h.settings }));

import { EventDetailsCard } from './EventDetailsCard';

const renderCard = () =>
  render(
    <MemoryRouter>
      <EventDetailsCard />
    </MemoryRouter>
  );

describe('EventDetailsCard on an unseeded event', () => {
  it('renders a neutral empty state instead of a broken card', () => {
    h.settings = null;
    renderCard();
    // FR default language, matching EmptyState's own tests.
    expect(screen.getByText("Les détails de l'événement arrivent bientôt")).toBeInTheDocument();
  });
});

describe('EventDetailsCard invitation arch', () => {
  // The arch is the only curved <textPath> on the card; the parents' names also
  // render as plain headings, so assert on the arch itself, not the page text.
  const archText = (container: HTMLElement) => container.querySelector('textPath')?.textContent;

  it('arches the event title', () => {
    h.settings = { eventTitle: 'Sophie & Marc', parentsNames: 'Sophie & Marc' };
    const { container } = renderCard();
    expect(archText(container)).toBe('Sophie & Marc');
  });

  it('falls back to a neutral label, never the old hard-coded arch text', () => {
    h.settings = {};
    const { container } = renderCard();
    expect(archText(container)).toBe('Notre célébration');
  });
});

describe('EventDetailsCard invitation background', () => {
  it('uses the uploaded image as decorative decoration', () => {
    h.settings = { eventTitle: 'Sophie & Marc', invitationBackgroundUrl: '/uploads/bg-1.jpg' };
    const { container } = renderCard();
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/uploads/bg-1.jpg');
    expect(img).toHaveAttribute('alt', '');
  });

  it('renders no image when no background is set', () => {
    h.settings = { eventTitle: 'Sophie & Marc' };
    const { container } = renderCard();
    expect(container.querySelector('img')).toBeNull();
  });
});
