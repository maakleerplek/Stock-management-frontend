import { useState, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Package, BarChart2, Percent, Download, HandHeart } from 'lucide-react';
import type { InvenTreeTrackingEntry } from '../api/types';
import type { PartInfo, SaleKind } from '../lib/stockHistory';
import { itemAnalytics } from '../lib/itemAnalytics';
import { usePartLookup } from './usePartLookup';
import StockHistoryChart from '../components/StockHistoryChart';
import { BrutalistBar, Section, Empty, SegmentedButtons, StatCards } from './ui';
import type { DateRange } from './AnalyticsPage';

const SALE_KINDS: { value: SaleKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'volunteer', label: 'Volunteer' },
];

/** Stock movement, sales and volunteer drinks, from the InvenTree tracking log. */
export default function ItemsTab({ trackingEntries, loading, error, onRetry, dateRange }: {
  trackingEntries: InvenTreeTrackingEntry[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  dateRange: DateRange;
}) {
  const [kind, setKind] = useState<SaleKind>('all');

  const partLookup = usePartLookup();

  const chartParts = useMemo(() => {
    const map = new Map<number, PartInfo>();
    partLookup.forEach((v, k) => map.set(k, { name: v.name, category: v.category || 'Uncategorized' }));
    return map;
  }, [partLookup]);

  const analytics = useMemo(
    () => itemAnalytics(trackingEntries, partLookup, kind, dateRange.days ?? undefined),
    [trackingEntries, partLookup, kind, dateRange],
  );

  const mostUsed = useMemo(() =>
    analytics.byPart.filter(p => p.removed > 0).sort((a, b) => b.removed - a.removed).slice(0, 10),
    [analytics]
  );

  const mostProfitable = useMemo(() =>
    analytics.byPart.filter(p => p.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    [analytics]
  );

  const mostProfit = useMemo(() =>
    analytics.byPart.filter(p => p.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 10),
    [analytics]
  );

  const mostGiven = useMemo(() =>
    analytics.byPart.filter(p => p.given > 0).sort((a, b) => b.given - a.given).slice(0, 10),
    [analytics]
  );

  const mostAdded = useMemo(() =>
    analytics.byPart.filter(p => p.added > 0).sort((a, b) => b.added - a.added).slice(0, 10),
    [analytics]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, { removed: number; revenue: number }>();
    analytics.byPart.forEach(p => {
      const prev = map.get(p.category) ?? { removed: 0, revenue: 0 };
      map.set(p.category, { removed: prev.removed + p.removed, revenue: prev.revenue + p.revenue });
    });
    return Array.from(map.entries())
      .map(([cat, d]) => ({ cat, ...d }))
      .sort((a, b) => b.removed - a.removed);
  }, [analytics]);

  const exportCSV = useCallback(() => {
    const period = dateRange.days ? `last_${dateRange.days}d` : 'all_time';
    const rows: string[][] = [
      ['Stock analytics export'],
      [`Period: ${dateRange.label === 'ALL' ? 'All time' : `Last ${dateRange.days} days`}`],
      [`Sales: ${SALE_KINDS.find(k => k.value === kind)?.label}`],
      [`Exported: ${new Date().toISOString()}`],
      [],
      ['--- PART SUMMARY ---'],
      ['Part Name', 'Category', 'Units Removed', 'Volunteer Units', 'Units Added', 'Sell Price/unit (€)', 'Cost Price/unit (€)', 'Revenue (€)', 'Profit (€)'],
      ...analytics.byPart
        .sort((a, b) => b.removed - a.removed)
        .map(p => [
          p.name,
          p.category,
          String(p.removed),
          String(p.given),
          String(p.added),
          p.sellingPrice.toFixed(2),
          p.costPrice > 0 ? p.costPrice.toFixed(2) : '',
          p.revenue.toFixed(2),
          p.profit.toFixed(2),
        ]),
      [],
      ['--- CATEGORY SUMMARY ---'],
      ['Category', 'Units Removed', 'Revenue (€)'],
      ...byCategory.map(c => [c.cat, String(c.removed), c.revenue.toFixed(2)]),
      [],
      ['--- TOTALS ---'],
      ['Transactions', String(analytics.totalTransactions)],
      ['Total Units Out', String(analytics.totalRemoved)],
      ['Volunteer Drinks', String(analytics.totalGiven)],
      ['Volunteer Drinks Cost (€)', analytics.givenCost.toFixed(2)],
      ['Total Units In', String(analytics.totalAdded)],
      ['Total Revenue (€)', analytics.totalRevenue.toFixed(2)],
      ['Total Profit (€)', analytics.totalProfit.toFixed(2)],
    ];

    const csv = rows
      .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analytics, byCategory, dateRange, kind]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-xs font-semibold text-brand-black/50 animate-pulse">
          Loading tracking data...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="border border-red-600 p-6 max-w-sm text-center space-y-3">
          <p className="text-xs font-semibold text-red-600">Error loading data</p>
          <p className="text-xs text-brand-black/60">{error}</p>
          <button onClick={onRetry} className="brutalist-button py-2 px-4 text-xs">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasGiven = analytics.totalGiven > 0;
  const statCards = [
    { label: 'Transactions', value: analytics.totalTransactions, icon: BarChart2, bg: 'bg-brand-beige-dark' },
    {
      label: 'Units out',
      value: analytics.totalRemoved,
      sub: hasGiven ? `incl. ${analytics.totalGiven} volunteer drink${analytics.totalGiven === 1 ? '' : 's'}` : undefined,
      icon: TrendingDown,
      bg: 'bg-rose-50',
    },
    { label: 'Revenue', value: `€${analytics.totalRevenue.toFixed(2)}`, icon: DollarSign, bg: 'bg-amber-50' },
    {
      label: analytics.hasCostPrices ? 'Profit' : 'Profit*',
      value: `€${analytics.totalProfit.toFixed(2)}`,
      sub: hasGiven && analytics.givenCost > 0 ? `after €${analytics.givenCost.toFixed(2)} volunteer drinks` : undefined,
      icon: Percent,
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedButtons options={SALE_KINDS} value={kind} onChange={setKind} title="Paid sales, free volunteer drinks, or both" />
        <button
          onClick={exportCSV}
          disabled={analytics.totalTransactions === 0}
          className="border border-lijn px-3 py-1.5 hover:bg-brand-beige-dark transition-colors flex items-center gap-1.5 text-[10px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          title="Export to CSV"
        >
          <Download size={12} />
          Export
        </button>
      </div>

      <StatCards cards={statCards} />

      {trackingEntries.length > 0 && (
        <StockHistoryChart entries={trackingEntries} parts={chartParts} days={dateRange.days} kind={kind} />
      )}

      {analytics.totalTransactions === 0 && (
        <div className="border border-lijn p-8 text-center">
          <p className="text-xs font-semibold text-brand-black/40">
            No tracking events in this period
          </p>
        </div>
      )}

      {analytics.totalTransactions > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Most consumed */}
          <Section title="Most consumed items" icon={TrendingDown}>
            {mostUsed.length === 0 ? <Empty /> : mostUsed.map(item => (
              <BrutalistBar
                key={item.partId}
                label={item.name}
                value={item.removed}
                maxValue={mostUsed[0].removed}
                color="bg-rose-400"
              />
            ))}
          </Section>

          {/* Top profit = (sale price - supplier cost) x units removed */}
          <Section title="Top profit items" icon={Percent}>
            {mostProfit.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <span className="text-xs font-bold text-brand-black/40 text-center">
                  No profit data —<br />Add a supplier price and a sale price in InvenTree
                </span>
              </div>
            ) : mostProfit.map(item => (
              <BrutalistBar
                key={item.partId}
                label={item.name}
                value={item.profit}
                maxValue={mostProfit[0].profit}
                prefix="€"
                decimals={2}
                color="bg-emerald-400"
              />
            ))}
          </Section>

          {/* Top revenue */}
          <Section title="Top revenue items" icon={DollarSign}>
            {mostProfitable.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <span className="text-xs font-bold text-brand-black/40 text-center">
                  No revenue data —<br />Add prices to items
                </span>
              </div>
            ) : mostProfitable.map(item => (
              <BrutalistBar
                key={item.partId}
                label={item.name}
                value={item.revenue}
                maxValue={mostProfitable[0].revenue}
                prefix="€"
                decimals={2}
                color="bg-amber-400"
              />
            ))}
          </Section>

          {/* Volunteer drinks: taken free after a shift, cost only */}
          {mostGiven.length > 0 && (
            <Section title="Volunteer drinks" icon={HandHeart}>
              {mostGiven.map(item => (
                <BrutalistBar
                  key={item.partId}
                  label={item.name}
                  value={item.given}
                  maxValue={mostGiven[0].given}
                  color="bg-violet-400"
                />
              ))}
            </Section>
          )}

          {/* Most restocked */}
          <Section title="Most restocked items" icon={TrendingUp}>
            {mostAdded.length === 0 ? <Empty /> : mostAdded.map(item => (
              <BrutalistBar
                key={item.partId}
                label={item.name}
                value={item.added}
                maxValue={mostAdded[0].added}
                color="bg-emerald-400"
              />
            ))}
          </Section>

          {/* By category */}
          <Section title="By category (units out)" icon={Package}>
            {byCategory.length === 0 ? <Empty /> : byCategory.map(item => (
              <BrutalistBar
                key={item.cat}
                label={item.cat}
                value={item.removed}
                maxValue={byCategory[0].removed}
                color="bg-blue-400"
              />
            ))}
          </Section>

        </div>
      )}

      {!analytics.hasCostPrices && analytics.totalTransactions > 0 && (
        <p className="text-[10px] font-mono text-brand-black/40 text-center">
          * Profit requires pricing min (cost) and max (sell) set on parts in InvenTree
        </p>
      )}

      <p className="text-[10px] font-mono text-brand-black/30 text-center pb-2">
        Based on {trackingEntries.length} tracking entries
      </p>
    </div>
  );
}
