import { useMemo } from 'react';
import { Zap, Users, Clock, Timer, UserCheck, Trash2, Euro } from 'lucide-react';
import { laserStats, lostLaserStats, type ServiceLine, type DiscardRow } from '../lib/services';
import { PRICING } from '../constants';
import { Section, Empty, StatCards } from './ui';
import type { DateRange } from './AnalyticsPage';

const fmtMinutes = (m: number) => {
  const r = Math.round(m);
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Paid laser sessions per person (sales orders) and time that never went through a paid session (laser service). */
export default function LaserTab({ serviceLines, discarded, loading, dateRange }: {
  serviceLines: ServiceLine[];
  discarded: DiscardRow[];
  loading: boolean;
  dateRange: DateRange;
}) {
  const days = dateRange.days ?? undefined;
  const laser = useMemo(() => laserStats(serviceLines, days), [serviceLines, days]);
  const lost = useMemo(() => lostLaserStats(discarded, PRICING.LASER_PER_MINUTE, days), [discarded, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-xs font-semibold text-brand-black/50 animate-pulse">Loading laser data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatCards cards={[
        { label: 'Sessions', value: laser.sessions, icon: Zap, bg: 'bg-brand-beige-dark' },
        { label: 'People', value: laser.people, icon: Users, bg: 'bg-brand-beige-dark' },
        { label: 'Laser time', value: fmtMinutes(laser.minutes), sub: `€${laser.revenue.toFixed(2)} paid`, icon: Clock, bg: 'bg-amber-50' },
        { label: 'Avg per session', value: laser.sessions ? fmtMinutes(laser.avgPerSession) : '–', icon: Timer, bg: 'bg-brand-beige-dark' },
        { label: 'Avg per person', value: laser.people ? fmtMinutes(laser.avgPerPerson) : '–', icon: UserCheck, bg: 'bg-brand-beige-dark' },
        {
          label: 'Not via session',
          value: fmtMinutes(lost.minutes),
          sub: lost.count ? `€${lost.value.toFixed(2)}, unknown if paid` : undefined,
          icon: Trash2,
          bg: lost.count ? 'bg-rose-50' : 'bg-brand-beige-dark',
        },
      ]} />

      <Section title="Paid laser time per person" icon={Euro}>
        {laser.perPerson.length === 0 ? <Empty text="No paid laser sessions in this period" /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-brand-black/60 border-b border-lijn">
                <th className="py-1.5 font-semibold">Person</th>
                <th className="py-1.5 font-semibold text-right">Sessions</th>
                <th className="py-1.5 font-semibold text-right">Time</th>
                <th className="py-1.5 font-semibold text-right">Avg</th>
                <th className="py-1.5 font-semibold text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              {laser.perPerson.map(p => (
                <tr key={p.name} className="border-b border-lijn-zacht">
                  <td className="py-1.5 font-semibold">{p.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.sessions}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMinutes(p.minutes)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMinutes(p.minutes / p.sessions)}</td>
                  <td className="py-1.5 text-right tabular-nums">€{p.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {laser.typedMinutes > 0 && (
          <p className="text-[10px] text-brand-black/50 mt-3">
            {fmtMinutes(laser.typedMinutes)} typed in at the till without a session (not per person)
          </p>
        )}
      </Section>

      <Section title="Laser time not paid via a session" icon={Trash2}>
        {lost.count === 0 ? <Empty text="All laser time in this period went through a session" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-black/60 border-b border-lijn">
                  <th className="py-1.5 font-semibold">When</th>
                  <th className="py-1.5 font-semibold">From</th>
                  <th className="py-1.5 font-semibold text-right">Time</th>
                  <th className="py-1.5 font-semibold text-right">Value</th>
                  <th className="py-1.5 font-semibold pl-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {lost.rows.map((r, i) => (
                  <tr key={i} className="border-b border-lijn-zacht">
                    <td className="py-1.5 tabular-nums whitespace-nowrap">{fmtDate(r.discarded_at)}</td>
                    <td className="py-1.5 font-semibold">{r.source === 'session' ? r.session_name : 'Unassigned'}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMinutes(r.seconds / 60)}</td>
                    <td className="py-1.5 text-right tabular-nums">€{(r.seconds / 60 * PRICING.LASER_PER_MINUTE).toFixed(2)}</td>
                    <td className="py-1.5 pl-4 text-brand-black/70">{r.reason ?? '–'}</td>
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
