import { useMemo } from 'react';
import { Printer, Euro, Weight, Package, Users } from 'lucide-react';
import type { InvenTreeTrackingEntry } from '../api/types';
import { itemAnalytics } from '../lib/itemAnalytics';
import { laserLedger, printsByMaterial, volunteerPrints, type ServiceLine } from '../lib/services';
import { buildTotals, type PrintMaterial, type Printing } from '../lib/totals';
import { useRates } from '../lib/checkoutApi';
import { cn } from '../lib/utils';
import { usePartLookup } from './usePartLookup';
import { Section, StatCards } from './ui';
import type { DateRange } from './AnalyticsPage';

const eur = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toFixed(2)}`;

/** 3D printing: prints paid at the till per filament, against the filament taken for the printers. */
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

  const vol = volunteerPrints(serviceLines, days);
  if (loading) {
    return <div className="flex items-center justify-center p-8"><span className="text-xs font-semibold text-brand-black/50 animate-pulse">Loading 3D printing data...</span></div>;
  }
  const g = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} kg` : `${Math.round(n)} g`;
  const row = (m: PrintMaterial | Printing, label: string, bold = false) => (
    <tr key={label} className={cn('border-b border-lijn-zacht', bold && 'font-semibold bg-brand-beige')}>
      <td className="py-2 px-3 font-semibold">{label}</td>
      <td className="py-2 text-right tabular-nums">{g(m.grams)} · {eur(-m.cost)}</td>
      <td className="py-2 text-right tabular-nums">{g(m.paidGrams)} · {eur(m.paidRevenue)}</td>
      <td className={cn('py-2 text-right tabular-nums', m.grams > m.paidGrams && 'text-amber-700')}>{g(Math.max(0, m.grams - m.paidGrams))}</td>
      <td className="py-2 px-3 text-right tabular-nums font-mono">{eur(Math.max(m.potentialRevenue, m.paidRevenue) - m.cost)}</td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <StatCards cards={[
        { label: 'Prints paid', value: p.prints, icon: Printer, bg: 'bg-brand-beige-dark' },
        { label: 'Paid at the till', value: g(p.paidGrams), sub: eur(p.paidRevenue), icon: Euro, bg: 'bg-green-50' },
        { label: 'Avg price per gram', value: p.paidGrams ? `€${(p.paidRevenue / p.paidGrams).toFixed(3)}` : '–', icon: Weight, bg: 'bg-brand-beige-dark' },
        { label: 'Filament taken for the printers', value: g(p.grams), sub: `cost ${eur(p.cost)}`, icon: Package, bg: p.grams > p.paidGrams ? 'bg-amber-50' : 'bg-brand-beige-dark' },
        { label: 'Volunteer prints (free, at the kiosk)', value: g(vol.grams), sub: `${vol.prints} print${vol.prints === 1 ? '' : 's'}`, icon: Users, bg: 'bg-brand-beige-dark' },
      ]} />
      <Section title="3D printing per filament" icon={Printer}>
        <div className="border border-lijn overflow-x-auto">
          <div className="px-3 py-1.5 bg-brand-beige-dark text-[10px] font-semibold text-brand-black/60">
            3D printing per filament (not in the total)
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-brand-black/60 border-b border-lijn">
                <th className="py-1.5 px-3 text-left font-semibold">Filament</th>
                <th className="py-1.5 text-right font-semibold">Taken for the printers</th>
                <th className="py-1.5 text-right font-semibold">Paid at the till</th>
                <th className="py-1.5 text-right font-semibold">Not paid in the system</th>
                <th className="py-1.5 px-3 text-right font-semibold">Profit if all is paid</th>
              </tr>
            </thead>
            <tbody>
              {p.byMaterial.length === 0 && (
                <tr><td colSpan={5} className="py-3 px-3 text-brand-black/60">
                  No filament taken for the printers and no 3D prints paid in this period. Prints are paid in the
                  checkout under 3D printing (filament + grams); filament for the printers is taken out in the Free tab.
                </td></tr>
              )}
              {p.byMaterial.map(m => row(m, m.material))}
              {p.byMaterial.length > 1 && row(p, 'Total', true)}
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-[10px] text-brand-black/60">
            {p.prints} print{p.prints === 1 ? '' : 's'} paid at the till. "Not paid in the system": paid elsewhere, or not printed yet.
            Price per gram from the filament's "3D-print prijs per gram" in InvenTree, else €{defaultPerGram.toFixed(2)};
            spool weight from the product name (1 kg when it does not say).
          </p>
        </div>
      </Section>
    </div>
  );
}
