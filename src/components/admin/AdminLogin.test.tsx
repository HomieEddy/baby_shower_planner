import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ settings: { eventTitle: 'Sophie & Marc' } as Record<string, unknown> | null }));
vi.mock('../../lib/settingsQuery', () => ({ useSettings: () => h.settings }));

import { AdminLogin } from './AdminLogin';

const renderLogin = () =>
  render(
    <MemoryRouter>
      <AdminLogin />
    </MemoryRouter>
  );

describe('Sign-in page', () => {
  it('shows the event title', () => {
    h.settings = { eventTitle: 'Sophie & Marc' };
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Sophie & Marc' })).toBeInTheDocument();
  });

  it('falls back to a neutral label, and never names the product', () => {
    h.settings = {};
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Notre célébration' })).toBeInTheDocument();
    expect(screen.queryByText(/Bébé/)).not.toBeInTheDocument();
  });
});
