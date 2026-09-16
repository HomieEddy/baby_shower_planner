import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const h = vi.hoisted(() => ({ settings: { eventTitle: 'Sophie & Marc' } as Record<string, unknown> | null }));
vi.mock('./lib/settingsQuery', () => ({ useSettings: () => h.settings }));
// The shell's chrome would pull their own providers in; the tab title is set by
// App itself, so only the route content is silenced here.
vi.mock('./components/layout/Header', () => ({ Header: () => null }));
vi.mock('./components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('./components/landing/LandingPage', () => ({ LandingPage: () => null }));

import App from './App';

describe('Document title', () => {
  it('carries the event title', () => {
    h.settings = { eventTitle: 'Sophie & Marc' };
    render(<App />);
    expect(document.title).toBe('Sophie & Marc');
  });

  it('falls back to a neutral label, and never names the product', () => {
    h.settings = {};
    render(<App />);
    expect(document.title).toBe('Notre célébration');
  });
});

describe('Document language', () => {
  it("resolves from the event's default language", () => {
    h.settings = { eventTitle: 'Sophie & Marc', defaultLanguage: 'EN' };
    render(<App />);
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to one language when the event has no default', () => {
    h.settings = { eventTitle: 'Sophie & Marc' };
    render(<App />);
    expect(document.documentElement.lang).toBe('fr');
  });
});
