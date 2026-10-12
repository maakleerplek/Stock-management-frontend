import { useMemo, useCallback } from 'react';
import { Sigma, Download, AlertTriangle } from 'lucide-react';
import type { InvenTreeTrackingEntry } from '../api/types';
import { itemAnalytics } from '../lib/itemAnalytics';
import { serviceRevenue, laserLedger, DISCARD_KIND_LABELS, type ServiceLine, type DiscardRow, type LaserSessionRow, type LaserBucket } from '../lib/services';
import { buildTotals, type Totals } from '../lib/totals';
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
/** Deleted laser time that is usage (workshop / HTL, volunteer), for the box under the table; the rest counts as paid. */
const laserDeletedRows = (t: Totals) =>
  (Object.entries(t.laserDeleted) as [keyof Totals['laserDeleted'], LaserBucket][]).filter(([k, b]) => (k === 'workshop' || k === 'volunteer') && b.count > 0);

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
      ['Laser time in open sessions (not in total)', totals.laserUnpaid.value.toFixed(2), '', '', `${Math.round(totals.laserUnpaid.minutes)} min`],
      ...laserDeletedRows(totals).map(([k, b]) => [`Laser time deleted · ${DISCARD_KIND_LABELS[k]} (not in total)`, b.value.toFixed(2), '', '', `${Math.round(b.minutes)} min`]),
      ['Laser time not verified (not in total)', totals.laserUnverified.value.toFixed(2), '', '', `${Math.round(totals.laserUnverified.minutes)} min`],
      ['Profit if the open laser sessions get paid', '', '', totals.profitWithUnpaidLaser.toFixed(2)],
      ...(totals.printing.grams > 0 ? [
        ['3D printing (not in total): filament taken (g)', String(Math.round(totals.printing.grams))],
        ['3D printing paid at the till', totals.printing.paidRevenue.toFixed(2), '', '', `${Math.round(totals.printing.paidGrams)} g`],
        ['Profit if all filament is printed and paid', '', '', (totals.printing.potentialRevenue - totals.printing.cost).toFixed(2)],
      ] : []),
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

        {(totals.laserUnpaid.count > 0 || totals.laserUnverified.count > 0 || laserDeletedRows(totals).length > 0) && (
          <div className="mt-4 border border-lijn">
            <div className="px-3 py-1.5 bg-brand-beige-dark text-[10px] font-semibold text-brand-black/60">
              Laser time not on a paid sale (not in the total, details on the Laser tab)
            </div>
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-lijn-zacht bg-amber-50">
                  <td className="py-2 px-3 font-semibold">Open sessions, not paid yet</td>
                  <td className="py-2 text-right tabular-nums">{fmtMinutes(totals.laserUnpaid.minutes)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(totals.laserUnpaid.value)}</td>
                </tr>
                {laserDeletedRows(totals).map(([k, b]) => (
                  <tr key={k} className="border-b border-lijn-zacht">
                    <td className="py-2 px-3 font-semibold">Deleted · {DISCARD_KIND_LABELS[k]}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMinutes(b.minutes)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(b.value)}</td>
                  </tr>
                ))}
                <tr className="border-b border-lijn-zacht bg-rose-50">
                  <td className="py-2 px-3 font-semibold">Not verified</td>
                  <td className="py-2 text-right tabular-nums">{fmtMinutes(totals.laserUnverified.minutes)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(totals.laserUnverified.value)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold">Profit if the open sessions get paid</td>
                  <td />
                  <td className={cn('py-2 px-3 text-right tabular-nums font-mono font-semibold', totals.profitWithUnpaidLaser < 0 && 'text-red-600')}>
                    {eur(totals.profitWithUnpaidLaser)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-[10px] text-brand-black/60">
              Deleted sessions count as paid outside the checkout (in the total above), except workshop / HTL and volunteer use.
              Not verified: time reset without a session, the counter now, or a session whose sales order was cancelled.
            </p>
          </div>
        )}

        {totals.printing.grams > 0 && (() => {
          const p = totals.printing;
          const kg = (g: number) => `${(g / 1000).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} kg`;
          return (
            <div className="mt-4 border border-lijn">
              <div className="px-3 py-1.5 bg-brand-beige-dark text-[10px] font-semibold text-brand-black/60">
                3D printing: lab filament against paid prints (not in the total)
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-lijn-zacht">
                    <td className="py-2 px-3 font-semibold">Filament taken for the printers (cost, in the total)</td>
                    <td className="py-2 text-right tabular-nums">{kg(p.grams)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(-p.cost)}</td>
                  </tr>
                  <tr className="border-b border-lijn-zacht">
                    <td className="py-2 px-3 font-semibold">3D printing paid at the till</td>
                    <td className="py-2 text-right tabular-nums">{kg(p.paidGrams)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(p.paidRevenue)}</td>
                  </tr>
                  <tr className="border-b border-lijn-zacht bg-amber-50">
                    <td className="py-2 px-3 font-semibold">Not paid in the system (paid elsewhere, or not printed yet)</td>
                    <td className="py-2 text-right tabular-nums">{kg(Math.max(0, p.grams - p.paidGrams))}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(Math.max(0, p.potentialRevenue - p.paidRevenue))}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Profit if all of it is printed and paid</td>
                    <td />
                    <td className="py-2 px-3 text-right tabular-nums font-mono font-semibold">{eur(p.potentialRevenue - p.cost)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="px-3 py-1.5 text-[10px] text-brand-black/60">
                At €{PRICING.PRINTING_PER_GRAM.toFixed(2)} per gram; spool weight from the product name (1 kg when it does not say).
              </p>
            </div>
          );
        })()}

        {totals.notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-[10px] text-brand-black/50">
            {totals.notes.map(n => <li key={n}>* {n}</li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}
