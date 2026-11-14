/**
 * Flat rows for Grafana (Infinity), shaped from the same lib functions the old
 * Analytics tabs used. No I/O here: server.ts loads the data and calls these.
 */
import type { InvenTreeTrackingEntry } from '../src/api/types';
import type { Rates } from '../src/lib/checkoutApi';
import { itemAnalytics, type PartPrice, type PartAnalytics } from '../src/lib/itemAnalytics';
import { bucketRange, bucketStart, salesPerBucket, unitsOut, stockLevels, levelAt, type Bucket, type SaleKind } from '../src/lib/stockHistory';
import { profitTrend, PROFIT_SERIES } from '../src/lib/profitTrend';
import { buildTotals, type PrintMaterial } from '../src/lib/totals';
import {
  COUNTED, cncStats, groupSessions, laserLedger, laserSessionList, laserStats, lostLaserStats, printsByMaterial, serviceRevenue,
  sessionUse, volunteerPrints, SESSION_STATUS_LABELS,
  type DiscardRow, type LaserSessionRow, type LaserSessionUse, type ServiceLine,
} from '../src/lib/services';
import type { Workshop } from '../src/lib/workshops';
import { htlWorkshops } from '../src/lib/workshops';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Local YYYY-MM-DD: buckets start at local midnight, toISOString would give the day before. */
const day = (t: number) => new Date(t).toLocaleDateString("sv");
/** "2026-11-12T21:36:24.2096" -> "2026-11-12 21:36". */
const minute = (iso: string) => iso.slice(0, 16).replace("T", " ");

export interface AnalyticsData {
  tracking: InvenTreeTrackingEntry[];
  lines: ServiceLine[];
  discarded: DiscardRow[];
  sessions: LaserSessionRow[];
  unassignedSeconds: number;
  rates: Rates | null;
  parts: Map<number, PartPrice>;
  workshops: Workshop[];
  /** Per part: what InvenTree has in stock now and its minimum stock. */
  stock: Map<number, { inStock: number; minimum: number }>;
}
export type Row = Record<string, string | number | boolean | null>;

/** From a Grafana `from` (ms since epoch) to a number of days; 10+ years back means "all". */
export function daysFrom(from: string | null, now = Date.now()): number | undefined {
  const t = Number(from);
  if (!from || !Number.isFinite(t) || t <= 0) return undefined;
  const days = Math.max(1, Math.ceil((now - t) / DAY - 0.01));
  return days > 3650 ? undefined : days;
}

function prices(d: AnalyticsData) {
  const perMinute = d.rates?.laser.per_minute ?? 0, defaultPerGram = d.rates?.print.default_per_gram ?? 0;
  // Price per gram per filament, by name like the print lines.
  const perGram = Object.fromEntries(Object.entries(d.rates?.print.per_gram ?? {}).flatMap(([id, price]) => {
    const name = d.parts.get(Number(id))?.name;
    return name ? [[name, price]] : [];
  }));
  return { perMinute, defaultPerGram, perGram };
}

function totalsOf(d: AnalyticsData, days?: number) {
  const p = prices(d);
  return buildTotals(
    itemAnalytics(d.tracking, d.parts, 'all', days),
    serviceRevenue(d.lines, days),
    laserLedger(d.sessions, d.discarded, d.lines, d.unassignedSeconds, p.perMinute, days),
    printsByMaterial(d.lines, days),
    p.perGram, p.defaultPerGram,
  );
}

// ---- Totals ----

export function totalsRows(d: AnalyticsData, days?: number): Row[] {
  const t = totalsOf(d, days);
  return [...t.rows, t.total].map(r => ({ source: r.label, revenue: r2(r.revenue), costs: r2(r.costs), profit: r2(r.profit) }));
}

/** The lines under the table: laser time that is not in the total. */
export function totalsExtraRows(d: AnalyticsData, days?: number): Row[] {
  const t = totalsOf(d, days);
  const line = (label: string, minutes: number | null, value: number): Row => ({ label, minutes: minutes === null ? '' : `${Math.round(minutes)} min`, value: r2(value) });
  return [
    line('Laser time in open sessions (not in total)', t.laserUnpaid.minutes, t.laserUnpaid.value),
    line('Laser time deleted, workshop / HTL (not in total)', t.laserDeleted.workshop.minutes, t.laserDeleted.workshop.value),
    line('Laser time deleted, volunteer (not in total)', t.laserDeleted.volunteer.minutes, t.laserDeleted.volunteer.value),
    line('Laser time not verified (not in total)', t.laserUnverified.minutes, t.laserUnverified.value),
    line('Profit if the open laser sessions get paid', null, t.profitWithUnpaidLaser),
  ];
}

export function profitTrendRows(d: AnalyticsData, days?: number, now = new Date()): Row[] {
  const p = prices(d);
  return profitTrend({
    entries: d.tracking, parts: d.parts, lines: d.lines, sessions: d.sessions, discarded: d.discarded,
    unassignedSeconds: d.unassignedSeconds, pricePerLaserMinute: p.perMinute, pricePerGram: p.perGram, days, now,
  }).map(b => ({ period: day(b.from.getTime()), ...Object.fromEntries(PROFIT_SERIES.map(s => [s, r2(b.bySeries[s])])), net: r2(b.net) }));
}

// ---- Items ----

export type ItemSort = 'removed' | 'revenue' | 'profit' | 'given' | 'added';

/** One row per part. With `sort`: only parts above 0 in that column, best first, cut at `limit` (the old top-10 lists). */
export function itemRows(d: AnalyticsData, kind: SaleKind, days?: number, sort: ItemSort = 'removed', limit = 500): Row[] {
  const key = (p: PartAnalytics) => p[sort];
  return itemAnalytics(d.tracking, d.parts, kind, days).byPart
    .filter(p => key(p) > 0)
    .sort((a, b) => key(b) - key(a))
    .slice(0, limit)
    .map(p => ({
      part_id: p.partId, name: p.name, category: p.category, units_out: p.removed, volunteer: p.given, internal_use: p.used,
      restocked: p.added, price: r2(p.sellingPrice), cost: r2(p.costPrice), revenue: r2(p.revenue), profit: r2(p.profit),
    }));
}

export function itemSummaryRows(d: AnalyticsData, kind: SaleKind, days?: number): Row[] {
  const a = itemAnalytics(d.tracking, d.parts, kind, days);
  return [{
    transactions: a.totalTransactions, units_out: a.totalRemoved, volunteer_units: a.totalGiven, internal_use_units: a.totalUsed,
    revenue: r2(a.totalRevenue), profit: r2(a.totalProfit), volunteer_and_lab_cost: r2(a.givenCost + a.usedCost),
  }];
}

export function itemCategoryRows(d: AnalyticsData, kind: SaleKind, days?: number): Row[] {
  const map = new Map<string, { units_out: number; revenue: number }>();
  for (const p of itemAnalytics(d.tracking, d.parts, kind, days).byPart) {
    const prev = map.get(p.category) ?? { units_out: 0, revenue: 0 };
    map.set(p.category, { units_out: prev.units_out + p.removed, revenue: prev.revenue + p.revenue });
  }
  return [...map].map(([category, v]) => ({ category, units_out: v.units_out, revenue: r2(v.revenue) })).sort((a, b) => b.units_out - a.units_out);
}

/** Parts that have stock movements, for the part picker of the stock-level chart. */
export function partRows(d: AnalyticsData): Row[] {
  const ids = new Set(d.tracking.map(e => e.part));
  return [...ids].map(id => ({ part_id: id, name: d.parts.get(id)?.name ?? `Part #${id}` })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Stock level of one part after every change in the period (time in ms), starting at the level at the period start. */
export function stockLevelRows(d: AnalyticsData, part: number, days?: number, now = Date.now()): Row[] {
  const points = stockLevels(d.tracking).get(part) ?? [];
  const from = days ? now - days * DAY : 0;
  const start = days ? levelAt(points, from) : null;
  return [
    ...(start === null ? [] : [{ time: from, level: start }]),
    ...points.filter(p => p.t >= from).map(p => ({ time: p.t, level: p.level })),
  ];
}

/** Units out per day / week / month for the `top` best sellers in the period: one column per part. */
/**
 * Days until a part runs out at the pace of the period (90 days for "all"): stock now divided
 * by units out per day, counting volunteer drinks too. Only parts that moved, emptiest first.
 */
export function daysLeftRows(d: AnalyticsData, days?: number, now = Date.now()): Row[] {
  const window = days ?? 90, from = now - window * DAY;
  const out = new Map<number, number>();
  for (const e of d.tracking) {
    const n = unitsOut(e, 'all');
    if (n && Date.parse(e.date) >= from) out.set(e.part, (out.get(e.part) ?? 0) + n);
  }
  return [...out].map(([id, units]) => {
    const s = d.stock.get(id) ?? { inStock: 0, minimum: 0 }, perDay = units / window;
    return {
      name: d.parts.get(id)?.name ?? `Part #${id}`, category: d.parts.get(id)?.category ?? '',
      in_stock: s.inStock, minimum: s.minimum, per_week: r2(perDay * 7), days_left: Math.floor(s.inStock / perDay),
    };
  }).sort((a, b) => a.days_left - b.days_left);
}

export function stockSalesRows(d: AnalyticsData, kind: SaleKind, days: number | undefined, bucket: Bucket, top = 5, now = Date.now()): Row[] {
  const first = Math.min(...d.tracking.map(e => Date.parse(e.date)));
  const from = days ? now - days * DAY : Number.isFinite(first) ? first : now;
  const buckets = bucketRange(from, now, bucket);
  const sold = salesPerBucket(d.tracking, buckets, bucket, kind);
  const best = [...sold].map(([id, row]) => ({ id, total: row.reduce((s, n) => s + n, 0) })).sort((a, b) => b.total - a.total).slice(0, top);
  return buckets.map((b, i) => ({
    period: day(b),
    ...Object.fromEntries(best.map(({ id }) => [d.parts.get(id)?.name ?? `Part #${id}`, sold.get(id)![i]])),
  }));
}

// ---- Laser ----

export function laserSessionRows(d: AnalyticsData, days?: number): Row[] {
  const perMinute = prices(d).perMinute;
  return groupSessions(laserSessionList(d.sessions, d.discarded, d.lines, days)).map(s => ({
    when: minute(s.date), name: s.name, cuts: s.cuts, minutes: r2(s.minutes), value: r2(s.minutes * perMinute),
    status: SESSION_STATUS_LABELS[s.status], note: s.reason ?? '',
  }));
}

/** Laser minutes per day / week / month, one line per kind of use plus the total. */
export function laserTrendRows(d: AnalyticsData, days: number | undefined, bucket: Bucket, now = Date.now()): Row[] {
  const list = laserSessionList(d.sessions, d.discarded, d.lines, days, new Date(now));
  const first = Math.min(...list.map(s => Date.parse(s.date)));
  const buckets = bucketRange(days ? now - days * DAY : Number.isFinite(first) ? first : now, now, bucket);
  const index = new Map(buckets.map((b, i) => [b, i]));
  const kind = (s: LaserSessionUse) => s.status === 'open' ? 'Open' : s.status === 'unverified' ? 'Not verified'
    : s.status === 'volunteer' || s.status === 'workshop' ? 'Volunteer / workshop' : 'Paid';
  const KINDS = ['Paid', 'Volunteer / workshop', 'Open', 'Not verified', 'Total'] as const;
  const out = buckets.map(b => ({ period: day(b), ...Object.fromEntries(KINDS.map(k => [k, 0])) } as Record<string, number | string>));
  for (const s of list) {
    const i = index.get(bucketStart(Date.parse(s.date), bucket));
    if (i === undefined) continue;
    for (const k of [kind(s), 'Total']) out[i][k] = r2((out[i][k] as number) + s.minutes);
  }
  return out;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Laser minutes per weekday and start hour (local time): one row per weekday, one column per hour.
 * Deleted sessions count from their delete time minus their duration.
 * shortcut: a session counts fully in its start hour, spread it over the hours if long sessions blur the picture.
 */
export function laserHeatmapRows(d: AnalyticsData, days?: number, now = Date.now()): Row[] {
  const from = days ? now - days * DAY : 0;
  const starts = [
    ...d.sessions.filter(s => s.total_time > 0).map(s => ({ t: Date.parse(s.created), sec: s.total_time })),
    ...d.discarded.filter(r => r.source === 'session').map(r => ({ t: Date.parse(r.discarded_at) - r.seconds * 1000, sec: r.seconds })),
  ].filter(s => s.t >= from);
  const grid = WEEKDAYS.map(() => new Array<number>(24).fill(0));
  for (const s of starts) {
    const at = new Date(s.t);
    grid[(at.getDay() + 6) % 7][at.getHours()] += s.sec / 60;
  }
  const used = grid.flatMap(row => row.flatMap((m, h) => (m > 0 ? [h] : [])));
  const first = used.length ? Math.min(...used) : 9, last = used.length ? Math.max(...used) : 22;
  return WEEKDAYS.map((day, i) => ({
    day, ...Object.fromEntries(grid[i].slice(first, last + 1).map((m, h) => [`${String(first + h).padStart(2, '0')}h`, Math.round(m)])),
  }));
}

export function laserResetRows(d: AnalyticsData, days?: number): Row[] {
  const perMinute = prices(d).perMinute;
  return lostLaserStats(d.discarded, perMinute, days).rows.filter(r => r.source === 'unassigned').map(r => ({
    when: minute(r.discarded_at), minutes: r2(r.seconds / 60), value: r2((r.seconds / 60) * perMinute), note: r.reason ?? '',
  }));
}

export function laserSummaryRows(d: AnalyticsData, days?: number): Row[] {
  const perMinute = prices(d).perMinute;
  const laser = laserStats(d.lines, days);
  const ledger = laserLedger(d.sessions, d.discarded, d.lines, d.unassignedSeconds, perMinute, days);
  const sessions = groupSessions(laserSessionList(d.sessions, d.discarded, d.lines, days));
  const use = sessionUse(sessions);
  // Deleted sessions count as paid outside the checkout, except workshop / HTL and volunteer use.
  const { paid, workshop, volunteer, other, none } = ledger.deleted;
  const outside = { minutes: paid.minutes + other.minutes + none.minutes, value: paid.value + other.value + none.value };
  return [{
    sessions: use.count, avg_minutes: r2(use.avgMinutes),
    paid_minutes: Math.round(laser.minutes + outside.minutes), paid_value: r2(laser.revenue + outside.value),
    volunteer_minutes: Math.round(volunteer.minutes + laser.volunteerMinutes), volunteer_value: r2(volunteer.value + laser.volunteerMinutes * perMinute),
    open_minutes: Math.round(ledger.unpaid.minutes), open_value: r2(ledger.unpaid.value),
    unverified_minutes: Math.round(ledger.unverified.minutes), unverified_value: r2(ledger.unverified.value),
    all_minutes: Math.round(laser.minutes + outside.minutes + workshop.minutes + volunteer.minutes + laser.volunteerMinutes
      + ledger.unpaid.minutes + ledger.unverified.minutes),
    typed_minutes: Math.round(laser.typedMinutes),
  }];
}

// ---- 3D printing ----

const is3dPrint = (l: ServiceLine) => /^3d print/i.test(l.reference) && COUNTED.has(l.orderStatus);
const inPeriod = (l: ServiceLine, days?: number, now = Date.now()) => !days || (!!l.date && new Date(l.date).getTime() >= now - days * DAY);

/** Every 3D print booked at the till in the period, newest first; a €0 line is a volunteer / workshop print. */
export function printRows(d: AnalyticsData, days?: number): Row[] {
  const perGram = prices(d).defaultPerGram;
  return d.lines.filter(l => is3dPrint(l) && inPeriod(l, days)).sort((a, b) => b.date.localeCompare(a.date)).map(l => ({
    when: l.date, filament: l.description.trim() || 'Unknown material', grams: l.quantity,
    value: r2(l.price > 0 ? l.quantity * l.price : l.quantity * perGram), status: l.price > 0 ? 'Paid' : 'Volunteer / workshop', order: l.order ?? '',
  }));
}

function printTotals(d: AnalyticsData, days?: number) {
  const p = prices(d);
  const printing = buildTotals(itemAnalytics(d.tracking, d.parts, 'all', days), [], laserLedger([], [], [], 0, 0, days),
    printsByMaterial(d.lines, days), p.perGram, p.defaultPerGram).printing;
  return { printing, vol: volunteerPrints(d.lines, days), defaultPerGram: p.defaultPerGram };
}

export function printSummaryRows(d: AnalyticsData, days?: number): Row[] {
  const { printing: p, vol, defaultPerGram } = printTotals(d, days);
  return [{
    prints_paid: p.prints, paid_grams: Math.round(p.paidGrams), paid_value: r2(p.paidRevenue),
    volunteer_grams: Math.round(vol.grams), volunteer_prints: vol.prints, volunteer_value: r2(vol.grams * defaultPerGram),
    taken_grams: Math.round(p.grams), taken_cost: r2(p.cost), not_booked_grams: Math.round(Math.max(0, p.grams - p.paidGrams - vol.grams)),
    profit: r2(p.paidRevenue - p.cost),
  }];
}

/** Per filament: paid, volunteer, taken for the printers, taken but no print booked yet, profit; plus a Total row. */
export function printMaterialRows(d: AnalyticsData, days?: number): Row[] {
  const { printing: p, vol } = printTotals(d, days);
  const volBy = new Map<string, number>();
  for (const l of d.lines) if (is3dPrint(l) && inPeriod(l, days) && l.price <= 0) {
    const name = l.description.trim() || 'Unknown material';
    volBy.set(name, (volBy.get(name) ?? 0) + l.quantity);
  }
  const row = (m: Omit<PrintMaterial, 'material'>, filament: string, volGrams: number): Row => ({
    filament, paid_grams: Math.round(m.paidGrams), paid_value: r2(m.paidRevenue), volunteer_grams: Math.round(volGrams),
    taken_grams: Math.round(m.grams), taken_cost: r2(m.cost), not_booked_grams: Math.round(Math.max(0, m.grams - m.paidGrams - volGrams)),
    profit: r2(m.paidRevenue - m.cost),
  });
  return [
    ...p.byMaterial.map(m => row(m, m.material, volBy.get(m.material) ?? 0)),
    ...(p.byMaterial.length > 1 ? [row(p, 'Total', vol.grams)] : []),
  ];
}

// ---- CNC ----

export function cncRows(d: AnalyticsData, days?: number): Row[] {
  return cncStats(d.lines, days).jobs.map(j => ({
    when: j.date, order: j.order, minutes: j.minutes, revenue: r2(j.revenue), status: j.volunteer ? 'Volunteer' : 'Paid',
  }));
}

export function cncSummaryRows(d: AnalyticsData, days?: number): Row[] {
  const c = cncStats(d.lines, days);
  return [{
    jobs_paid: c.jobs.filter(j => !j.volunteer).length, minutes: Math.round(c.minutes), revenue: r2(c.revenue),
    avg_minutes: r2(c.avgMinutes), volunteer_minutes: Math.round(c.volunteerMinutes),
  }];
}

// ---- Workshops ----

export function workshopRows(d: AnalyticsData): Row[] {
  return htlWorkshops({ workshops: d.workshops }).map(w => ({
    when: w.dateISO, time: w.time, title: w.title, price: w.price, location: w.location ?? '', link: w.link,
  }));
}
