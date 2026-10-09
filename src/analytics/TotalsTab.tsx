import { useMemo, useCallback } from 'react';
import { Sigma, Download, AlertTriangle } from 'lucide-react';
import type { InvenTreeTrackingEntry } from '../api/types';
import { itemAnalytics } from '../lib/itemAnalytics';
import { serviceRevenue, laserLedger, type ServiceLine, type DiscardRow, type LaserSessionRow } from '../lib/services';
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
export default function TotalsTab({ trackingEntries, serviceLines, discarded, laserSessions, loading, trackingError, dateRange }: {
  trackingEntries: InvenTreeTrackingEntry[];
  serviceLines: ServiceLine[];
  discarded: DiscardRow[];
  laserSessions: { sessions: LaserSessionRow[]; unassignedSeconds: number };
  loading: boolean;
  trackingError: string | null;
  dateRange: DateRange;
}) {
  const partLookup = usePartLookup();
  const days = dateRange.days ?? undefined;

  const totals = useMemo(() => buildTotals(
    itemAnalytics(trackingEntries, partLookup, 'all', days),
    serviceRevenue(serviceLines, days),
    laserLedger(laserSessions.sessions, discarded, serviceLines, laserSessions.unassignedSeconds, PRICING.LASER_PER_MINUTE, days),
  ), [trackingEntries, partLookup, serviceLines, discarded, laserSessions, days]);

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
      ['Laser time assigned, not paid (not in total)', totals.laserUnpaid.value.toFixed(2), '', '', `${Math.round(totals.laserUnpaid.minutes)} min`],
      ['Laser time not verified (not in total)', totals.laserUnverified.value.toFixed(2), '', '', `${Math.round(totals.laserUnverified.minutes)} min`],
      ['Profit if the assigned laser time gets paid', '', '', totals.profitWithUnpaidLaser.toFixed(2)],
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

        {(totals.laserUnpaid.count > 0 || totals.laserUnverified.count > 0) && (
          <div className="mt-4 border border-lijn">
            <div className="px-3 py-1.5 bg-brand-beige-dark text-[10px] font-semibold text-brand-black/60">
              Laser time not on a paid sale (not in the total, details on the Laser tab)
            </div>
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-lijn-zacht bg-amber-50">
                  <td className="py-2 px-3 font-semibold">Assigned, not paid</td>
                  <td className="py-2 text-right tabular-nums">{fmtMinutes(totals.laserUnpaid.minutes)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(totals.laserUnpaid.value)}</td>
                </tr>
                <tr className="border-b border-lijn-zacht bg-rose-50">
                  <td className="py-2 px-3 font-semibold">Not verified</td>
                  <td className="py-2 text-right tabular-nums">{fmtMinutes(totals.laserUnverified.minutes)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(totals.laserUnverified.value)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold">Profit if the assigned time gets paid</td>
                  <td />
                  <td className={cn('py-2 px-3 text-right tabular-nums font-mono font-semibold', totals.profitWithUnpaidLaser < 0 && 'text-red-600')}>
                    {eur(totals.profitWithUnpaidLaser)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-[10px] text-brand-black/60">
              Assigned: open or deleted sessions with a name. Not verified: time reset without a session, the counter now,
              or a session whose sales order was cancelled.
            </p>
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
