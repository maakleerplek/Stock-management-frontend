import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Package, BarChart2, RefreshCw, Percent, Download } from 'lucide-react';
import inventreeClient from './api/inventreeClient';
import { useStock } from './StockContext';
import type { InvenTreeTrackingEntry } from './api/types';
import { cn } from './lib/utils';


const DATE_RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: null },
] as const;

type DateRange = typeof DATE_RANGES[number];

interface PartAnalytics {
  partId: number;
  name: string;
  sellingPrice: number; // pricing_max
  costPrice: number;    // pricing_min
  category: string;
  removed: number;
  added: number;
  revenue: number;
  profit: number;       // (sellingPrice - costPrice) × removed
}

function BrutalistBar({
  label,
  value,
  maxValue,
  prefix = '',
  color = 'bg-brand-black',
  decimals = 0,
}: {
  label: string;
  value: number;
  maxValue: number;
  prefix?: string;
  color?: string;
  decimals?: number;
}) {
  const displayValue = decimals > 0 ? value.toFixed(decimals) : value;
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2.5 border-b border-brand-black/10 last:border-0">
      <div className="w-28 sm:w-36 text-[10px] sm:text-xs font-bold uppercase truncate flex-shrink-0 text-brand-black" title={label}>
        {label}
      </div>
      <div className="flex-1 h-4 border border-brand-black bg-brand-beige-dark relative overflow-hidden">
        <div
          className={cn('h-full transition-all duration-500', color)}
          style={{ width: `${Math.max(2, (value / maxValue) * 100)}%` }}
        />
      </div>
      <div className="text-xs font-mono font-black w-16 sm:w-20 text-right flex-shrink-0 tabular-nums">
        {prefix}{displayValue}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-brand-accent px-4 py-2 border border-brand-black border-b-0">
        <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
          <Icon size={13} />
          {title}
        </h3>
      </div>
      <div className="border border-brand-black p-4 min-h-[80px]">
        {children}
      </div>
    </div>
  );
}

const EMPTY = (
  <div className="flex items-center justify-center py-6">
    <span className="text-xs font-bold uppercase text-brand-black/40">NO DATA</span>
  </div>
);

export default function StockAnalytics() {
  const { items } = useStock();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackingEntries, setTrackingEntries] = useState<InvenTreeTrackingEntry[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_RANGES[1]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      setLoading(true);
      setError(null);
      try {
        inventreeClient.invalidateCache('/stock/track/?limit=500&ordering=-date');
        const resp = await inventreeClient.getStockTracking(500);
        if (!cancelled) setTrackingEntries(resp.results);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tracking data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    doFetch();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // part_id → { name, sellingPrice (pricing_max), costPrice (pricing_min), category }
  const partLookup = useMemo(() => {
    const map = new Map<number, { name: string; sellingPrice: number; costPrice: number; category: string }>();
    items.forEach(item => {
      if (item.part_id != null && !map.has(item.part_id)) {
        map.set(item.part_id, {
          name: item.name,
          sellingPrice: item.price,   // pricing_max
          costPrice: item.cost,       // pricing_min
          category: item.category,
        });
      }
    });
    return map;
  }, [items]);

  // Filter entries by selected date range
  const filteredEntries = useMemo(() => {
    if (!dateRange.days) return trackingEntries;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dateRange.days);
    return trackingEntries.filter(e => new Date(e.date) >= cutoff);
  }, [trackingEntries, dateRange]);

  // Aggregate by part — profit = (pricing_max - pricing_min) × units removed
  const analytics = useMemo(() => {
    const byPartMap = new Map<number, PartAnalytics>();

    filteredEntries.forEach(entry => {
      const removed = entry.deltas?.removed ?? 0;
      const added = entry.deltas?.added ?? 0;
      if (removed === 0 && added === 0) return;

      const partId = entry.part;
      const info = partLookup.get(partId);
      const name = info?.name ?? `Part #${partId}`;
      const sellingPrice = info?.sellingPrice ?? 0;
      const costPrice = info?.costPrice ?? 0;
      const category = info?.category ?? 'Uncategorized';
      const margin = Math.max(0, sellingPrice - costPrice);

      const prev = byPartMap.get(partId) ?? {
        partId, name, sellingPrice, costPrice, category,
        removed: 0, added: 0, revenue: 0, profit: 0,
      };
      byPartMap.set(partId, {
        ...prev,
        removed: prev.removed + removed,
        added: prev.added + added,
        revenue: prev.revenue + removed * sellingPrice,
        profit: prev.profit + removed * margin,
      });
    });

    const byPart = Array.from(byPartMap.values());
    return {
      byPart,
      totalRemoved: byPart.reduce((s, p) => s + p.removed, 0),
      totalAdded: byPart.reduce((s, p) => s + p.added, 0),
      totalRevenue: byPart.reduce((s, p) => s + p.revenue, 0),
      totalProfit: byPart.reduce((s, p) => s + p.profit, 0),
      totalTransactions: filteredEntries.length,
      hasCostPrices: byPart.some(p => p.costPrice > 0),
    };
  }, [filteredEntries, partLookup]);

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
      ['STOCK ANALYTICS EXPORT'],
      [`Period: ${dateRange.label === 'ALL' ? 'All time' : `Last ${dateRange.days} days`}`],
      [`Exported: ${new Date().toISOString()}`],
      [],
      ['--- PART SUMMARY ---'],
      ['Part Name', 'Category', 'Units Removed', 'Units Added', 'Sell Price/unit (€)', 'Cost Price/unit (€)', 'Revenue (€)', 'Profit (€)'],
      ...analytics.byPart
        .sort((a, b) => b.removed - a.removed)
        .map(p => [
          p.name,
          p.category,
          String(p.removed),
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
  }, [analytics, byCategory, dateRange]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <span className="text-xs font-black uppercase tracking-widest text-brand-black/50 animate-pulse">
          LOADING TRACKING DATA...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="border border-red-600 p-6 max-w-sm text-center space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-red-600">ERROR LOADING DATA</p>
          <p className="text-xs text-brand-black/60">{error}</p>
          <button onClick={() => setRefreshKey(k => k + 1)} className="brutalist-button py-2 px-4 text-xs">
            RETRY
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'TRANSACTIONS', value: analytics.totalTransactions, icon: BarChart2, bg: 'bg-brand-beige-dark' },
    { label: 'UNITS OUT', value: analytics.totalRemoved, icon: TrendingDown, bg: 'bg-rose-50' },
    { label: 'REVENUE', value: `€${analytics.totalRevenue.toFixed(2)}`, icon: DollarSign, bg: 'bg-amber-50' },
    {
      label: analytics.hasCostPrices ? 'PROFIT' : 'PROFIT*',
      value: `€${analytics.totalProfit.toFixed(2)}`,
      icon: Percent,
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">

        {/* Header row */}
        <div className="border-b border-brand-black pb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-widest text-brand-black">ANALYTICS</h2>
            <p className="font-bold text-xs uppercase tracking-widest text-brand-black/60 mt-1">
              STOCK MOVEMENT & REVENUE — {dateRange.label === 'ALL' ? 'ALL TIME' : `LAST ${dateRange.label}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex border border-brand-black">
              {DATE_RANGES.map(range => (
                <button
                  key={range.label}
                  onClick={() => setDateRange(range)}
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-r border-brand-black last:border-r-0 transition-colors',
                    dateRange.label === range.label
                      ? 'bg-brand-black text-white'
                      : 'bg-brand-beige text-brand-black hover:bg-brand-beige-dark'
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button
              onClick={exportCSV}
              disabled={analytics.totalTransactions === 0}
              className="border border-brand-black px-3 py-1.5 hover:bg-brand-beige-dark transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export to CSV"
            >
              <Download size={12} />
              <span className="hidden sm:inline">EXPORT</span>
            </button>
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="border border-brand-black p-1.5 hover:bg-brand-beige-dark transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-brand-black divide-x divide-brand-black">
          {statCards.map((s, i) => (
            <div key={i} className={cn('p-4 flex flex-col gap-1', s.bg)}>
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-brand-black/60">
                <s.icon size={11} />
                {s.label}
              </div>
              <div className="text-2xl font-black font-mono text-brand-black leading-none tabular-nums">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {analytics.totalTransactions === 0 && (
          <div className="border border-brand-black p-8 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-brand-black/40">
              NO TRACKING EVENTS IN THIS PERIOD
            </p>
          </div>
        )}

        {analytics.totalTransactions > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Most consumed */}
            <Section title="MOST CONSUMED ITEMS" icon={TrendingDown}>
              {mostUsed.length === 0 ? EMPTY : mostUsed.map(item => (
                <BrutalistBar
                  key={item.partId}
                  label={item.name}
                  value={item.removed}
                  maxValue={mostUsed[0].removed}
                  color="bg-rose-400"
                />
              ))}
            </Section>

            {/* Top profit = (pricing_max - pricing_min) × units removed */}
            <Section title="TOP PROFIT ITEMS" icon={Percent}>
              {mostProfit.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-xs font-bold uppercase text-brand-black/40 text-center">
                    NO PROFIT DATA —<br />SET PRICING MIN &amp; MAX ON PARTS IN INVENTREE
                  </span>
                </div>
              ) : mostProfit.map(item => (
                <div key={item.partId}>
                  <BrutalistBar
                    label={item.name}
                    value={item.profit}
                    maxValue={mostProfit[0].profit}
                    prefix="€"
                    decimals={2}
                    color="bg-emerald-400"
                  />
                  {item.sellingPrice > 0 && item.costPrice > 0 && (
                    <div className="text-[9px] font-mono text-brand-black/40 pl-[calc(7rem+0.5rem)] sm:pl-[calc(9rem+0.75rem)] -mt-1.5 mb-1">
                      SELL €{item.sellingPrice.toFixed(2)} — COST €{item.costPrice.toFixed(2)} = €{(item.sellingPrice - item.costPrice).toFixed(2)}/unit
                    </div>
                  )}
                </div>
              ))}
            </Section>

            {/* Top revenue */}
            <Section title="TOP REVENUE ITEMS" icon={DollarSign}>
              {mostProfitable.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-xs font-bold uppercase text-brand-black/40 text-center">
                    NO REVENUE DATA —<br />ADD PRICES TO ITEMS
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

            {/* Most restocked */}
            <Section title="MOST RESTOCKED ITEMS" icon={TrendingUp}>
              {mostAdded.length === 0 ? EMPTY : mostAdded.map(item => (
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
            <Section title="BY CATEGORY (UNITS OUT)" icon={Package}>
              {byCategory.length === 0 ? EMPTY : byCategory.map(item => (
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
            * PROFIT REQUIRES PRICING MIN (COST) AND MAX (SELL) SET ON PARTS IN INVENTREE
          </p>
        )}

        <p className="text-[10px] font-mono text-brand-black/30 text-center pb-2">
          BASED ON {trackingEntries.length} MOST RECENT TRACKING ENTRIES
        </p>

      </div>
    </div>
  );
}
