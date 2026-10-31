/**
 * Profit per period, split by where it was made: the same totals as the
 * Totals table (buildTotals), once per day, week or month of the range.
 */
import type { InvenTreeTrackingEntry } from '../api/types';
import { itemAnalytics, type PartPrice } from './itemAnalytics';
import { serviceRevenue, laserLedger, printsByMaterial, type ServiceLine, type DiscardRow, type LaserSessionRow } from './services';
import { buildTotals } from './totals';

/** Fixed order: the chart colours follow it (categorical slots 1-8). */
export const PROFIT_SERIES = [
  'Drinks', 'Wood', 'Filament', 'Other items', 'Laser', 'Machines (3D print, CNC)', 'Volunteer items', 'Lab use',
] as const;
export type ProfitSeries = typeof PROFIT_SERIES[number];

/** Which series a Totals row belongs to. */
export function seriesOf(label: string): ProfitSeries {
  const sold = /^Items sold · (.+)$/.exec(label)?.[1];
  if (sold) return (['Drinks', 'Wood', 'Filament'] as const).find(c => c.toLowerCase() === sold.toLowerCase()) ?? 'Other items';
  if (label === 'Volunteer items') return 'Volunteer items';
  if (/^Lab /.test(label)) return 'Lab use';
  if (/^Laser time/.test(label)) return 'Laser';
  return 'Machines (3D print, CNC)';
}

export interface ProfitBucket { label: string; from: Date; to: Date; bySeries: Record<ProfitSeries, number>; net: number }

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Day bars for a week, week bars up to 90 days, month bars for everything since `first`. */
export function bucketRanges(days: number | undefined, now: Date, first: Date): { label: string; from: Date; to: Date }[] {
  const out: { label: string; from: Date; to: Date }[] = [];
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('nl-BE', o);
  if (days && days <= 7) {
    const end = new Date(startOfDay(now).getTime() + DAY);
    for (let i = days; i > 0; i--) {
      const from = new Date(end.getTime() - i * DAY);
      out.push({ label: fmt(from, { weekday: 'short', day: 'numeric' }), from, to: new Date(from.getTime() + DAY) });
    }
  } else if (days) {
    // Weeks ending today, the oldest one cut at the start of the range.
    const end = new Date(startOfDay(now).getTime() + DAY), start = new Date(end.getTime() - days * DAY);
    for (let to = end; to > start; to = new Date(to.getTime() - 7 * DAY)) {
      const from = new Date(Math.max(start.getTime(), to.getTime() - 7 * DAY));
      out.unshift({ label: fmt(from, { day: 'numeric', month: 'short' }), from, to });
    }
  } else {
    for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= now; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      out.push({ label: fmt(m, { month: 'short', year: '2-digit' }), from: m, to: new Date(m.getFullYear(), m.getMonth() + 1, 1) });
    }
  }
  return out;
}

export function profitTrend(input: {
  entries: InvenTreeTrackingEntry[];
  parts: Map<number, PartPrice>;
  lines: ServiceLine[];
  sessions: LaserSessionRow[];
  discarded: DiscardRow[];
  unassignedSeconds: number;
  pricePerLaserMinute: number;
  pricePerGram: Record<string, number>;
  days?: number;
  now?: Date;
}): ProfitBucket[] {
  const now = input.now ?? new Date();
  const dates = [...input.entries.map(e => e.date), ...input.lines.map(l => l.date)].filter(Boolean).sort();
  const first = dates.length ? new Date(dates[0]) : now;
  return bucketRanges(input.days, now, first).map(({ label, from, to }) => {
    const before = (iso: string | null | undefined) => !!iso && new Date(iso) < to;
    const span = (to.getTime() - from.getTime()) / DAY;
    // Everything up to the end of the bucket; the functions below cut the start (span days back from `to`).
    const lines = input.lines.filter(l => before(l.date));
    const totals = buildTotals(
      itemAnalytics(input.entries.filter(e => before(e.date)), input.parts, 'all', span, to),
      serviceRevenue(lines, span, to),
      laserLedger(
        input.sessions.filter(s => before(s.paid_at ?? s.created)),
        input.discarded.filter(r => before(r.discarded_at)),
        lines, to > now ? input.unassignedSeconds : 0, input.pricePerLaserMinute, span, to,
      ),
      printsByMaterial(lines, span, to),
      input.pricePerGram,
    );
    const bySeries = Object.fromEntries(PROFIT_SERIES.map(s => [s, 0])) as Record<ProfitSeries, number>;
    for (const r of totals.rows) bySeries[seriesOf(r.label)] += r.profit;
    return { label, from, to, bySeries, net: totals.total.profit };
  });
}
