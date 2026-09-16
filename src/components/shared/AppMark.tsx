import { PartyPopper } from 'lucide-react';
import type { EventSettings } from '../../types';
import { eventDisplayName } from '../../lib/eventName';
import { useT } from './i18n';

// The event's own mark: the organizer's uploaded logo when set, else the
// neutral product mark. Each surface supplies its own rounded frame and sizing.
export const AppMark = ({
  settings,
  className = '',
}: {
  settings: EventSettings | null;
  className?: string;
}) => {
  const t = useT();
  if (settings?.logoUrl) {
    return (
      <img
        src={settings.logoUrl}
        alt={eventDisplayName(settings, t.eventFallbackTitle)}
        className={`object-contain ${className}`}
      />
    );
  }
  return <PartyPopper className={className} />;
};
