/**
 * One table of revenue, costs and profit for a period, from the item sales
 * (tracking log), the machine services (sales-order extra lines), the
 * material used in the lab, and the laser time that is not on a paid order.
 */
import type { ItemAnalytics } from './itemAnalytics';
import type { ServiceRevenue, LaserLedger, LaserBucket } from './services';

export interface TotalsRow { label: string; revenue: number; costs: number; profit: number }

export interface Totals {
  rows: TotalsRow[];        // rows with only zeros left out
  total: TotalsRow;
  /** Laser time not on a paid sales order: not in the total. */
  laserUnpaid: LaserBucket;       // assigned to someone, not paid
  laserUnverified: LaserBucket;   // never assigned, or its order did not count
  /** Total profit if all assigned, unpaid laser time gets paid. */
  profitWithUnpaidLaser: number;
  notes: string[];
}

const SERVICE_LABEL: Record<string, string> = { Lasertime: 'Laser time' };

export function buildTotals(items: ItemAnalytics, services: ServiceRevenue[], laser: LaserLedger): Totals {
  const all: TotalsRow[] = [
    // Items sold, one row per stock category.
    ...items.byCategory.map(c => ({ label: `Items sold · ${c.category}`, revenue: c.revenue, costs: c.paidCost, profit: c.revenue - c.paidCost })),
    { label: 'Volunteer drinks', revenue: 0, costs: items.givenCost, profit: -items.givenCost },
    // Free items a volunteer put to use in the lab: filament for the 3D printers, wood, ...
    { label: 'Lab & workshop use (filament, wood, ...)', revenue: 0, costs: items.usedCost, profit: -items.usedCost },
    // Machine costs (power, wear, material) are not tracked.
    ...services.map(s => ({ label: SERVICE_LABEL[s.reference] ?? s.reference, revenue: s.revenue, costs: 0, profit: s.revenue })),
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
  if (items.usedCost > 0 && !services.some(s => /3d print/i.test(s.reference) && s.revenue > 0)) {
    notes.push('3D printing is not measured yet: once it is, the print revenue goes against the lab filament cost.');
  }
  if (services.some(s => s.revenue > 0)) {
    notes.push('Machine costs (power, wear, material) are not tracked: machine revenue counts as profit.');
  }
  return {
    rows, total,
    laserUnpaid: laser.unpaid,
    laserUnverified: laser.unverified,
    profitWithUnpaidLaser: total.profit + laser.unpaid.value,
    notes,
  };
}
