import { useMemo } from 'react';
import { Cuboid, Euro, Package, Users, Hourglass, TrendingUp } from 'lucide-react';
import type { InvenTreeTrackingEntry } from '../api/types';
import { itemAnalytics } from '../lib/itemAnalytics';
import { COUNTED, laserLedger, printsByMaterial, volunteerPrints, type ServiceLine } from '../lib/services';
import { buildTotals, type PrintMaterial, type Printing } from '../lib/totals';
import { useRates } from '../lib/checkoutApi';
import { cn } from '../lib/utils';
import { usePartLookup } from './usePartLookup';
import { Section, Empty, StatCards } from './ui';
import type { DateRange } from './AnalyticsPage';

const eur = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toFixed(2)}`;
const g = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} kg` : `${Math.round(n)} g`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** 3D printing as on the laser tab: what was paid, what volunteers printed, filament taken that has no print booked yet,
 *  and the real profit (paid minus the filament taken). No "if everything gets paid": that rarely happens. */
export default function PrintTab({ trackingEntries, serviceLines, loading, dateRange }: {
  trackingEntries: InvenTreeTrackingEntry[];
  serviceLines: ServiceLine[];
  loading: boolean;
  dateRange: DateRange;
}) {
  const partLookup = usePartLookup();
  const days = dateRange.days ?? undefined;
  // 3D-print price per gram per filament (InvenTree parameter), by name like the print lines.
  const rates = useRates();
  const defaultPerGram = rates?.print.default_per_gram ?? 0;
  const pricePerGram = useMemo(() => Object.fromEntries(
    Object.entries(rates?.print.per_gram ?? {}).flatMap(([id, price]) => { const n = partLookup.get(Number(id))?.name; return n ? [[n, price]] : []; }),
  ), [rates, partLookup]);
  const p = useMemo(() => buildTotals(
    itemAnalytics(trackingEntries, partLookup, 'all', days),
    [],
    laserLedger([], [], [], 0, 0, days),
    printsByMaterial(serviceLines, days),
    pricePerGram, defaultPerGram,
  ).printing, [trackingEntries, partLookup, serviceLines, days, pricePerGram, defaultPerGram]);

  // Every 3D print booked at the till in this period, newest first; €0 = volunteer / workshop.
  const prints = useMemo(() => {
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return serviceLines
      .filter(l => /^3d print/i.test(l.reference) && COUNTED.has(l.orderStatus) && (!since || (!!l.date && new Date(l.date).getTime() >= since)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [serviceLines, days]);
  const vol = volunteerPrints(serviceLines, days);
  const volByMaterial = new Map<string, number>();
  for (const l of prints) if (l.price <= 0) {
    const name = l.description.trim() || 'Unknown material';
    volByMaterial.set(name, (volByMaterial.get(name) ?? 0) + l.quantity);
  }
  // Filament taken for the printers that no paid or volunteer print accounts for (yet).
  const notBooked = (m: PrintMaterial | Printing, volGrams: number) => Math.max(0, m.grams - m.paidGrams - volGrams);
  const notBookedTotal = notBooked(p, vol.grams);
  const profit = p.paidRevenue - p.cost;

  if (loading) {
    return <div className="flex items-center justify-center p-8"><span className="text-xs font-semibold text-brand-black/50 animate-pulse">Loading 3D printing data...</span></div>;
  }

  const row = (m: PrintMaterial | Printing, label: string, volGrams: number, bold = false) => {
    const open = notBooked(m, volGrams);
    const mProfit = m.paidRevenue - m.cost;
    return (
      <tr key={label} className={cn('border-b border-lijn-zacht', bold && 'font-semibold bg-brand-beige')}>
        <td className="py-1.5 pr-4 font-semibold">{label}</td>
        <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{g(m.paidGrams)} · {eur(m.paidRevenue)}</td>
        <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{volGrams ? g(volGrams) : '–'}</td>
        <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{m.grams ? `${g(m.grams)} · ${eur(-m.cost)}` : '–'}</td>
        <td className={cn('py-1.5 pl-4 text-right tabular-nums whitespace-nowrap', open > 0 && 'text-amber-700')}>{open ? g(open) : '–'}</td>
        <td className={cn('py-1.5 pl-4 text-right tabular-nums whitespace-nowrap font-mono', mProfit < 0 ? 'text-red-600' : 'text-emerald-700')}>{eur(mProfit)}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <StatCards cards={[
        { label: 'Prints paid', value: p.prints, icon: Cuboid, bg: 'bg-brand-beige-dark' },
        { label: 'Paid', value: g(p.paidGrams), sub: `${eur(p.paidRevenue)}${p.paidGrams ? ` · €${(p.paidRevenue / p.paidGrams).toFixed(3)}/g` : ''}`, icon: Euro, bg: 'bg-green-50' },
        { label: 'Volunteer / workshop', value: g(vol.grams), sub: `${vol.prints} print${vol.prints === 1 ? '' : 's'} · €${(vol.grams * defaultPerGram).toFixed(2)}`, icon: Users, bg: 'bg-brand-beige-dark' },
        { label: 'Filament taken for the printers', value: g(p.grams), sub: `cost ${eur(p.cost)}`, icon: Package, bg: 'bg-brand-beige-dark' },
        { label: 'Taken, no print booked yet', value: g(notBookedTotal), sub: 'still on the spool, or not paid', icon: Hourglass, bg: notBookedTotal ? 'bg-amber-50' : 'bg-brand-beige-dark' },
        { label: 'Profit (paid − filament)', value: eur(profit), icon: TrendingUp, bg: profit < 0 ? 'bg-rose-50' : 'bg-green-50' },
      ]} />

      <Section title="3D prints" icon={Cuboid}>
        {prints.length === 0 ? <Empty text="No 3D prints booked in this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-black/60 border-b border-lijn">
                  <th className="py-1.5 pr-4 font-semibold">When</th>
                  <th className="py-1.5 font-semibold">Filament</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">Weight</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">Value</th>
                  <th className="py-1.5 pl-4 font-semibold">Status</th>
                  <th className="py-1.5 pl-4 font-semibold">Order</th>
                </tr>
              </thead>
              <tbody>
                {prints.map((l, i) => (
                  <tr key={i} className="border-b border-lijn-zacht">
                    <td className="py-1.5 pr-4 tabular-nums whitespace-nowrap">{l.date ? fmtDate(l.date) : '–'}</td>
                    <td className="py-1.5 font-semibold">{l.description.trim() || 'Unknown material'}</td>
                    <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{g(l.quantity)}</td>
                    <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">
                      {l.price > 0 ? eur(l.quantity * l.price) : <span className="text-brand-black/50">€{(l.quantity * defaultPerGram).toFixed(2)}</span>}
                    </td>
                    <td className="py-1.5 pl-4 whitespace-nowrap">{l.price > 0 ? 'Paid' : 'Volunteer / workshop'}</td>
                    <td className="py-1.5 pl-4 text-brand-black/70 tabular-nums">{l.order ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Per filament" icon={Package}>
        {p.byMaterial.length === 0 && !volByMaterial.size ? <Empty text="No filament taken and no prints booked in this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-black/60 border-b border-lijn">
                  <th className="py-1.5 pr-4 font-semibold">Filament</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">Paid</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">Volunteer</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">Taken for the printers</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">No print booked yet</th>
                  <th className="py-1.5 pl-4 font-semibold text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {p.byMaterial.map(m => row(m, m.material, volByMaterial.get(m.material) ?? 0))}
                {p.byMaterial.length > 1 && row(p, 'Total', vol.grams, true)}
              </tbody>
            </table>
            <p className="mt-3 text-[10px] text-brand-black/50">
              "Taken for the printers" = filament taken out of stock for the printers (its cost). "No print booked yet" = taken,
              but no paid or volunteer print for it yet: still on the spool, or printed without paying. Profit = paid − filament taken.
              Volunteer value at €{defaultPerGram.toFixed(2)}/g.
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
