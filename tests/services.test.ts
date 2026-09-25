import { describe, expect, it } from 'vitest';
import { laserStats, type ServiceLine } from '../src/lib/services';

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
    expect(s.avgPerPerson).toBe(24);
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
