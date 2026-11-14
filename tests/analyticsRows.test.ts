import { describe, expect, it } from 'vitest';
import { partId, daysFrom, daysLeftRows, itemRows, laserHeatmapRows, laserTrendRows, partRows, totalsRows, type AnalyticsData } from '../analytics/rows';
import type { InvenTreeTrackingEntry } from '../src/api/types';

const DAY = 86_400_000;
const empty: AnalyticsData = { tracking: [], lines: [], discarded: [], sessions: [], unassignedSeconds: 0, rates: null, parts: new Map(), workshops: [], stock: new Map() };

describe('analytics rows', () => {
  it('turns the Grafana time range start into days, or all time', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(daysFrom(String(now - 7 * DAY), now)).toBe(7);
    expect(daysFrom(String(now - 20 * 365 * DAY), now)).toBeUndefined();
    expect(daysFrom(null, now)).toBeUndefined();
    expect(daysFrom('nonsense', now)).toBeUndefined();
  });

  it('gives a Total row without any data', () => {
    const rows = totalsRows(empty);
    expect(rows.at(-1)).toMatchObject({ source: 'Total', revenue: 0, costs: 0, profit: 0 });
  });

  it('lists the parts that have tracking, sorted by name, with a fallback name', () => {
    const tracking = [{ part: 2 }, { part: 1 }, { part: 1 }] as unknown as InvenTreeTrackingEntry[];
    const parts = new Map([[1, { name: 'Cola', sellingPrice: 1, costPrice: 0.5, category: 'Drinks' }]]);
    expect(partRows({ ...empty, tracking, parts })).toEqual([
      { part_id: 1, name: 'Cola' }, { part_id: 2, name: 'Part #2' },
    ]);
    expect(itemRows({ ...empty, tracking, parts }, 'all')).toEqual([]);
  });

  it('sums laser minutes per bucket and kind, with a total', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const sessions = [
      { name: 'A', created: '2026-11-13T10:00:00Z', total_time: 600, paid_at: null, order_ref: null },
      { name: 'B', created: '2026-11-13T11:00:00Z', total_time: 300, paid_at: null, order_ref: null },
    ];
    const rows = laserTrendRows({ ...empty, sessions }, 3, 'day', now);
    expect(rows).toHaveLength(4);
    expect(rows.find(r => r.period === '2026-11-13')).toMatchObject({ Open: 15, Total: 15, Paid: 0 });
  });

  it('puts laser minutes on the weekday and start hour', () => {
    // 2026-11-13 is a Friday; local time, like the container (TZ=Europe/Brussels).
    const sessions = [{ name: 'A', created: new Date(2026, 10, 13, 14, 30).toISOString(), total_time: 1200, paid_at: null, order_ref: null }];
    const rows = laserHeatmapRows({ ...empty, sessions });
    expect(rows).toHaveLength(7);
    expect(rows[4]).toEqual({ day: 'Fri', '14h': 20 });
  });

  it('gives days of stock left at the pace of the period', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const sale = (part: number, quantity: number) => ({ part, date: '2026-11-10T10:00:00Z', tracking_type: 60, deltas: { quantity } });
    const tracking = [sale(1, 7), sale(2, 0)] as unknown as InvenTreeTrackingEntry[];
    const rows = daysLeftRows({ ...empty, tracking, stock: new Map([[1, { inStock: 10, minimum: 2 }]]) }, 7, now);
    // 7 out in 7 days: 1 per day, 10 left. Part 2 sold nothing: not listed.
    expect(rows).toEqual([{ name: 'Part #1', category: '', in_stock: 10, minimum: 2, per_week: 7, days_left: 10 }]);
  });

  it('finds the part for the picker by name or ID', () => {
    const parts = new Map([[13, { name: 'Ice Tea Peach', sellingPrice: 1, costPrice: 0.5, category: 'Drinks' }]]);
    expect(partId({ ...empty, parts }, 'Ice Tea Peach')).toBe(13);
    expect(partId({ ...empty, parts }, '13')).toBe(13);
    expect(partId({ ...empty, parts }, 'Nope')).toBeNaN();
  });
});
