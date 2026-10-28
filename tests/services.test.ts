import { describe, expect, it } from 'vitest';
import { mergeActivity, laserStats, lostLaserStats, laserLedger, laserSessionList, groupSessions, sessionUse, cncStats, type ServiceLine, type DiscardRow, type LaserSessionRow } from '../src/lib/services';

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

  it('puts open sessions in unpaid and deleted ones under their kind', () => {
    const del = (session_name: string, kind: DiscardRow['kind'], seconds = 1200): DiscardRow =>
      ({ seconds, source: 'session', session_name, reason: null, kind, discarded_at: '2026-10-09T16:12:00' });
    const l = laserLedger(
      [session({}), session({ name: 'wolf ', total_time: 300 })],
      [del('HTL', null), del('HTL', 'workshop', 600), del('Wolf', 'paid', 300), del('Ivo', 'volunteer', 60)],
      [], 0, 0.5, 30, today);
    expect(l.unpaid).toEqual({ minutes: 15, value: 7.5, count: 2 });
    expect(l.deleted.none.minutes).toBe(20);
    expect(l.deleted.workshop.minutes).toBe(10);
    expect(l.deleted.paid.value).toBe(2.5);
    expect(l.deleted.volunteer.minutes).toBe(1);
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

describe('laserSessionList', () => {
  const now = new Date('2026-10-12T18:00:00');
  const row = (over: Partial<LaserSessionRow>): LaserSessionRow =>
    ({ name: 'Art Piece', created: '2026-10-10T10:00:00', total_time: 420, paid_at: null, order_ref: null, ...over });
  const del = (session_name: string, seconds: number, kind: DiscardRow['kind']): DiscardRow =>
    ({ seconds, source: 'session', session_name, reason: null, kind, discarded_at: '2026-10-09T16:00:00' });

  it('lists open, paid and deleted sessions with their status, newest first, without counter resets', () => {
    const list = laserSessionList(
      [row({}), row({ name: 'Nerf Gun', total_time: 180, paid_at: '2026-10-11T12:00:00', order_ref: 'SO-0040' })],
      [del('Workshop HTL', 6600, 'workshop'), del('Robbert', 1980, 'paid'),
       { seconds: 900, source: 'unassigned', session_name: null, reason: null, discarded_at: '2026-10-09T17:00:00' }],
      [{ reference: 'Lasertime', description: 'Nerf Gun', quantity: 3, price: 0.5, date: '2026-10-11', orderStatus: 30, order: 'SO-0040' }],
      30, now);
    expect(list.map(s => [s.name, s.status])).toEqual([
      ['Nerf Gun', 'paid'], ['Art Piece', 'open'], ['Workshop HTL', 'workshop'], ['Robbert', 'paid'],
    ]);
    expect(sessionUse(list)).toEqual({ count: 3, avgMinutes: (3 + 7 + 33) / 3 });   // workshop left out
  });
});

describe('cncStats', () => {
  it('counts paid CNC jobs in the period, newest first', () => {
    const s = cncStats([
      line({ reference: 'CNC time', quantity: 30, date: '2026-09-21', order: 'SO-1' }),
      line({ reference: 'CNC time', quantity: 4, price: 1.25, date: '2026-09-24', order: 'SO-2' }),   // minimum folded in
      line({ reference: 'CNC time', orderStatus: 40 }),                                               // cancelled
      line({ reference: 'CNC time', date: '2026-08-01' }),                                            // before the period
      line({ quantity: 50 }),                                                                         // laser
    ], 30, now);
    expect(s.jobs.map(j => j.order)).toEqual(['SO-2', 'SO-1']);
    expect(s).toMatchObject({ minutes: 34, revenue: 20, avgMinutes: 17 });
  });
});

describe('volunteer machine use (€0 lines from the kiosk)', () => {
  it('is not counted as paid, but shows as volunteer use', async () => {
    const { laserStats, cncStats, volunteerPrints, printsByMaterial, laserSessionList } = await import('../src/lib/services');
    const lines = [
      line({ quantity: 10 }), line({ quantity: 6, price: 0, order: 'SO-9' }),                         // laser paid / volunteer
      line({ reference: 'CNC time', quantity: 30 }), line({ reference: 'CNC time', quantity: 20, price: 0 }),
      line({ reference: '3D printing', description: 'PLA', quantity: 50, price: 0.1 }),
      line({ reference: '3D printing', description: 'PLA', quantity: 40, price: 0 }),
    ];
    expect(laserStats(lines, undefined, now)).toMatchObject({ minutes: 10, volunteerMinutes: 6 });
    expect(cncStats(lines, undefined, now)).toMatchObject({ minutes: 30, revenue: 15, volunteerMinutes: 20 });
    expect(printsByMaterial(lines, undefined, now).get('PLA')?.grams).toBe(50);
    expect(volunteerPrints(lines, undefined, now)).toEqual({ grams: 40, prints: 1 });
    const s = laserSessionList([{ name: 'Vol', created: '2026-09-20', total_time: 360, paid_at: '2026-09-20', order_ref: 'SO-9' }], [], lines, undefined, now);
    expect(s[0].status).toBe('volunteer');
  });
});

describe('mergeActivity', () => {
  it('puts a service above the same day\'s movements and drops cancelled orders', () => {
    const moves = [{ date: '2026-10-15 16:57' }, { date: '2026-10-14 10:00' }];
    const merged = mergeActivity(moves, [line({ date: '2026-10-15' }), line({ date: '2026-10-15', orderStatus: 40 }), line({ date: '2026-10-13' })], 3);
    expect(merged.map(a => a.kind)).toEqual(['service', 'stock', 'stock']);
  });
});

describe('groupSessions', () => {
  it('merges the cuts of one visit and keeps different days, statuses and orders apart', () => {
    const row = (date: string, name: string, status: 'open' | 'paid', reason: string | null = null) => ({ date, name, minutes: 1, status, reason });
    const g = groupSessions([
      row('2026-10-27T16:12', 'Untitled', 'open'), row('2026-10-27T16:02', 'Untitled', 'open'), row('2026-10-27T15:00', 'Box', 'open'),
      row('2026-10-26T19:38', 'Coely', 'paid', 'SO-29'), row('2026-10-26T19:38', 'Untitled', 'paid', 'SO-29'),
      row('2026-10-26T16:19', 'Untitled', 'open'),
    ]);
    expect(g.map(s => [s.name, s.cuts, s.minutes, s.status])).toEqual([
      ['Untitled, Box', 3, 3, 'open'], ['Coely, Untitled', 2, 2, 'paid'], ['Untitled', 1, 1, 'open'],
    ]);
  });

  it('makes a project one row with all its cuts, across days and other people in between', () => {
    const row = (date: string, name: string, project: string | null) => ({ date, name, minutes: 10, status: 'paid' as const, reason: 'SO-30', project });
    const g = groupSessions([
      row('2026-10-28T12:00', 'lamp_b', 'Jan – lamp'), row('2026-10-28T11:30', 'Cut 11:30', null),
      row('2026-10-28T11:00', 'lamp_a', 'Jan – lamp'), row('2026-10-27T18:00', 'base', 'Jan – lamp'),
    ]);
    expect(g.map(s => [s.name, s.cuts, s.minutes])).toEqual([['Jan – lamp', 3, 30], ['Cut 11:30', 1, 10]]);
  });
});
