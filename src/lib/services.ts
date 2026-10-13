/**
 * Machine services (laser, CNC, 3D printing) from the extra lines on
 * InvenTree sales orders. The reference is the service, the description is
 * who used it; see handleCheckout in src/sendCodeHandler.ts.
 */

export interface ServiceLine {
  reference: string;
  description: string;
  quantity: number;
  price: number;        // per unit
  date: string;         // of the order (shipped, else issued, else created)
  orderStatus: number;
  order?: string;       // sales order reference, e.g. SO-0042
}

// InvenTree SalesOrderStatus: 20 shipped, 30 complete. Pending, cancelled,
// lost and returned orders are not money in.
const COUNTED = new Set([20, 30]);

/** A €0 machine line: a volunteer used the machine at the touch kiosk (VOLUNTEER on). Not money in. */
const isVolunteer = (line: ServiceLine) => line.price <= 0;

export interface PersonUse { name: string; sessions: number; minutes: number; revenue: number }

export interface LaserStats {
  sessions: number;       // paid sessions with a name
  people: number;         // different names
  minutes: number;        // all billed laser minutes, typed-in ones included
  revenue: number;
  typedMinutes: number;   // laser minutes typed in at the till, without a name
  volunteerMinutes: number;   // booked at €0 by a volunteer at the kiosk: not in the figures above
  avgPerSession: number;
  perPerson: PersonUse[]; // most minutes first
}

/** Lines booked before the description held the name read "Lasertime – Ruben (min)". */
function laserPerson(line: ServiceLine): string | null {
  if (line.description.trim()) return line.description.trim();
  const old = /^Lasertime – (.+) \(min\)$/.exec(line.reference);
  return old ? old[1].trim() : null;
}

const isLaser = (line: ServiceLine) => /^Lasertime\b/.test(line.reference);

export function laserStats(lines: ServiceLine[], days?: number, now: Date = new Date()): LaserStats {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const people = new Map<string, PersonUse>();
  let minutes = 0, revenue = 0, typedMinutes = 0, sessions = 0, volunteerMinutes = 0;

  for (const line of lines) {
    if (!isLaser(line) || !COUNTED.has(line.orderStatus)) continue;
    if (since && !(line.date && new Date(line.date) >= since)) continue;
    if (isVolunteer(line)) { volunteerMinutes += line.quantity; continue; }
    const money = line.quantity * line.price;
    minutes += line.quantity;
    revenue += money;
    const person = laserPerson(line);
    if (!person) { typedMinutes += line.quantity; continue; }
    sessions++;
    // "Ruben" and "ruben " are the same person; the first spelling is shown.
    const key = person.toLowerCase().replace(/\s+/g, ' ');
    const p = people.get(key) ?? { name: person, sessions: 0, minutes: 0, revenue: 0 };
    p.sessions++;
    p.minutes += line.quantity;
    p.revenue += money;
    people.set(key, p);
  }

  const named = minutes - typedMinutes;
  return {
    sessions,
    people: people.size,
    minutes,
    revenue,
    typedMinutes,
    volunteerMinutes,
    avgPerSession: sessions ? named / sessions : 0,
    perPerson: [...people.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

/** Why a session was deleted with time on it (laser/app.py DISCARD_KINDS). Workshop = for HTL itself
 *  (workshops are billed separately); volunteer = a volunteer's own credit, trusted to be fair. */
export type DiscardKind = 'paid' | 'workshop' | 'volunteer' | 'other';
export const DISCARD_KIND_LABELS: Record<DiscardKind | 'none', string> = {
  paid: 'Already paid (cash / transfer)', workshop: 'Workshop / HTL use', volunteer: 'Volunteer (own credit)', other: 'Other (say why)', none: 'No reason given',
};

/** Shape of a row from the laser service's GET /discarded. */
export interface DiscardRow { seconds: number; source: 'unassigned' | 'session'; session_name: string | null; reason: string | null; kind?: DiscardKind | null; discarded_at: string }

export interface LostLaserStats {
  count: number;
  minutes: number;        // exact, not rounded up like the till does
  value: number;          // minutes × price per minute: not billed via a session
  rows: DiscardRow[];     // newest first
}

/** Laser time cleared without a paid session (reset, deleted sessions). It may
 *  have been paid some other way; we only know it did not go through the app. */
export function lostLaserStats(rows: DiscardRow[], pricePerMinute: number, days?: number, now: Date = new Date()): LostLaserStats {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const kept = rows
    .filter(r => !since || new Date(r.discarded_at) >= since)
    .sort((a, b) => b.discarded_at.localeCompare(a.discarded_at));
  const minutes = kept.reduce((s, r) => s + r.seconds / 60, 0);
  return { count: kept.length, minutes, value: minutes * pricePerMinute, rows: kept };
}

export interface ServiceRevenue { reference: string; quantity: number; revenue: number }

/** Paid machine services per reference (Lasertime, CNC time, 3D printing, ...), most revenue first. */
export function serviceRevenue(lines: ServiceLine[], days?: number, now: Date = new Date()): ServiceRevenue[] {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const byRef = new Map<string, ServiceRevenue>();
  for (const line of lines) {
    if (!COUNTED.has(line.orderStatus)) continue;
    if (since && !(line.date && new Date(line.date) >= since)) continue;
    // Old laser lines carry the name in the reference: "Lasertime – Ruben (min)".
    const reference = isLaser(line) ? 'Lasertime' : line.reference.trim() || 'Other';
    const r = byRef.get(reference) ?? { reference, quantity: 0, revenue: 0 };
    r.quantity += line.quantity;
    r.revenue += line.quantity * line.price;
    byRef.set(reference, r);
  }
  return [...byRef.values()].sort((a, b) => b.revenue - a.revenue);
}

/** A laser session as the laser service keeps it (GET /sessions/all). */
export interface LaserSessionRow { name: string; created: string; total_time: number; paid_at: string | null; order_ref: string | null }

export interface LaserBucket { minutes: number; value: number; count: number }

/**
 * All laser time that is not on a paid sales order.
 * - unpaid: open sessions, not paid yet.
 * - deleted: sessions deleted with time on them, per kind ('none': deleted before kinds existed).
 *   'paid' was paid outside the checkout and counts as revenue.
 * - unverified: never assigned (reset counter, the counter now), or marked paid
 *   on a sales order that does not count (cancelled, ...).
 * Paid time itself comes from the sales orders (laserStats).
 */
export interface LaserLedger {
  unpaid: LaserBucket;
  deleted: Record<DiscardKind | 'none', LaserBucket>;
  unverified: LaserBucket;
}

export function laserLedger(
  sessions: LaserSessionRow[],
  discarded: DiscardRow[],
  lines: ServiceLine[],
  unassignedSeconds: number,
  pricePerMinute: number,
  days?: number,
  now: Date = new Date(),
): LaserLedger {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const inPeriod = (iso: string | null) => !since || (!!iso && new Date(iso) >= since);
  const bucket = (): LaserBucket => ({ minutes: 0, value: 0, count: 0 });
  const unpaid = bucket(), unverified = bucket();
  const deleted = { paid: bucket(), workshop: bucket(), volunteer: bucket(), other: bucket(), none: bucket() };
  const add = (b: LaserBucket, seconds: number) => {
    b.minutes += seconds / 60;
    b.value += (seconds / 60) * pricePerMinute;
    b.count++;
  };

  // Orders whose laser line counts as money in.
  const countedOrders = new Set(lines.filter(l => isLaser(l) && COUNTED.has(l.orderStatus) && l.order).map(l => l.order));
  const paidRefs = new Set<string>();

  for (const s of sessions) {
    if (s.total_time <= 0) continue;
    if (!s.paid_at) {
      if (!inPeriod(s.created)) continue;
      add(unpaid, s.total_time);
      continue;
    }
    if (s.order_ref) paidRefs.add(s.order_ref);
    if (s.order_ref && countedOrders.has(s.order_ref)) continue;   // on a counted sales order: paid
    if (inPeriod(s.paid_at)) add(unverified, s.total_time);
  }

  for (const r of discarded) {
    if (!inPeriod(r.discarded_at)) continue;
    // Time already booked on a paid session's order (a fix by hand): not twice.
    const ref = /SO-\d+/.exec(r.reason ?? '')?.[0];
    if (ref && paidRefs.has(ref)) continue;
    if (r.source === 'session' && r.session_name) {
      const kind = r.kind ?? 'none';
      add(deleted[kind], r.seconds);
    } else {
      add(unverified, r.seconds);
    }
  }

  if (unassignedSeconds > 0) add(unverified, unassignedSeconds);
  return { unpaid, deleted, unverified };
}

export type SessionStatus = 'paid' | 'unverified' | 'open' | DiscardKind | 'none';
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  ...DISCARD_KIND_LABELS, paid: 'Paid', unverified: 'Not verified (order cancelled)', open: 'Open, not paid yet',
};
/** One laser session: the name is whatever was typed (a person or a project). */
export interface LaserSessionUse { date: string; name: string; minutes: number; status: SessionStatus; reason: string | null }

/**
 * Every laser session in the period, newest first: open and paid ones from the
 * laser service, deleted ones from the discard log with the reason picked.
 * Counter resets are not sessions and are left out.
 */
export function laserSessionList(
  sessions: LaserSessionRow[], discarded: DiscardRow[], lines: ServiceLine[], days?: number, now: Date = new Date(),
): LaserSessionUse[] {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const inPeriod = (iso: string) => !since || new Date(iso) >= since;
  const counted = new Set(lines.filter(l => isLaser(l) && COUNTED.has(l.orderStatus) && l.order).map(l => l.order));
  const volunteerOrders = new Set(lines.filter(l => isLaser(l) && isVolunteer(l) && l.order).map(l => l.order));
  const paidRefs = new Set(sessions.map(s => s.order_ref).filter(Boolean));
  const out: LaserSessionUse[] = [];
  for (const s of sessions) {
    if (s.total_time <= 0) continue;
    const date = s.paid_at ?? s.created;
    if (!inPeriod(date)) continue;
    const status = !s.paid_at ? 'open'
      : s.order_ref && counted.has(s.order_ref) ? (volunteerOrders.has(s.order_ref) ? 'volunteer' : 'paid')
      : 'unverified';
    out.push({ date, name: s.name, minutes: s.total_time / 60, status, reason: s.order_ref });
  }
  for (const r of discarded) {
    if (r.source !== 'session' || !inPeriod(r.discarded_at)) continue;
    const ref = /SO-\d+/.exec(r.reason ?? '')?.[0];
    if (ref && paidRefs.has(ref)) continue;   // booked by hand on a paid session's order: not twice
    out.push({ date: r.discarded_at, name: r.session_name ?? '?', minutes: r.seconds / 60, status: r.kind ?? 'none', reason: r.reason });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Count and average length of the sessions people use the laser for (Workshop / HTL left out). */
export function sessionUse(list: LaserSessionUse[]): { count: number; avgMinutes: number } {
  const use = list.filter(s => s.status !== 'workshop');
  const minutes = use.reduce((sum, s) => sum + s.minutes, 0);
  return { count: use.length, avgMinutes: use.length ? minutes / use.length : 0 };
}

export interface PrintUse { grams: number; revenue: number; prints: number }

/** 3D printing paid at the till per filament (the line's description); older lines without one: "Unknown material". */
export function printsByMaterial(lines: ServiceLine[], days?: number, now: Date = new Date()): Map<string, PrintUse> {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const out = new Map<string, PrintUse>();
  for (const l of lines) {
    if (!/^3d print/i.test(l.reference) || !COUNTED.has(l.orderStatus) || isVolunteer(l)) continue;
    if (since && !(l.date && new Date(l.date) >= since)) continue;
    const name = l.description.trim() || 'Unknown material';
    const p = out.get(name) ?? { grams: 0, revenue: 0, prints: 0 };
    out.set(name, { grams: p.grams + l.quantity, revenue: p.revenue + l.quantity * l.price, prints: p.prints + 1 });
  }
  return out;
}

export interface CncJob { date: string; order: string; minutes: number; revenue: number; volunteer: boolean }
export interface CncStats { jobs: CncJob[]; minutes: number; revenue: number; avgMinutes: number; volunteerMinutes: number }

/** CNC time on orders that count, newest job first. Paid figures leave the €0 volunteer jobs out. */
export function cncStats(lines: ServiceLine[], days?: number, now: Date = new Date()): CncStats {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const jobs = lines
    .filter(l => /^cnc\b/i.test(l.reference) && COUNTED.has(l.orderStatus))
    .filter(l => !since || (!!l.date && new Date(l.date) >= since))
    .map(l => ({ date: l.date, order: l.order ?? '', minutes: l.quantity, revenue: l.quantity * l.price, volunteer: isVolunteer(l) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const paid = jobs.filter(j => !j.volunteer);
  const minutes = paid.reduce((s, j) => s + j.minutes, 0);
  return {
    jobs, minutes, revenue: paid.reduce((s, j) => s + j.revenue, 0), avgMinutes: paid.length ? minutes / paid.length : 0,
    volunteerMinutes: jobs.filter(j => j.volunteer).reduce((s, j) => s + j.minutes, 0),
  };
}

/** 3D prints a volunteer booked at €0 at the kiosk: grams and count. */
export function volunteerPrints(lines: ServiceLine[], days?: number, now: Date = new Date()): { grams: number; prints: number } {
  const since = days ? new Date(now.getTime() - days * 86_400_000) : null;
  const v = lines.filter(l => /^3d print/i.test(l.reference) && COUNTED.has(l.orderStatus) && isVolunteer(l)
    && (!since || (!!l.date && new Date(l.date) >= since)));
  return { grams: v.reduce((s, l) => s + l.quantity, 0), prints: v.length };
}
