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

/** InvenTree tracking codes: 12 = stock manually removed. */
const TRACKING_REMOVED = 12;

/**
 * A sale is a manual removal that is not a correction. Volunteer "set stock"
 * corrections are also logged as removals, with notes starting "Stock set";
 * stocktakes ("Stock counted") use a different tracking code entirely.
 */
export function isSale(e: InvenTreeTrackingEntry): boolean {
  return (
    e.tracking_type === TRACKING_REMOVED &&
    (e.deltas?.removed ?? 0) > 0 &&
    !/^stock set/i.test(e.notes ?? '')
  );
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
    items.set(e.item, e.deltas.quantity as number);
    perItem.set(e.part, items);

    let level = 0;
    items.forEach(q => { level += q; });
    const points = out.get(e.part) ?? [];
    points.push({ t: Date.parse(e.date), level: Math.round(level) });
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
    if (!isSale(e)) continue;
    const i = index.get(bucketStart(Date.parse(e.date), bucket));
    if (i === undefined) continue;
    const row = out.get(e.part) ?? new Array(buckets.length).fill(0);
    row[i] += e.deltas.removed ?? 0;
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
  for (const e of entries) if (isSale(e)) sold.set(e.part, (sold.get(e.part) ?? 0) + (e.deltas.removed ?? 0));
  const order = [...partIds].sort((a, b) => (sold.get(b) ?? 0) - (sold.get(a) ?? 0) || a - b);
  return new Map(order.map((p, i) => [p, SERIES_COLORS[i] ?? OTHER_COLOR]));
}
