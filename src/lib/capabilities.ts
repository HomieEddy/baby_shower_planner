import { useQuery } from '@tanstack/react-query';
import { Translations } from '../translations';

export interface Capabilities {
  email: boolean;
  sms: boolean;
}

// Which delivery providers are configured server-side. Options that can't
// actually send are hidden from the UI (no point offering a broken channel).
export const useCapabilities = () => {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: async (): Promise<Capabilities> => {
      const res = await fetch('/api/capabilities');
      return res.json();
    },
    staleTime: 60_000,
  });
};

// Channel options (None / Email / SMS / Both) filtered by what can send.
export function availableChannels(caps: Capabilities | undefined): ('none' | 'email' | 'text' | 'both')[] {
  const channels: ('none' | 'email' | 'text' | 'both')[] = ['none'];
  if (caps?.email) channels.push('email');
  if (caps?.sms) channels.push('text');
  if (caps?.email && caps?.sms) channels.push('both');
  return channels;
}

// Localized label for a delivery channel value.
export function channelLabel(t: Translations, channel: string): string {
  switch (channel) {
    case 'email': return t.channelEmail;
    case 'text': return t.channelText;
    case 'both': return t.channelBoth;
    default: return t.channelNone;
  }
}
