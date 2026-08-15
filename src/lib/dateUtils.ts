// Date helpers backed by date-fns (EN/FR locales).
import { format, parse } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';

const LOCALES = { EN: enUS, FR: fr } as const;
type Lang = 'EN' | 'FR';

function langLocale(lang: Lang) {
  return LOCALES[lang];
}

export function parseToYmd(dateStr: string): string {
  if (!dateStr) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return format(d, 'yyyy-MM-dd');
  }
  return '';
}

export function formatDateLong(ymdStr: string, lang: Lang = 'EN'): string {
  if (!ymdStr) return '';
  // If input is YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymdStr)) {
    const parsed = parse(ymdStr, 'yyyy-MM-dd', new Date());
    if (!isNaN(parsed.getTime())) {
      // FR convention: "samedi 12 septembre 2026" (no comma); EN: "Saturday, September 12, 2026"
      const pattern = lang === 'FR' ? 'EEEE d MMMM yyyy' : 'EEEE, MMMM d, yyyy';
      const out = format(parsed, pattern, { locale: langLocale(lang) });
      // French day/month names are lowercase in date-fns — capitalize the first letter
      return out.charAt(0).toUpperCase() + out.slice(1);
    }
  }
  return ymdStr;
}

export function parseTimeRange(timeStr: string): { startTime: string; endTime: string } {
  if (!timeStr) return { startTime: '14:00', endTime: '18:00' };

  const parts = timeStr.split(/[-–—]/);
  if (parts.length >= 2) {
    const start24 = parseSingleTimeTo24h(parts[0].trim());
    const end24 = parseSingleTimeTo24h(parts[1].trim());
    return {
      startTime: start24 || '14:00',
      endTime: end24 || '18:00',
    };
  }
  return { startTime: '14:00', endTime: '18:00' };
}

function parseSingleTimeTo24h(str: string): string | null {
  if (!str) return null;
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3] ? match[3].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return null;
}

export function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export function formatTimeRangeString(startTime24: string, endTime24: string): string {
  const startFmt = formatTime12h(startTime24);
  const endFmt = formatTime12h(endTime24);
  if (startFmt && endFmt) {
    return `${startFmt} – ${endFmt}`;
  }
  return startFmt || endFmt || '';
}

// Human-readable window for the guest content lock (ISO timestamps from the server)
export function formatGuestWindow(opensAt?: string, closesAt?: string, lang: Lang = 'EN'): string {
  const locale = langLocale(lang);
  const fmt = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const out = format(d, 'EEE, MMM d, h:mm a', { locale });
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  const open = fmt(opensAt);
  const close = fmt(closesAt);
  if (open && close) {
    return lang === 'FR'
      ? `Ouvert de ${open} à ${close}`
      : `Open from ${open} to ${close}`;
  }
  if (open) {
    return lang === 'FR' ? `Ouvre le ${open}` : `Opens on ${open}`;
  }
  if (close) {
    return lang === 'FR' ? `Ferme le ${close}` : `Closes on ${close}`;
  }
  return '';
}

// ─── Agenda task due / reminder window ────────────────────────────

export const REMINDER_ADVANCE_MS: Record<string, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '1d': 86_400_000,
  '2d': 172_800_000,
  '1w': 604_800_000,
};

// Task due timestamp in the server's local timezone. Missing time = 09:00
// (start of the working day) so reminders don't fire at midnight.
export function taskDueAt(dueDate: string, dueTime?: string): number {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [hh, mm] = (dueTime || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

// Reminder fires once, inside [dueAt - advance, dueAt).
export function isInReminderWindow(dueAt: number, advanceMs: number, now: number): boolean {
  return now >= dueAt - advanceMs && now < dueAt;
}

// "Saturday, September 12, 2026 at 9:00 AM" (EN) / "Samedi 12 septembre 2026 à 9h00" (FR)
export function formatTaskDue(dueDate: string, dueTime?: string, lang: Lang = 'EN'): string {
  const date = formatDateLong(dueDate, lang);
  if (!date) return '';
  const time = dueTime ? formatTime12h(dueTime) : '';
  return lang === 'FR'
    ? `${date}${time ? ` à ${time}` : ''}`
    : `${date}${time ? ` at ${time}` : ''}`;
}
