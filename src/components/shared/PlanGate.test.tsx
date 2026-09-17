import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';
import { renderWithProviders } from '../../test/renderWithProviders';
import { PlanGate } from './PlanGate';

const t = translations.EN;

const stubPlan = (plan: string) =>
  vi.stubGlobal('fetch', vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({ email: false, sms: false, plan }) }) as unknown as Response,
  ));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ language: 'EN' });
});

describe('PlanGate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the neutral state instead of a Premium surface on Basic', async () => {
    stubPlan('Basic');
    renderWithProviders(
      <PlanGate feature="guestbook"><div>wishes</div></PlanGate>,
      { route: '/' },
    );

    expect(await screen.findByText(t.featureUnavailableTitle)).toBeInTheDocument();
    expect(screen.getByText(t.featureUnavailableDesc)).toBeInTheDocument();
    expect(screen.queryByText('wishes')).not.toBeInTheDocument();
  });

  it('renders the surface on Premium', async () => {
    stubPlan('Premium');
    renderWithProviders(
      <PlanGate feature="guestbook"><div>wishes</div></PlanGate>,
      { route: '/' },
    );

    expect(await screen.findByText('wishes')).toBeInTheDocument();
    expect(screen.queryByText(t.featureUnavailableTitle)).not.toBeInTheDocument();
  });
});
