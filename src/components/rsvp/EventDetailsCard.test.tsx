import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The unseeded case: no settings row exists yet (a fresh deploy, before the host
// has been through setup). The card must show a neutral state, not fail.
vi.mock('../../lib/settingsQuery', () => ({ useSettings: () => null }));

import { EventDetailsCard } from './EventDetailsCard';

describe('EventDetailsCard on an unseeded event', () => {
  it('renders a neutral empty state instead of a broken card', () => {
    render(
      <MemoryRouter>
        <EventDetailsCard />
      </MemoryRouter>
    );
    // FR default language, matching EmptyState's own tests.
    expect(screen.getByText("Les détails de l'événement arrivent bientôt")).toBeInTheDocument();
  });
});
