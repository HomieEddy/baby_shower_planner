import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EventSettings } from '../../types';

import { AppMark } from './AppMark';

const settings = (over: Partial<EventSettings>) =>
  ({ babyName: '', parentsNames: '', date: '', time: '', venueName: '', venueAddress: '', registryUrl: '', ...over }) as EventSettings;

describe('AppMark', () => {
  it('shows the uploaded logo, described by the event name', () => {
    render(<AppMark settings={settings({ eventTitle: 'Sophie & Marc', logoUrl: '/uploads/logo-1.png' })} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/uploads/logo-1.png');
    expect(img).toHaveAttribute('alt', 'Sophie & Marc');
  });

  it('falls back to the neutral mark when no logo is set', () => {
    render(<AppMark settings={settings({ eventTitle: 'Sophie & Marc' })} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
