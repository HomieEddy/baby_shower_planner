import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { translations } from '../../translations';
import { DAY_OF_TITLE, dayOfMessage } from '../../lib/compose';
import { SmsSplitPreview } from './SmsSplitPreview';

const t = translations.EN;
const tf = (key: keyof typeof t, vars: Record<string, string | number> = {}) =>
  String(t[key]).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(vars[k] ?? ''));

const EVENT = {
  parentsNames: 'Anne et Paul', date: '2027-06-12', time: '14:00',
  venueName: 'Salle des fêtes', venueAddress: '12 rue des Lilas, Montréal',
};

describe('SmsSplitPreview', () => {
  it('shows each text and where the next one starts', () => {
    render(
      <SmsSplitPreview t={t} tf={tf} language="EN" alertType="DAY_OF"
        title={DAY_OF_TITLE.EN} message={dayOfMessage(EVENT, 'EN')} />
    );
    expect(screen.getByText(/each guest gets 3 texts/)).toBeTruthy();
    expect(screen.getByText('Text 2 starts here')).toBeTruthy();
    expect(screen.getByText('Text 3 starts here')).toBeTruthy();
    expect(screen.getAllByText(/Text \d of 3/)).toHaveLength(3);
  });

  it('says it fits in one text when it does', () => {
    render(<SmsSplitPreview t={t} tf={tf} language="EN" alertType="DAY_OF" title="Hi" message="See you at {{code}}" />);
    expect(screen.getByText(t.smsPreviewSingle)).toBeTruthy();
  });
});
