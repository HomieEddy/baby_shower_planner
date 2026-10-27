import type { EventSettings } from '../types';

// The event's name as a visitor sees it.
//
// One rule for every surface that shows it — the document title, the header
// brand, the footer credit, the sign-in page, the invitation arch: the
// organizer's own title when they have set one, a neutral label when they have
// not. Never the product's name: the product brands the marketing site, not a
// customer's event.

export function eventDisplayName(
  settings: Pick<EventSettings, 'eventTitle'> | null | undefined,
  fallback: string
): string {
  return settings?.eventTitle?.trim() || fallback;
}

// A filename-safe stem for host downloads (CSV, photo ZIP, QR and floor-map
// PNGs): the event title slugged, or a neutral "event" when unset.
export function eventFileSlug(settings: Pick<EventSettings, 'eventTitle'> | null | undefined): string {
  const slug = (settings?.eventTitle ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'event';
}
