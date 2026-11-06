// Per-guest pick list for a broadcast. Rows without a contact for the chosen
// channel are shown but cannot be picked, so the host sees why they are out.

import React, { useMemo, useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import type { Guest } from '../../types';
import type { Translations } from '../../translations';
import { TextInput } from '../shared/ui';
import { hasContactFor, type AlertChannel } from '../../lib/alertRecipients';

interface AlertGuestPickerProps {
  guests: Guest[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  channel: AlertChannel;
  t: Translations;
  tf: (key: keyof Translations, vars?: Record<string, string | number>) => string;
}

export const AlertGuestPicker: React.FC<AlertGuestPickerProps> = ({ guests, selectedIds, onChange, channel, t, tf }) => {
  const [query, setQuery] = useState('');
  const picked = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...guests].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((g) => g.name.toLowerCase().includes(q) || (g.email || '').toLowerCase().includes(q));
  }, [guests, query]);

  const toggle = (id: string) => {
    onChange(picked.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  // Adds the reachable guests currently shown; keeps anything already picked.
  const selectShown = () => {
    const next = new Set(selectedIds);
    visible.forEach((g) => { if (hasContactFor(g, channel)) next.add(g.id); });
    onChange([...next]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.guestSearchPh}
          aria-label={t.guestSearchPh}
          className="flex-1 min-w-[180px]"
        />
        <button type="button" onClick={selectShown}
          className="btn-outline-accent px-3 py-2 text-xs cursor-pointer">{t.selectAllVisibleBtn}</button>
        <button type="button" onClick={() => onChange([])}
          className="btn-outline-accent px-3 py-2 text-xs cursor-pointer">{t.clearSelectionBtn}</button>
        <span className="text-xs font-semibold text-[#5D5449]">{tf('selectedCountLabel', { count: selectedIds.length })}</span>
      </div>

      <ul className="max-h-72 overflow-y-auto rounded-xl border border-[#CBAE94]/60 bg-white divide-y divide-[#CBAE94]/30">
        {visible.length === 0 && (
          <li className="p-4 text-sm text-center text-[#5D5449]">{t.alertNoRecipients}</li>
        )}
        {visible.map((g) => {
          const reachable = hasContactFor(g, channel);
          return (
            <li key={g.id}>
              <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${reachable ? 'cursor-pointer hover:bg-[#EFE6DC]/40' : 'opacity-50 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#4A3F35] shrink-0"
                  checked={picked.has(g.id)}
                  disabled={!reachable}
                  onChange={() => toggle(g.id)}
                />
                <span className="flex-1 min-w-0 truncate font-medium text-[#4A3F35]">{g.name}</span>
                <span className="flex items-center gap-2 text-[#8B735B] shrink-0">
                  {g.email && <Mail className="w-3.5 h-3.5" aria-label="email" />}
                  {g.phone && <MessageSquare className="w-3.5 h-3.5" aria-label="SMS" />}
                  {!reachable && <span className="text-xs text-[#5D5449]">{t.noContactForChannel}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
