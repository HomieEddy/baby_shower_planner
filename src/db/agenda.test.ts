import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fake: undefined as unknown as ReturnType<typeof import('./pbFake').createPbFake>,
}));

vi.mock('./client', async () => {
  const { createPbFake } = await import('./pbFake');
  h.fake = createPbFake();
  return { pb: h.fake.pb, fromRecord: (r: unknown) => r };
});

import { getTasksDueForReminder } from './agenda';
import { pbFilterMatches } from './pbFake';

const dueAt = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
};

beforeEach(() => h.fake.reset());

describe('pbFilterMatches', () => {
  it('handles =, !=, quoted/boolean literals and &&', () => {
    const rec = { status: 'todo', reminder_sent: false, due_date: '2026-06-15' };
    expect(pbFilterMatches(rec, 'status!="done" && reminder_sent=false && due_date!=""')).toBe(true);
    expect(pbFilterMatches(rec, 'status="done"')).toBe(false);
    expect(pbFilterMatches({ ...rec, due_date: '' }, 'due_date!=""')).toBe(false);
  });
});

describe('getTasksDueForReminder', () => {
  it('applies the compound filter then the reminder window', async () => {
    const date = '2026-06-15';
    const now = dueAt(date, '10:00') - 30 * 60 * 1000; // 30 min before due
    h.fake.ensure('agenda_tasks').push(
      { id: 'due', status: 'todo', reminder_sent: false, due_date: date, due_time: '10:00' },
      { id: 'done', status: 'done', reminder_sent: false, due_date: date, due_time: '10:00' },
      { id: 'sent', status: 'todo', reminder_sent: true, due_date: date, due_time: '10:00' },
      { id: 'undated', status: 'todo', reminder_sent: false, due_date: '', due_time: '' },
      { id: 'later', status: 'todo', reminder_sent: false, due_date: date, due_time: '23:00' }
    );

    const out = await getTasksDueForReminder(now, 3_600_000);
    expect(out.map((t) => t.id)).toEqual(['due']);
  });
});
