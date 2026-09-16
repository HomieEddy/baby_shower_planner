import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ settings: { eventTitle: 'Sophie & Marc' } as Record<string, unknown> | null }));
vi.mock('../../lib/settingsQuery', () => ({ useSettings: () => h.settings }));

import { Footer } from './Footer';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ active: false }) })));
});

const renderFooter = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Footer />
    </QueryClientProvider>
  );
};

describe('Footer credit', () => {
  it('credits the event title', () => {
    h.settings = { eventTitle: 'Sophie & Marc' };
    renderFooter();
    expect(screen.getByText(/Sophie & Marc/)).toBeInTheDocument();
  });

  it('falls back to a neutral label for the event credit', () => {
    h.settings = {};
    renderFooter();
    expect(screen.getByText(/Notre célébration/)).toBeInTheDocument();
  });

  it('names the product exactly once, as a discreet credit', () => {
    h.settings = {};
    renderFooter();
    // §16.1: the product's one allowed appearance inside a customer's event.
    expect(screen.getAllByText(/Bébé/)).toHaveLength(1);
    expect(screen.getByText('Bébé — Planificateur de Baby Shower')).toBeInTheDocument();
  });
});
