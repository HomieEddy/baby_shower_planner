import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { useAppStore } from '../../stores/appStore';

const h = vi.hoisted(() => ({ settings: { eventTitle: 'Sophie & Marc' } as Record<string, unknown> | null }));
vi.mock('../../lib/settingsQuery', () => ({ useSettings: () => h.settings }));

import { Header } from './Header';

// Unmount first: the language reset re-renders a mounted Header otherwise.
afterEach(() => {
  cleanup();
  useAppStore.setState({ language: 'FR' });
});

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );

describe('Header brand', () => {
  it('shows the event title', () => {
    h.settings = { eventTitle: 'Sophie & Marc' };
    renderHeader();
    expect(screen.getByText('Sophie & Marc')).toBeInTheDocument();
  });

  it('falls back to a neutral label, and never names the product', () => {
    h.settings = {};
    renderHeader();
    expect(screen.getByText('Notre célébration')).toBeInTheDocument();
    expect(screen.queryByText(/Bébé/)).not.toBeInTheDocument();
  });

  it('falls back to the neutral label in English too', async () => {
    h.settings = {};
    useAppStore.setState({ language: 'EN' });
    await i18n.changeLanguage('en');
    renderHeader();
    expect(screen.getByText('Our Celebration')).toBeInTheDocument();
    expect(screen.queryByText(/Bébé/)).not.toBeInTheDocument();
  });
});
