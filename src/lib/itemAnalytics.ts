/**
 * Item sales, volunteer drinks, internal use and restocks from the InvenTree tracking log,
 * per part and in total. Used by the Items and Totals analytics tabs.
 */
import type { InvenTreeTrackingEntry } from '../api/types';
import { isSale, isVolunteerDrink, isInternalUse, unitsSold, unitsGiven, unitsUsed, TRACKING, type SaleKind } from './stockHistory';

export interface PartPrice {
  name: string;
  sellingPrice: number; // sale price break
  costPrice: number;    // supplier price / pack size
  category: string;
}

export interface PartAnalytics extends PartPrice {
  partId: number;
  removed: number;      // paid + volunteer drinks + internal use, within the selected kind
  given: number;        // volunteer drinks: out of stock, never paid
  used: number;         // internal use (filament for the open labs): out of stock, not a loss
  added: number;
  revenue: number;
  paidCost: number;     // paid × min(costPrice, sellingPrice)
  profit: number;       // (sellingPrice - costPrice) × paid - costPrice × given
}

/** Items sold, per stock category. */
export interface CategorySales { category: string; units: number; revenue: number; paidCost: number }

export interface ItemAnalytics {
  byPart: PartAnalytics[];
  totalRemoved: number;
  totalGiven: number;
  givenCost: number;
  /** Internal use: what it cost, shown apart, not taken off the profit. */
  totalUsed: number;
  usedCost: number;
  byCategory: CategorySales[];
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
// of every volunteer drink. Internal use is counted apart and not taken off:
// the material goes into the open labs, it is not lost.
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
    const used = kind === 'paid' ? 0 : unitsUsed(entry);
    const added = entry.tracking_type === TRACKING.STOCK_ADD ? entry.deltas?.added ?? 0 : 0;
    if (paid === 0 && given === 0 && used === 0 && added === 0) continue;

    const partId = entry.part;
    const info = parts.get(partId);
    const name = info?.name ?? `Part #${partId}`;
    const sellingPrice = info?.sellingPrice ?? 0;
    const costPrice = info?.costPrice ?? 0;
    const category = info?.category ?? 'Uncategorized';
    const margin = Math.max(0, sellingPrice - costPrice);
    const cost = paid * Math.min(costPrice, sellingPrice);
    paidCost += cost;
    if (costPrice <= 0) uncostedUnits += paid;

    const prev = byPartMap.get(partId) ?? {
      partId, name, sellingPrice, costPrice, category,
      removed: 0, given: 0, used: 0, added: 0, revenue: 0, paidCost: 0, profit: 0,
    };
    byPartMap.set(partId, {
      ...prev,
      removed: prev.removed + paid + given + used,
      given: prev.given + given,
      used: prev.used + used,
      added: prev.added + added,
      revenue: prev.revenue + paid * sellingPrice,
      paidCost: prev.paidCost + cost,
      profit: prev.profit + paid * margin - given * costPrice,
    });
  }

  const byPart = Array.from(byPartMap.values());
  const sum = (f: (p: PartAnalytics) => number) => byPart.reduce((s, p) => s + f(p), 0);
  const categories = new Map<string, CategorySales>();
  for (const p of byPart) {
    const sold = p.removed - p.given - p.used;
    if (sold <= 0) continue;
    const c = categories.get(p.category) ?? { category: p.category, units: 0, revenue: 0, paidCost: 0 };
    categories.set(p.category, { ...c, units: c.units + sold, revenue: c.revenue + p.revenue, paidCost: c.paidCost + p.paidCost });
  }
  return {
    byPart,
    totalRemoved: sum(p => p.removed),
    totalGiven: sum(p => p.given),
    givenCost: sum(p => p.given * p.costPrice),
    totalUsed: sum(p => p.used),
    usedCost: sum(p => p.used * p.costPrice),
    byCategory: Array.from(categories.values()).sort((a, b) => b.revenue - a.revenue),
    totalAdded: sum(p => p.added),
    totalRevenue: sum(p => p.revenue),
    paidCost,
    totalProfit: sum(p => p.profit),
    totalTransactions: filtered.filter(e =>
      (kind !== 'volunteer' && isSale(e)) ||
      (kind !== 'paid' && (isVolunteerDrink(e) || isInternalUse(e))) ||
      e.tracking_type === TRACKING.STOCK_ADD
    ).length,
    hasCostPrices: byPart.some(p => p.costPrice > 0),
    uncostedUnits,
  };
}
