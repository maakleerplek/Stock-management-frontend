import { describe, expect, it } from 'vitest';
import { bucketRanges, seriesOf } from '../src/lib/profitTrend';

describe('profit per period', () => {
  const now = new Date('2026-10-12T18:00:00');

  it('uses days for a week, weeks up to 90 days, months for everything since the start', () => {
    expect(bucketRanges(7, now, now)).toHaveLength(7);
    expect(bucketRanges(30, now, now)).toHaveLength(5);              // 4 weeks + 2 days
    const all = bucketRanges(undefined, now, new Date('2026-05-15'));
    expect(all).toHaveLength(6);                                     // May .. October
    expect(all[0].from.getMonth()).toBe(4);
  });

  it('puts each Totals row in its colour group', () => {
    expect(seriesOf('Items sold · Drinks')).toBe('Drinks');
    expect(seriesOf('Items sold · Misc')).toBe('Other items');
    expect(seriesOf('Lab filament (3D printers)')).toBe('Lab use');
    expect(seriesOf('Laser time · paid outside checkout')).toBe('Laser');
    expect(seriesOf('3D printing')).toBe('Machines (3D print, CNC)');
  });
});
