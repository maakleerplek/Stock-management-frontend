import type { InvenTreeTrackingEntry } from '../api/types';

/**
 * Turns InvenTree's stock tracking log into per-part time series.
 *
 * Every tracking entry carries `deltas.quantity`: the quantity of that one stock
 * item *after* the change. A part can have several stock items, so its stock
 * level at any moment is the sum of the latest quantity of each of its items.
 */

export type Bucket = 'day' | 'week' | 'month';

export interface PartInfo {
  name: string;
  category: string;
}

export interface LevelPoint {
  t: number;      // ms since epoch
  level: number;
}

/** InvenTree StockHistoryCode values this module cares about. */
export const TRACKING = {
  STOCK_COUNT: 10,
  STOCK_ADD: 11,
  STOCK_REMOVE: 12,
  SPLIT_FROM_PARENT: 40,
  SPLIT_CHILD_ITEM: 42,
  SHIPPED_AGAINST_SALES_ORDER: 60,
  SENT_TO_CUSTOMER: 100,
} as const;

/** Codes after which a stock item is no longer ours. */
const LEFT_STOCK: number[] = [TRACKING.SHIPPED_AGAINST_SALES_ORDER, TRACKING.SENT_TO_CUSTOMER];

/**
 * Sales are sales-order shipments. Before the app used sales orders, a sale
 * was a manual removal at checkout; those still count, except volunteer
 * corrections (notes "... Volunteer Mode") and "set stock" adjustments.
 */
export function isSale(e: InvenTreeTrackingEntry): boolean {
  if (e.tracking_type === TRACKING.SHIPPED_AGAINST_SALES_ORDER) return (e.deltas?.quantity ?? 0) > 0;
  return (
    e.tracking_type === TRACKING.STOCK_REMOVE &&
    (e.deltas?.removed ?? 0) > 0 &&
    !/^stock set|volunteer mode/i.test(e.notes ?? '')
  );
}

/** Units sold by a sale entry, 0 for anything else. */
export function unitsSold(e: InvenTreeTrackingEntry): number {
  if (!isSale(e)) return 0;
  return e.tracking_type === TRACKING.SHIPPED_AGAINST_SALES_ORDER ? e.deltas.quantity ?? 0 : e.deltas.removed ?? 0;
}

/** Stock level of each part after every change, oldest first. */
export function stockLevels(entries: InvenTreeTrackingEntry[]): Map<number, LevelPoint[]> {
  const sorted = entries
    .filter(e => typeof e.deltas?.quantity === 'number')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  const perItem = new Map<number, Map<number, number>>();
  const out = new Map<number, LevelPoint[]>();
  for (const e of sorted) {
    const items = perItem.get(e.part) ?? new Map<number, number>();
    // A shipped item has left stock; its quantity is what was sold, not what is left.
    items.set(e.item, LEFT_STOCK.includes(e.tracking_type) ? 0 : e.deltas.quantity as number);
    perItem.set(e.part, items);

    let level = 0;
    items.forEach(q => { level += q; });
    const t = Date.parse(e.date);
    const points = out.get(e.part) ?? [];
    // A shipment logs split + ship at the same moment: keep only the result.
    if (points.length && points[points.length - 1].t === t) points[points.length - 1].level = Math.round(level);
    else points.push({ t, level: Math.round(level) });
    out.set(e.part, points);
  }
  return out;
}

/** Level at time t, or null if the part had no stock record yet. */
export function levelAt(points: LevelPoint[], t: number): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.t > t) break;
    v = p.level;
  }
  return v;
}

/** Start of the bucket containing t, in local time. Weeks start on Monday. */
export function bucketStart(t: number, bucket: Bucket): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  if (bucket === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (bucket === 'month') d.setDate(1);
  return d.getTime();
}

export function nextBucket(start: number, bucket: Bucket): number {
  const d = new Date(start);
  if (bucket === 'day') d.setDate(d.getDate() + 1);
  if (bucket === 'week') d.setDate(d.getDate() + 7);
  if (bucket === 'month') d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** All bucket starts from the one containing `from` up to the one containing `to`. */
export function bucketRange(from: number, to: number, bucket: Bucket): number[] {
  const out: number[] = [];
  for (let b = bucketStart(from, bucket); b <= to; b = nextBucket(b, bucket)) out.push(b);
  return out;
}

/** Units sold per part per bucket, zero-filled. */
export function salesPerBucket(
  entries: InvenTreeTrackingEntry[],
  buckets: number[],
  bucket: Bucket,
): Map<number, number[]> {
  const index = new Map(buckets.map((b, i) => [b, i]));
  const out = new Map<number, number[]>();
  for (const e of entries) {
    const sold = unitsSold(e);
    if (!sold) continue;
    const i = index.get(bucketStart(Date.parse(e.date), bucket));
    if (i === undefined) continue;
    const row = out.get(e.part) ?? new Array(buckets.length).fill(0);
    row[i] += sold;
    out.set(e.part, row);
  }
  return out;
}

/**
 * Fixed colour per part: ordered by total units sold over the whole history, so
 * filtering never repaints the parts that remain. Past the palette, parts share
 * the neutral colour.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const OTHER_COLOR = '#9a9a93';

export function assignColors(entries: InvenTreeTrackingEntry[], partIds: number[]): Map<number, string> {
  const sold = new Map<number, number>();
  for (const e of entries) sold.set(e.part, (sold.get(e.part) ?? 0) + unitsSold(e));
  const order = [...partIds].sort((a, b) => (sold.get(b) ?? 0) - (sold.get(a) ?? 0) || a - b);
  return new Map(order.map((p, i) => [p, SERIES_COLORS[i] ?? OTHER_COLOR]));
}
