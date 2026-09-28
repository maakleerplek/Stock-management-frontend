/**
 * Item sales, volunteer drinks and restocks from the InvenTree tracking log,
 * per part and in total. Used by the Items and Totals analytics tabs.
 */
import type { InvenTreeTrackingEntry } from '../api/types';
import { isSale, isVolunteerDrink, unitsSold, unitsGiven, TRACKING, type SaleKind } from './stockHistory';

export interface PartPrice {
  name: string;
  sellingPrice: number; // sale price break
  costPrice: number;    // supplier price / pack size
  category: string;
}

export interface PartAnalytics extends PartPrice {
  partId: number;
  removed: number;      // paid + volunteer units within the selected kind
  given: number;        // volunteer drinks: out of stock, never paid
  added: number;
  revenue: number;
  profit: number;       // (sellingPrice - costPrice) × paid - costPrice × given
}

export interface ItemAnalytics {
  byPart: PartAnalytics[];
  totalRemoved: number;
  totalGiven: number;
  givenCost: number;
  totalAdded: number;
  totalRevenue: number;
  /** What the paid units cost: paid × min(supplier price, sale price), so revenue - paidCost - givenCost = totalProfit. */
  paidCost: number;
  totalProfit: number;
  totalTransactions: number;
  hasCostPrices: boolean;
  /** Paid units of parts without a supplier price: their revenue counts as full profit. */
  uncostedUnits: number;
}

export function filterByDays(entries: InvenTreeTrackingEntry[], days?: number, now: Date = new Date()) {
  if (!days) return entries;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return entries.filter(e => new Date(e.date) >= cutoff);
}

// Profit = (sale price - supplier cost) × units paid, minus the supplier cost
// of every volunteer drink.
export function itemAnalytics(
  entries: InvenTreeTrackingEntry[],
  parts: Map<number, PartPrice>,
  kind: SaleKind = 'all',
  days?: number,
  now: Date = new Date(),
): ItemAnalytics {
  const filtered = filterByDays(entries, days, now);
  const byPartMap = new Map<number, PartAnalytics>();
  let paidCost = 0, uncostedUnits = 0;

  for (const entry of filtered) {
    // Stocktakes and volunteer-mode corrections are not sales or restocks.
    const paid = kind === 'volunteer' ? 0 : unitsSold(entry);
    const given = kind === 'paid' ? 0 : unitsGiven(entry);
    const added = entry.tracking_type === TRACKING.STOCK_ADD ? entry.deltas?.added ?? 0 : 0;
    if (paid === 0 && given === 0 && added === 0) continue;

    const partId = entry.part;
    const info = parts.get(partId);
    const name = info?.name ?? `Part #${partId}`;
    const sellingPrice = info?.sellingPrice ?? 0;
    const costPrice = info?.costPrice ?? 0;
    const category = info?.category ?? 'Uncategorized';
    const margin = Math.max(0, sellingPrice - costPrice);
    paidCost += paid * Math.min(costPrice, sellingPrice);
    if (costPrice <= 0) uncostedUnits += paid;

    const prev = byPartMap.get(partId) ?? {
      partId, name, sellingPrice, costPrice, category,
      removed: 0, given: 0, added: 0, revenue: 0, profit: 0,
    };
    byPartMap.set(partId, {
      ...prev,
      removed: prev.removed + paid + given,
      given: prev.given + given,
      added: prev.added + added,
      revenue: prev.revenue + paid * sellingPrice,
      profit: prev.profit + paid * margin - given * costPrice,
    });
  }

  const byPart = Array.from(byPartMap.values());
  const sum = (f: (p: PartAnalytics) => number) => byPart.reduce((s, p) => s + f(p), 0);
  return {
    byPart,
    totalRemoved: sum(p => p.removed),
    totalGiven: sum(p => p.given),
    givenCost: sum(p => p.given * p.costPrice),
    totalAdded: sum(p => p.added),
    totalRevenue: sum(p => p.revenue),
    paidCost,
    totalProfit: sum(p => p.profit),
    totalTransactions: filtered.filter(e =>
      (kind !== 'volunteer' && isSale(e)) ||
      (kind !== 'paid' && isVolunteerDrink(e)) ||
      e.tracking_type === TRACKING.STOCK_ADD
    ).length,
    hasCostPrices: byPart.some(p => p.costPrice > 0),
    uncostedUnits,
  };
}
