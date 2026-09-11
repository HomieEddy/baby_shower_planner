import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LockedNotice } from './LockedNotice';

describe('LockedNotice', () => {
  it('renders the title and message', () => {
    render(<LockedNotice title="Locked" message="Opens soon" language="EN" />);
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('Opens soon')).toBeInTheDocument();
  });

  it('renders the formatted window when lockInfo is present', () => {
    render(
      <LockedNotice
        title="Locked"
        message="Msg"
        lockInfo={{ opensAt: '2026-01-01T15:00:00Z', closesAt: '2026-01-02T20:00:00Z' }}
        language="EN"
      />
    );
    expect(screen.getByText(/open from/i)).toBeInTheDocument();
  });

  it('omits the window when lockInfo is absent', () => {
    render(<LockedNotice title="Locked" message="Msg" language="EN" />);
    expect(screen.queryByText(/open from/i)).not.toBeInTheDocument();
  });
});
