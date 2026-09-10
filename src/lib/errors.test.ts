import { describe, it, expect } from 'vitest';
import {
  DomainError,
  domainErrorBody,
  decodeApiError,
  ERROR_REGISTRY,
  errorMessage,
  errorStatus,
} from './errors';

describe('ERROR_REGISTRY', () => {
  it('maps codes to their HTTP status', () => {
    expect(errorStatus('INVALID_TOKEN')).toBe(404);
    expect(errorStatus('RSVP_CLOSED')).toBe(409);
    expect(errorStatus('GUEST_CONTENT_LOCKED')).toBe(403);
    expect(errorStatus('TABLE_OVER_CAPACITY')).toBe(400);
    expect(errorStatus('ONLY_LEAD')).toBe(403);
    expect(errorStatus('SERVER_ERROR')).toBe(500);
  });

  it('gives every code a non-empty message', () => {
    for (const code of Object.keys(ERROR_REGISTRY) as Array<keyof typeof ERROR_REGISTRY>) {
      expect(errorMessage(code).length).toBeGreaterThan(0);
    }
  });
});

describe('DomainError', () => {
  it('carries the code and the registry message', () => {
    const err = new DomainError('RSVP_CLOSED');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('RSVP_CLOSED');
    expect(err.message).toBe(errorMessage('RSVP_CLOSED'));
  });

  it('keeps code-specific extras in the response body', () => {
    const err = new DomainError('GUEST_CONTENT_LOCKED', { opensAt: '2026-01-01', closesAt: '2026-01-02' });
    expect(domainErrorBody(err)).toEqual({
      error: 'GUEST_CONTENT_LOCKED',
      message: errorMessage('GUEST_CONTENT_LOCKED'),
      opensAt: '2026-01-01',
      closesAt: '2026-01-02',
    });
  });
});

describe('decodeApiError', () => {
  it('reads code and message', () => {
    const decoded = decodeApiError({ error: 'RSVP_CLOSED', message: 'Closed' }, 409);
    expect(decoded.code).toBe('RSVP_CLOSED');
    expect(decoded.message).toBe('Closed');
    expect(decoded.status).toBe(409);
  });

  it('falls back to the code when there is no message', () => {
    expect(decodeApiError({ error: 'NOT_FOUND' }).message).toBe('NOT_FOUND');
  });

  it('falls back to SERVER_ERROR for an empty payload', () => {
    const decoded = decodeApiError(undefined);
    expect(decoded.code).toBe('SERVER_ERROR');
    expect(decoded.message).toBe('SERVER_ERROR');
  });
});
