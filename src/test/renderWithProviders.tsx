import { Suspense, type ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The provider stack the admin surfaces need: a router (guest details/edit are
// URL-routed) and a query client (capabilities/settings). Confirm and Toast are
// mocked per test file, so they are not part of the harness.
export function renderWithProviders(ui: ReactElement, { route = '/' } = {}): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Suspense fallback={null}>{ui}</Suspense>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
