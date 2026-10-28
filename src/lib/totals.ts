/**
 * One table of revenue, costs and profit for a period, from the item sales
 * (tracking log), the machine services (sales-order extra lines), the
 * material used in the lab, and the laser time that is not on a paid order.
 */
import type { ItemAnalytics } from './itemAnalytics';
import type { ServiceRevenue, LaserLedger, LaserBucket, PrintUse } from './services';

/** Grams of filament in a spool, from its name ("PLA White (1 kg)", "750g"); 1 kg when it does not say. */
export function spoolGrams(name: string): number {
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i.exec(name);
  return m ? parseFloat(m[1].replace(',', '.')) * (m[2].toLowerCase() === 'kg' ? 1000 : 1) : 1000;
}

/**
 * Filament taken out for the open-lab 3D printers against the printing paid at
 * the till. The filament is a cost now; the prints are paid later, partly
 * outside the system, so the gap is shown apart and not in the total.
 */
export interface PrintMaterial {
  material: string;
  grams: number;          // filament taken out for the printers
  cost: number;           // what that filament cost
  paidGrams: number;      // 3D printing paid at the till
  paidRevenue: number;
  prints: number;
  potentialRevenue: number;   // if every gram taken gets printed and paid at its price
}
export interface Printing extends Omit<PrintMaterial, 'material'> { byMaterial: PrintMaterial[] }

export interface TotalsRow { label: string; revenue: number; costs: number; profit: number }

export interface Totals {
  rows: TotalsRow[];        // rows with only zeros left out
  printing: Printing;
  total: TotalsRow;
  /** Laser time not on a paid sales order: not in the total. */
  laserUnpaid: LaserBucket;       // open sessions, not paid yet
  /** Deleted sessions per kind; all but workshop and volunteer are counted as paid in the total. */
  laserDeleted: LaserLedger['deleted'];
  laserUnverified: LaserBucket;   // never assigned, or its order did not count
  /** Total profit if all assigned, unpaid laser time gets paid. */
  profitWithUnpaidLaser: number;
  notes: string[];
}

const SERVICE_LABEL: Record<string, string> = { Lasertime: 'Laser time' };

export function buildTotals(
  items: ItemAnalytics, services: ServiceRevenue[], laser: LaserLedger,
  prints: Map<string, PrintUse> = new Map(), pricePerGram: Record<string, number> = {}, defaultPerGram = 0,
): Totals {
  const { paid, other, none } = laser.deleted;
  const deletedPaid = paid.value + other.value + none.value;
  // Per filament: taken out as lab use against 3D printing paid at the till.
  const materials = new Map<string, PrintMaterial>();
  const material = (name: string) => materials.get(name) ?? { material: name, grams: 0, cost: 0, paidGrams: 0, paidRevenue: 0, prints: 0, potentialRevenue: 0 };
  for (const p of items.byPart) {
    if (p.used <= 0 || !/filament/i.test(p.category)) continue;
    const m = material(p.name);
    const grams = p.used * spoolGrams(p.name);
    materials.set(p.name, { ...m, grams: m.grams + grams, cost: m.cost + p.used * p.costPrice,
      potentialRevenue: m.potentialRevenue + grams * (pricePerGram[p.name] ?? defaultPerGram) });
  }
  for (const [name, u] of prints) {
    const m = material(name);
    materials.set(name, { ...m, paidGrams: m.paidGrams + u.grams, paidRevenue: m.paidRevenue + u.revenue, prints: m.prints + u.prints });
  }
  const byMaterial = [...materials.values()].sort((a, b) => b.grams + b.paidGrams - a.grams - a.paidGrams);
  const add = (f: (m: PrintMaterial) => number) => byMaterial.reduce((s, m) => s + f(m), 0);
  const filament = { cost: add(m => m.cost) };
  const printing: Printing = {
    byMaterial,
    grams: add(m => m.grams), cost: filament.cost, paidGrams: add(m => m.paidGrams), paidRevenue: add(m => m.paidRevenue),
    prints: add(m => m.prints), potentialRevenue: add(m => m.potentialRevenue),
  };
  const all: TotalsRow[] = [
    // Items sold, one row per stock category.
    ...items.byCategory.map(c => ({ label: `Items sold · ${c.category}`, revenue: c.revenue, costs: c.paidCost, profit: c.revenue - c.paidCost })),
    { label: 'Volunteer drinks', revenue: 0, costs: items.givenCost, profit: -items.givenCost },
    // Free items a volunteer put to use in the lab: filament for the 3D printers apart from wood, ...
    { label: 'Lab filament (3D printers)', revenue: 0, costs: filament.cost, profit: -filament.cost },
    { label: 'Lab & workshop use (wood, ...)', revenue: 0, costs: items.usedCost - filament.cost, profit: filament.cost - items.usedCost },
    // Machine costs (power, wear, material) are not tracked.
    ...services.map(s => ({ label: SERVICE_LABEL[s.reference] ?? s.reference, revenue: s.revenue, costs: 0, profit: s.revenue })),
    // Deleted sessions count as paid outside the checkout (cash, transfer, ...), unless
    // they were workshop / HTL or volunteer use. Counter resets are not on anyone: not counted.
    { label: 'Laser time · paid outside checkout', revenue: deletedPaid, costs: 0, profit: deletedPaid },
  ];
  const rows = all.filter(r => r.revenue !== 0 || r.costs !== 0);
  const total = rows.reduce(
    (t, r) => ({ ...t, revenue: t.revenue + r.revenue, costs: t.costs + r.costs, profit: t.profit + r.profit }),
    { label: 'Total', revenue: 0, costs: 0, profit: 0 },
  );

  const notes: string[] = [];
  if (items.uncostedUnits > 0) {
    notes.push(`${items.uncostedUnits} item${items.uncostedUnits === 1 ? '' : 's'} sold without a supplier price: their revenue counts as full profit.`);
  }
  if (services.some(s => s.revenue > 0)) {
    notes.push('Machine costs (power, wear, material) are not tracked: machine revenue counts as profit.');
  }
  return {
    rows, total, printing,
    laserUnpaid: laser.unpaid,
    laserDeleted: laser.deleted,
    laserUnverified: laser.unverified,
    profitWithUnpaidLaser: total.profit + laser.unpaid.value,
    notes,
  };
}
