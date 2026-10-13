import { useMemo } from 'react';
import { Drill, Clock, Euro, Hourglass } from 'lucide-react';
import { cncStats, type ServiceLine } from '../lib/services';
import { Section, Empty, StatCards } from './ui';
import type { DateRange } from './AnalyticsPage';

const fmtMinutes = (m: number) => {
  const r = Math.round(m);
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`;
};

/** CNC time paid at the till (stock app and touch kiosk), per job. */
export default function CncTab({ serviceLines, loading, dateRange }: { serviceLines: ServiceLine[]; loading: boolean; dateRange: DateRange }) {
  const cnc = useMemo(() => cncStats(serviceLines, dateRange.days ?? undefined), [serviceLines, dateRange]);
  if (loading) {
    return <div className="flex items-center justify-center p-8"><span className="text-xs font-semibold text-brand-black/50 animate-pulse">Loading CNC data...</span></div>;
  }
  return (
    <div className="space-y-6">
      <StatCards cards={[
        { label: 'Jobs paid', value: cnc.jobs.length, icon: Drill, bg: 'bg-brand-beige-dark' },
        { label: 'CNC time paid', value: fmtMinutes(cnc.minutes), icon: Clock, bg: 'bg-brand-beige-dark' },
        { label: 'Revenue', value: `€${cnc.revenue.toFixed(2)}`, icon: Euro, bg: 'bg-green-50' },
        { label: 'Avg per job', value: cnc.jobs.length ? fmtMinutes(cnc.avgMinutes) : '–', icon: Hourglass, bg: 'bg-brand-beige-dark' },
      ]} />
      <Section title="CNC jobs" icon={Drill}>
        {cnc.jobs.length === 0 ? <Empty text="No CNC time paid in this period. It is paid in the checkout under CNC, or at the touch kiosk." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-black/60 border-b border-lijn">
                  <th className="py-1.5 font-semibold">When</th>
                  <th className="py-1.5 font-semibold">Order</th>
                  <th className="py-1.5 font-semibold text-right">Time</th>
                  <th className="py-1.5 font-semibold text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {cnc.jobs.map((j, i) => (
                  <tr key={i} className="border-b border-lijn-zacht">
                    <td className="py-1.5 tabular-nums whitespace-nowrap">{j.date ? new Date(j.date).toLocaleDateString('nl-BE') : '–'}</td>
                    <td className="py-1.5 font-mono">{j.order || '–'}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMinutes(j.minutes)}</td>
                    <td className="py-1.5 text-right tabular-nums">€{j.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
