// The one place a domain error outcome is defined: its HTTP status and default
// user-facing message. db modules throw DomainError(code); the server maps it
// once; the client decodes it with decodeApiError. Shared by both sides — no
// node imports here.

export const ERROR_REGISTRY = {
  // RSVP flow
  INVALID_TOKEN: { status: 404, message: 'Invitation token not found' },
  PENDING_APPROVAL: { status: 409, message: 'This registration is awaiting host approval.' },
  REGISTRATION_REJECTED: { status: 403, message: 'This registration was not approved.' },
  RSVP_ALREADY_SUBMITTED: { status: 409, message: 'This RSVP was already submitted. Edit it from the confirmation screen.' },
  RSVP_CLOSED: { status: 409, message: 'RSVPs are closed — the event has already passed.' },
  RSVP_READ_ONLY: { status: 403, message: 'This RSVP is read-only.' },
  EMAIL_REQUIRED: { status: 400, message: 'Email is required for email delivery' },
  PHONE_REQUIRED: { status: 400, message: 'Phone number is required for SMS delivery' },
  CONTACT_UPDATE_FAILED: { status: 400, message: 'Could not update contact details' },
  NAME_REQUIRED: { status: 400, message: 'Name is required' },
  INVALID_EMAIL: { status: 400, message: 'Invalid email address' },
  PARTY_TOO_LARGE: { status: 400, message: 'Party size cannot exceed 20' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Try again later.' },

  // Check-in
  GUEST_DECLINED: { status: 400, message: 'This guest declined the invitation.' },
  DECLINED: { status: 400, message: 'This guest declined the invitation.' },
  NOT_IN_PARTY: { status: 400, message: 'Name is not part of this party.' },
  ONLY_LEAD: { status: 403, message: 'Only the party lead can do that' },

  // Gifts / thank-you
  GUEST_NOT_FOUND: { status: 400, message: 'Guest not found' },
  NO_EMAIL: { status: 400, message: 'No email address on file' },
  NO_PHONE: { status: 400, message: 'No phone number on file' },
  SEND_FAILED: { status: 500, message: 'Could not send the message' },

  // Seating
  TABLE_OVER_CAPACITY: { status: 400, message: 'Table exceeds its capacity' },
  SEAT_UNKNOWN_GUEST: { status: 400, message: 'Seat references an unknown guest' },
  SEAT_GUEST_NOT_ATTENDING: { status: 400, message: 'Only attending guests can be seated' },
  SEAT_INDEX_OUT_OF_RANGE: { status: 400, message: 'Seat attendee index is out of range' },
  SEAT_DUPLICATE_ATTENDEE: { status: 400, message: 'An attendee cannot occupy two seats' },

  // Guest portal / photos
  INVALID_CODE: { status: 400, message: 'Invalid reservation code' },
  NOT_FOUND: { status: 404, message: 'Not found' },
  GUEST_CONTENT_LOCKED: { status: 403, message: 'Guest content is locked' },
  PHOTO_LIMIT_REACHED: { status: 400, message: 'Photo limit reached' },
  PHOTO_SIZE_LIMIT_REACHED: { status: 400, message: 'Photo size limit reached' },

  // Fallback
  SERVER_ERROR: { status: 500, message: 'Something went wrong' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_REGISTRY;

// A domain outcome thrown from the db (or a route), mapped to an HTTP response
// by server.ts. `extra` carries code-specific payload (e.g. the guest content
// window for GUEST_CONTENT_LOCKED).
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly extra?: Record<string, unknown>;

  constructor(code: ErrorCode, extra?: Record<string, unknown>) {
    super(ERROR_REGISTRY[code].message);
    this.name = 'DomainError';
    this.code = code;
    this.extra = extra;
  }
}

export const errorStatus = (code: ErrorCode): number => ERROR_REGISTRY[code].status;
export const errorMessage = (code: ErrorCode): string => ERROR_REGISTRY[code].message;

// Body for a DomainError response: the code, its default message, then any
// code-specific extras.
export function domainErrorBody(err: DomainError): Record<string, unknown> {
  return { error: err.code, message: err.message, ...err.extra };
}

export interface DecodedApiError {
  code: string;
  message: string;
  status?: number;
  data: Record<string, unknown>;
}

// Client-side decode of an API error payload, replacing ad-hoc
// `data.message || data.error` probing.
export function decodeApiError(payload: unknown, status?: number): DecodedApiError {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const code = typeof data.error === 'string' ? data.error : 'SERVER_ERROR';
  const message = (typeof data.message === 'string' && data.message) ? data.message : code;
  return { code, message, status, data };
}
