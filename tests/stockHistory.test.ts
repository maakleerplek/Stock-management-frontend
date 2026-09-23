import { describe, it, expect } from 'vitest';
import type { InvenTreeTrackingEntry } from '../src/api/types';
import {
  isSale, stockLevels, levelAt, bucketStart, bucketRange, salesPerBucket, assignColors, SERIES_COLORS,
} from '../src/lib/stockHistory';

let pk = 0;
function entry(part: number, item: number, date: string, type: number, deltas: InvenTreeTrackingEntry['deltas'], notes = ''): InvenTreeTrackingEntry {
  return { pk: ++pk, part, item, date, tracking_type: type, deltas, label: '', notes, user: 1 };
}

describe('isSale', () => {
  it('counts checkout removals', () => {
    expect(isSale(entry(1, 1, '2026-05-11T10:00', 12, { removed: 1, quantity: 7 }, 'Removed via Stock App - Checkout'))).toBe(true);
  });
  it('skips stocktakes and volunteer set-stock corrections', () => {
    expect(isSale(entry(1, 1, '2026-09-21T12:00', 10, { quantity: 15 }, 'Stocktake'))).toBe(false);
    expect(isSale(entry(1, 1, '2026-09-21T12:00', 12, { removed: 5, quantity: 3 }, 'Stock set via App - Volunteer Mode'))).toBe(false);
  });
});

describe('stockLevels', () => {
  it('sums the latest quantity of every stock item of a part', () => {
    const levels = stockLevels([
      entry(1, 10, '2026-05-01T10:00', 1, { quantity: 8 }),
      entry(1, 11, '2026-05-02T10:00', 1, { quantity: 4 }),
      entry(1, 10, '2026-05-03T10:00', 12, { removed: 1, quantity: 7 }),
      entry(1, 11, '2026-05-04T10:00', 10, { quantity: 20 }),
    ]).get(1)!;
    expect(levels.map(p => p.level)).toEqual([8, 12, 11, 27]);
  });

  it('sorts by date regardless of input order', () => {
    const levels = stockLevels([
      entry(2, 1, '2026-05-03T10:00', 12, { removed: 1, quantity: 4 }),
      entry(2, 1, '2026-05-01T10:00', 1, { quantity: 5 }),
    ]).get(2)!;
    expect(levels.map(p => p.level)).toEqual([5, 4]);
    expect(levelAt(levels, Date.parse('2026-04-30T00:00'))).toBeNull();
    expect(levelAt(levels, Date.parse('2026-05-02T00:00'))).toBe(5);
  });
});

describe('buckets', () => {
  it('starts weeks on Monday', () => {
    const sunday = Date.parse('2026-09-20T15:00');
    expect(new Date(bucketStart(sunday, 'week')).getDate()).toBe(14);
    const monday = Date.parse('2026-09-21T09:00');
    expect(new Date(bucketStart(monday, 'week')).getDate()).toBe(21);
  });

  it('counts sales per bucket and zero-fills the gaps', () => {
    const from = Date.parse('2026-09-01T00:00');
    const to = Date.parse('2026-09-30T00:00');
    const buckets = bucketRange(from, to, 'week');
    const sales = salesPerBucket([
      entry(1, 1, '2026-09-02T10:00', 12, { removed: 2, quantity: 5 }),
      entry(1, 1, '2026-09-03T10:00', 12, { removed: 1, quantity: 4 }),
      entry(1, 1, '2026-09-21T10:00', 10, { quantity: 10 }),
      entry(1, 1, '2026-09-22T10:00', 12, { removed: 3, quantity: 7 }),
    ], buckets, 'week').get(1)!;
    expect(sales).toHaveLength(buckets.length);
    expect(sales.reduce((a, b) => a + b, 0)).toBe(6);
    expect(sales[0]).toBe(3);
  });
});

describe('assignColors', () => {
  it('orders colours by units sold, independent of the parts passed in', () => {
    const log = [
      entry(1, 1, '2026-05-01T10:00', 12, { removed: 1, quantity: 1 }),
      entry(2, 2, '2026-05-01T10:00', 12, { removed: 5, quantity: 1 }),
    ];
    const colors = assignColors(log, [1, 2]);
    expect(colors.get(2)).toBe(SERIES_COLORS[0]);
    expect(colors.get(1)).toBe(SERIES_COLORS[1]);
  });
});
