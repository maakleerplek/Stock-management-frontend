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

export interface PersonUse { name: string; sessions: number; minutes: number; revenue: number }

export interface LaserStats {
  sessions: number;       // paid sessions with a name
  people: number;         // different names
  minutes: number;        // all billed laser minutes, typed-in ones included
  revenue: number;
  typedMinutes: number;   // laser minutes typed in at the till, without a name
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
  let minutes = 0, revenue = 0, typedMinutes = 0, sessions = 0;

  for (const line of lines) {
    if (!isLaser(line) || !COUNTED.has(line.orderStatus)) continue;
    if (since && !(line.date && new Date(line.date) >= since)) continue;
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
    avgPerSession: sessions ? named / sessions : 0,
    perPerson: [...people.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

/** Shape of a row from the laser service's GET /discarded. */
export interface DiscardRow { seconds: number; source: 'unassigned' | 'session'; session_name: string | null; reason: string | null; discarded_at: string }

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
 * All laser time that is not on a paid sales order, in two buckets.
 * - unpaid: assigned to someone, not paid (open sessions and deleted sessions).
 * - unverified: never assigned (reset counter, the counter now), or marked paid
 *   on a sales order that does not count (cancelled, ...).
 * Paid time itself comes from the sales orders (laserStats).
 */
export interface LaserLedger {
  unpaid: LaserBucket;
  unverified: LaserBucket;
  /** Unpaid minutes per person, lower-cased name as key. */
  unpaidPerPerson: Map<string, { name: string; minutes: number }>;
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
  const unpaidPerPerson = new Map<string, { name: string; minutes: number }>();
  const add = (b: LaserBucket, seconds: number) => {
    b.minutes += seconds / 60;
    b.value += (seconds / 60) * pricePerMinute;
    b.count++;
  };
  const addPerson = (name: string, seconds: number) => {
    const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
    const p = unpaidPerPerson.get(key) ?? { name: name.trim(), minutes: 0 };
    p.minutes += seconds / 60;
    unpaidPerPerson.set(key, p);
  };

  // Orders whose laser line counts as money in.
  const countedOrders = new Set(lines.filter(l => isLaser(l) && COUNTED.has(l.orderStatus) && l.order).map(l => l.order));
  const paidRefs = new Set<string>();

  for (const s of sessions) {
    if (s.total_time <= 0) continue;
    if (!s.paid_at) {
      if (!inPeriod(s.created)) continue;
      add(unpaid, s.total_time);
      addPerson(s.name, s.total_time);
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
      add(unpaid, r.seconds);
      addPerson(r.session_name, r.seconds);
    } else {
      add(unverified, r.seconds);
    }
  }

  if (unassignedSeconds > 0) add(unverified, unassignedSeconds);
  return { unpaid, unverified, unpaidPerPerson };
}
