import { describe, expect, it } from 'vitest';
import { laserStats, lostLaserStats, laserLedger, type ServiceLine, type DiscardRow } from '../src/lib/services';

const line = (over: Partial<ServiceLine>): ServiceLine => ({
  reference: 'Lasertime', description: '', quantity: 10, price: 0.5, date: '2026-09-20', orderStatus: 30, ...over,
});
const now = new Date('2026-09-25T12:00:00');

describe('laser use from sales-order extra lines', () => {
  it('counts sessions, people and averages; same name in other case is one person', () => {
    const s = laserStats([
      line({ description: 'Ruben', quantity: 12 }),
      line({ description: 'ruben ', quantity: 6 }),
      line({ description: 'Sidd', quantity: 30 }),
      line({ quantity: 4 }),                                   // typed in at the till, no name
      line({ reference: 'CNC time', description: 'Ruben' }),   // not laser
    ], undefined, now);
    expect(s).toMatchObject({ sessions: 3, people: 2, minutes: 52, typedMinutes: 4, revenue: 26 });
    expect(s.avgPerSession).toBe(16);
    expect(s.perPerson.map(p => [p.name, p.sessions, p.minutes])).toEqual([['Sidd', 1, 30], ['Ruben', 2, 18]]);
  });

  it('skips orders that are not paid and lines outside the period', () => {
    const s = laserStats([
      line({ description: 'A', orderStatus: 40 }),             // cancelled
      line({ description: 'B', orderStatus: 10 }),             // pending
      line({ description: 'C', date: '2026-08-01' }),          // older than 30 days
      line({ description: 'D' }),
    ], 30, now);
    expect(s.perPerson.map(p => p.name)).toEqual(['D']);
  });

  it('reads the name from references booked before the description held it', () => {
    const s = laserStats([line({ reference: 'Lasertime – Ruben (min)' })], undefined, now);
    expect(s.perPerson[0].name).toBe('Ruben');
  });
});

describe('lostLaserStats', () => {
  const today = new Date("2026-09-28T12:00:00");
  const rows: DiscardRow[] = [
    { seconds: 900, source: 'unassigned', session_name: null, reason: 'test cut', discarded_at: '2026-09-27T10:00:00' },
    { seconds: 120, source: 'session', session_name: 'Ruben', reason: null, discarded_at: '2026-09-28T09:00:00' },
    { seconds: 600, source: 'unassigned', session_name: null, reason: null, discarded_at: '2026-08-01T09:00:00' },
  ];

  it('sums the minutes not paid via a session and their value in the period, newest first', () => {
    const s = lostLaserStats(rows, 0.5, 7, today);
    expect(s.count).toBe(2);
    expect(s.minutes).toBe(17);
    expect(s.value).toBe(8.5);
    expect(s.rows[0].session_name).toBe('Ruben');
  });

  it('counts everything without a period', () => {
    expect(lostLaserStats(rows, 0.5, undefined, today).minutes).toBe(27);
  });
});

describe('laserLedger', () => {
  const today = new Date('2026-10-09T18:00:00');
  const session = (over: Partial<{ name: string; created: string; total_time: number; paid_at: string | null; order_ref: string | null }>) => ({
    name: 'Wolf', created: '2026-10-09T10:00:00', total_time: 600, paid_at: null, order_ref: null, ...over,
  });
  const paidLine: ServiceLine = { reference: 'Lasertime', description: 'Ruben', quantity: 5, price: 0.5, date: '2026-10-09', orderStatus: 30, order: 'SO-0010' };

  it('puts assigned time (open and deleted sessions) in unpaid, per person', () => {
    const l = laserLedger(
      [session({}), session({ name: 'wolf ', total_time: 300 })],
      [{ seconds: 1200, source: 'session', session_name: 'HTL', reason: null, discarded_at: '2026-10-09T16:12:00' }],
      [], 0, 0.5, 30, today);
    expect(l.unpaid).toEqual({ minutes: 35, value: 17.5, count: 3 });
    expect(l.unpaidPerPerson.get('wolf')?.minutes).toBe(15);
    expect(l.unverified.count).toBe(0);
  });

  it('does not count a paid session on a counted order again, but flags one whose order was cancelled', () => {
    const l = laserLedger(
      [session({ paid_at: '2026-10-09T11:00:00', order_ref: 'SO-0010' }), session({ paid_at: '2026-10-09T11:00:00', order_ref: 'SO-0002' })],
      [], [paidLine, { ...paidLine, order: 'SO-0002', orderStatus: 40 }], 0, 0.5, 30, today);
    expect(l.unpaid.count).toBe(0);
    expect(l.unverified).toEqual({ minutes: 10, value: 5, count: 1 });
  });

  it('counts reset time and the counter now as unverified, skipping time fixed by hand on a paid order', () => {
    const l = laserLedger(
      [session({ paid_at: '2026-10-01T11:00:00', order_ref: 'SO-0002' })],
      [
        { seconds: 900, source: 'unassigned', session_name: null, reason: 'booked by hand as SO-0002', discarded_at: '2026-10-01T12:00:00' },
        { seconds: 600, source: 'unassigned', session_name: null, reason: null, discarded_at: '2026-10-08T12:00:00' },
      ],
      [{ ...paidLine, order: 'SO-0002' }], 120, 0.5, 30, today);
    expect(l.unverified).toEqual({ minutes: 12, value: 6, count: 2 });
  });

  it('leaves time outside the period out', () => {
    const l = laserLedger([session({ created: '2026-08-01T10:00:00' })], [], [], 0, 0.5, 7, today);
    expect(l.unpaid.count).toBe(0);
  });
});
