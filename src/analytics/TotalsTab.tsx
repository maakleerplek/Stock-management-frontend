import { useMemo, useCallback } from 'react';
import { Sigma, Download, AlertTriangle } from 'lucide-react';
import type { InvenTreeTrackingEntry } from '../api/types';
import { itemAnalytics } from '../lib/itemAnalytics';
import { serviceRevenue, lostLaserStats, type ServiceLine, type DiscardRow } from '../lib/services';
import { buildTotals } from '../lib/totals';
import { PRICING } from '../constants';
import { cn } from '../lib/utils';
import { usePartLookup } from './usePartLookup';
import { Section } from './ui';
import type { DateRange } from './AnalyticsPage';

const eur = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toFixed(2)}`;
const fmtMinutes = (m: number) => {
  const r = Math.round(m);
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`;
};

/** Revenue, costs and profit of everything in the period, in one table. */
export default function TotalsTab({ trackingEntries, serviceLines, discarded, loading, trackingError, dateRange }: {
  trackingEntries: InvenTreeTrackingEntry[];
  serviceLines: ServiceLine[];
  discarded: DiscardRow[];
  loading: boolean;
  trackingError: string | null;
  dateRange: DateRange;
}) {
  const partLookup = usePartLookup();
  const days = dateRange.days ?? undefined;

  const totals = useMemo(() => buildTotals(
    itemAnalytics(trackingEntries, partLookup, 'all', days),
    serviceRevenue(serviceLines, days),
    lostLaserStats(discarded, PRICING.LASER_PER_MINUTE, days),
  ), [trackingEntries, partLookup, serviceLines, discarded, days]);

  const period = dateRange.days ? `Last ${dateRange.days} days` : 'All time';

  const exportCSV = useCallback(() => {
    const rows: string[][] = [
      ['Totals export'],
      [`Period: ${period}`],
      [`Exported: ${new Date().toISOString()}`],
      [],
      ['Source', 'Revenue (€)', 'Costs (€)', 'Profit (€)'],
      ...[...totals.rows, totals.total].map(r => [r.label, r.revenue.toFixed(2), r.costs.toFixed(2), r.profit.toFixed(2)]),
      [],
      ['Internal use for the open labs (not in total)', '', totals.internalUse.cost.toFixed(2), `${totals.internalUse.units} units`],
      ['Laser time not paid via a session (not in total)', totals.notViaSession.value.toFixed(2), `${Math.round(totals.notViaSession.minutes)} min`],
      ...totals.notes.map(n => [n]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `totals-${dateRange.days ? `last_${dateRange.days}d` : 'all_time'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [totals, period, dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-xs font-semibold text-brand-black/50 animate-pulse">Loading totals...</span>
      </div>
    );
  }

  const money = (n: number, bold = false) => (
    <td className={cn('py-2 text-right tabular-nums font-mono', bold && 'font-semibold', n < 0 && 'text-red-600')}>{eur(n)}</td>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={exportCSV}
          className="border border-lijn px-3 py-1.5 hover:bg-brand-beige-dark transition-colors flex items-center gap-1.5 text-[10px] font-semibold"
          title="Export to CSV"
        >
          <Download size={12} />
          Export
        </button>
      </div>

      {trackingError && (
        <p className="text-xs text-red-600 flex gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          Item sales could not be loaded ({trackingError}); the table only has the machine services.
        </p>
      )}

      <Section title={`Revenue, costs and profit — ${period.toLowerCase()}`} icon={Sigma}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-brand-black/60 border-b border-lijn">
                <th className="py-1.5 font-semibold">Source</th>
                <th className="py-1.5 font-semibold text-right">Revenue</th>
                <th className="py-1.5 font-semibold text-right">Costs</th>
                <th className="py-1.5 font-semibold text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {totals.rows.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-brand-black/40 font-bold">No sales in this period</td></tr>
              )}
              {totals.rows.map(r => (
                <tr key={r.label} className="border-b border-lijn-zacht">
                  <td className="py-2 font-semibold">{r.label}</td>
                  {money(r.revenue)}
                  {money(r.costs)}
                  {money(r.profit)}
                </tr>
              ))}
              <tr className="border-t-2 border-brand-black bg-brand-beige-dark">
                <td className="py-2 font-semibold">Total</td>
                {money(totals.total.revenue, true)}
                {money(totals.total.costs, true)}
                {money(totals.total.profit, true)}
              </tr>
            </tbody>
          </table>
        </div>

        {totals.internalUse.units > 0 && (
          <div className="mt-4 border border-lijn bg-brand-beige-dark px-3 py-2 flex flex-wrap justify-between gap-2 text-xs">
            <span className="font-semibold">Internal use (filament, ... for the open labs)</span>
            <span className="tabular-nums font-mono">{totals.internalUse.units} units · {eur(totals.internalUse.cost)}</span>
            <span className="w-full text-[10px] text-brand-black/60">
              Taken out of stock for the lab itself: not a loss, so not in the profit.
            </span>
          </div>
        )}

        {totals.notViaSession.minutes > 0 && (
          <div className="mt-4 border border-lijn bg-rose-50 px-3 py-2 flex flex-wrap justify-between gap-2 text-xs">
            <span className="font-semibold">Laser time not paid via a session</span>
            <span className="tabular-nums font-mono">
              {fmtMinutes(totals.notViaSession.minutes)} · {eur(totals.notViaSession.value)}
            </span>
            <span className="w-full text-[10px] text-brand-black/60">
              Maybe paid some other way, maybe not: not in the total. Details on the Laser tab.
            </span>
          </div>
        )}

        {totals.notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-[10px] text-brand-black/50">
            {totals.notes.map(n => <li key={n}>* {n}</li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}
