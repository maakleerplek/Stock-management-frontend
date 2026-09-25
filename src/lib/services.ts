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
  avgPerPerson: number;
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
    avgPerPerson: people.size ? named / people.size : 0,
    perPerson: [...people.values()].sort((a, b) => b.minutes - a.minutes),
  };
}
