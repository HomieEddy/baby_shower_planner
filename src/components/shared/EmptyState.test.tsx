import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the translated guestbook preset title', () => {
    render(<EmptyState type="guestbook" />);
    // EN default language
    expect(screen.getByText('No Warm Wishes Left Yet')).toBeInTheDocument();
  });

  it('renders a custom title over the preset', () => {
    render(<EmptyState type="guestbook" title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.queryByText('No Warm Wishes Left Yet')).not.toBeInTheDocument();
  });

  it('renders an action label button', () => {
    render(<EmptyState type="generic" actionLabel="Do It" onAction={() => {}} />);
    expect(screen.getByText('Do It')).toBeInTheDocument();
  });
});
