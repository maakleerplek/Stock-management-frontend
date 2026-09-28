/**
 * One table of revenue, costs and profit for a period, from the item sales
 * (tracking log), the machine services (sales-order extra lines) and the
 * laser time that never went through a paid session.
 */
import type { ItemAnalytics } from './itemAnalytics';
import type { ServiceRevenue, LostLaserStats } from './services';

export interface TotalsRow { label: string; revenue: number; costs: number; profit: number }

export interface Totals {
  rows: TotalsRow[];        // rows with only zeros left out
  total: TotalsRow;
  /** Laser time cleared without a paid session: maybe paid some other way, so not in the total. */
  notViaSession: { minutes: number; value: number };
  notes: string[];
}

const SERVICE_LABEL: Record<string, string> = { Lasertime: 'Laser time' };

export function buildTotals(items: ItemAnalytics, services: ServiceRevenue[], lost: LostLaserStats): Totals {
  const all: TotalsRow[] = [
    { label: 'Items sold', revenue: items.totalRevenue, costs: items.paidCost, profit: items.totalRevenue - items.paidCost },
    { label: 'Volunteer drinks', revenue: 0, costs: items.givenCost, profit: -items.givenCost },
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
  if (services.some(s => s.revenue > 0)) {
    notes.push('Machine costs (power, wear, material) are not tracked: machine revenue counts as profit.');
  }
  return { rows, total, notViaSession: { minutes: lost.minutes, value: lost.value }, notes };
}
