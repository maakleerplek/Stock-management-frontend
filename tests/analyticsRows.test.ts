import { describe, expect, it } from 'vitest';
import { daysFrom, itemRows, partRows, totalsRows, type AnalyticsData } from '../analytics/rows';
import type { InvenTreeTrackingEntry } from '../src/api/types';

const DAY = 86_400_000;
const empty: AnalyticsData = { tracking: [], lines: [], discarded: [], sessions: [], unassignedSeconds: 0, rates: null, parts: new Map(), workshops: [] };

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
});
