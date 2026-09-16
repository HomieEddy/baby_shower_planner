import type { EventSettings } from '../types';

// The event's name as a visitor sees it.
//
// One rule for every surface that shows it — the document title, the header
// brand, the footer credit, the sign-in page, the invitation arch: the
// organizer's own title when they have set one, a neutral label when they have
// not. Never the product's name: the product brands the marketing site, not a
// customer's event. Guest surfaces that still hard-code an event name (the
// landing hero, the printed QR standee) are separate, tracked work.

export function eventDisplayName(
  settings: Pick<EventSettings, 'eventTitle'> | null | undefined,
  fallback: string
): string {
  return settings?.eventTitle?.trim() || fallback;
}
