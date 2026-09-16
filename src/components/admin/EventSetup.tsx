import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Field, TextInput } from '../shared/ui';
import type { EventSettings, Language } from '../../types';
import type { Translations } from '../../translations';
import { toStoredEventDateTime } from '../../lib/dateUtils';
import { EventSetupSchema } from '../../lib/validation';

interface EventSetupProps {
  language: Language;
  t: Translations;
  onSave: (data: Partial<EventSettings>) => Promise<EventSettings>;
}

// A half-filled wizard survives leaving the page: the draft lives in this
// browser only. The first settings row is still written once, on submit.
const DRAFT_KEY = 'eventSetupDraft';

interface SetupDraft {
  eventTitle: string;
  parentsNames: string;
  date: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
}

const EMPTY_DRAFT: SetupDraft = {
  eventTitle: '',
  parentsNames: '',
  date: '',
  startTime: '14:00',
  endTime: '18:00',
  venueName: '',
  venueAddress: '',
};

function readDraft(): SetupDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Partial<SetupDraft>;
    return { ...EMPTY_DRAFT, ...stored };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

// First-run setup: the minimum an event needs before the dashboard is usable.
// It writes the event's first settings row through the same save path the
// settings tab uses; `onSave` caches the result, so the dashboard renders
// immediately afterwards without a reload.
export const EventSetup = ({ language, t, onSave }: EventSetupProps) => {
  const [draft, setDraft] = useState<SetupDraft>(readDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode: the draft just won't survive the page */
    }
  }, [draft]);

  const field = (key: keyof SetupDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { date, time } = toStoredEventDateTime(draft.date, draft.startTime, draft.endTime, language);
    const parsed = EventSetupSchema.safeParse({
      eventTitle: draft.eventTitle.trim(),
      parentsNames: draft.parentsNames.trim(),
      date,
      time,
      venueName: draft.venueName.trim(),
      venueAddress: draft.venueAddress.trim(),
    });
    if (!parsed.success) {
      setError(t.setupRequiredError);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave(parsed.data);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* private mode */
      }
    } catch {
      setError(t.settingsSaveFailedToast);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card-paper p-6 sm:p-10 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="font-sans text-2xl sm:text-3xl font-bold text-[#8B735B]">{t.setupTitle}</h1>
        <p className="text-sm text-[#5D5449] mt-1">{t.setupDesc}</p>
      </div>

      <Field label={t.eventTitleLabel}>
        <TextInput required value={draft.eventTitle} onChange={field('eventTitle')} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label={t.parentsNamesLabel2}>
          <TextInput required value={draft.parentsNames} onChange={field('parentsNames')} />
        </Field>
        <Field label={t.eventDateLabel2}>
          <TextInput type="date" required value={draft.date} onChange={field('date')} />
        </Field>
        <Field label={t.startTimeLabel}>
          <TextInput type="time" required value={draft.startTime} onChange={field('startTime')} />
        </Field>
        <Field label={t.endTimeLabel}>
          <TextInput type="time" value={draft.endTime} onChange={field('endTime')} />
        </Field>
        <Field label={t.venueNameLabel2}>
          <TextInput required value={draft.venueName} onChange={field('venueName')} />
        </Field>
        <Field label={t.fullVenueAddressLabel}>
          <TextInput required value={draft.venueAddress} onChange={field('venueAddress')} />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-bold text-rose-700">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={saving} className="btn-accent w-full sm:w-auto px-8 py-3 text-sm">
        {saving ? t.savingSettingsBtn : t.setupSubmitBtn}
      </button>
    </form>
  );
};
