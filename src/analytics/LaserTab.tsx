import { useMemo } from 'react';
import { Zap, Users, Clock, Timer, Trash2, Euro } from 'lucide-react';
import { laserStats, lostLaserStats, laserLedger, type ServiceLine, type DiscardRow, type LaserSessionRow } from '../lib/services';
import { PRICING } from '../constants';
import { cn } from '../lib/utils';
import { Section, Empty, StatCards } from './ui';
import type { DateRange } from './AnalyticsPage';
import LaserFeedback from './LaserFeedback';

const fmtMinutes = (m: number) => {
  const r = Math.round(m);
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Paid laser sessions per person (sales orders) and time that never went through a paid session (laser service). */
export default function LaserTab({ serviceLines, discarded, laserSessions, loading, dateRange, refreshKey }: {
  serviceLines: ServiceLine[];
  discarded: DiscardRow[];
  laserSessions: { sessions: LaserSessionRow[]; unassignedSeconds: number };
  loading: boolean;
  dateRange: DateRange;
  refreshKey: number;
}) {
  const days = dateRange.days ?? undefined;
  const laser = useMemo(() => laserStats(serviceLines, days), [serviceLines, days]);
  const lost = useMemo(() => lostLaserStats(discarded, PRICING.LASER_PER_MINUTE, days), [discarded, days]);
  const ledger = useMemo(
    () => laserLedger(laserSessions.sessions, discarded, serviceLines, laserSessions.unassignedSeconds, PRICING.LASER_PER_MINUTE, days),
    [laserSessions, discarded, serviceLines, days],
  );
  const openSessions = laserSessions.sessions.filter(s => !s.paid_at && s.total_time > 0
    && (!days || new Date(s.created) >= new Date(Date.now() - days * 86_400_000)));
  // Everyone with paid or unpaid time, most minutes first.
  const people = new Map<string, { name: string; sessions: number; minutes: number; revenue: number; unpaid: number }>();
  for (const p of laser.perPerson) people.set(p.name.toLowerCase().replace(/\s+/g, ' '), { ...p, unpaid: 0 });
  for (const [key, u] of ledger.unpaidPerPerson) {
    const p = people.get(key) ?? { name: u.name, sessions: 0, minutes: 0, revenue: 0, unpaid: 0 };
    p.unpaid += u.minutes;
    people.set(key, p);
  }
  const perPerson = [...people.values()].sort((a, b) => (b.minutes + b.unpaid) - (a.minutes + a.unpaid));

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
        { label: 'Paid', value: fmtMinutes(laser.minutes), sub: `€${laser.revenue.toFixed(2)}`, icon: Euro, bg: 'bg-green-50' },
        { label: 'Assigned, not paid', value: fmtMinutes(ledger.unpaid.minutes), sub: `€${ledger.unpaid.value.toFixed(2)}`, icon: Clock, bg: ledger.unpaid.count ? 'bg-amber-50' : 'bg-brand-beige-dark' },
        { label: 'Not verified', value: fmtMinutes(ledger.unverified.minutes), sub: `€${ledger.unverified.value.toFixed(2)}`, icon: Trash2, bg: ledger.unverified.count ? 'bg-rose-50' : 'bg-brand-beige-dark' },
        {
          label: 'All laser time',
          value: fmtMinutes(laser.minutes + ledger.unpaid.minutes + ledger.unverified.minutes),
          sub: laser.sessions ? `avg ${fmtMinutes(laser.avgPerSession)} per paid session` : undefined,
          icon: Timer,
          bg: 'bg-brand-beige-dark',
        },
      ]} />

      <Section title="Laser time per person" icon={Euro}>
        {perPerson.length === 0 ? <Empty text="No laser sessions in this period" /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-brand-black/60 border-b border-lijn">
                <th className="py-1.5 font-semibold">Person</th>
                <th className="py-1.5 font-semibold text-right">Sessions</th>
                <th className="py-1.5 font-semibold text-right">Time</th>
                <th className="py-1.5 font-semibold text-right">Avg</th>
                <th className="py-1.5 font-semibold text-right">Paid</th>
                <th className="py-1.5 font-semibold text-right">Not paid</th>
              </tr>
            </thead>
            <tbody>
              {perPerson.map(p => (
                <tr key={p.name} className="border-b border-lijn-zacht">
                  <td className="py-1.5 font-semibold">{p.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.sessions}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMinutes(p.minutes)}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.sessions ? fmtMinutes(p.minutes / p.sessions) : '–'}</td>
                  <td className="py-1.5 text-right tabular-nums">€{p.revenue.toFixed(2)}</td>
                  <td className={cn('py-1.5 text-right tabular-nums', p.unpaid > 0 && 'text-amber-700 font-semibold')}>
                    {p.unpaid > 0 ? `${fmtMinutes(p.unpaid)} · €${(p.unpaid * PRICING.LASER_PER_MINUTE).toFixed(2)}` : '–'}
                  </td>
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

      <Section title="Laser time cleared without a sale" icon={Trash2}>
        {lost.count === 0 && openSessions.length === 0 ? <Empty text="All laser time in this period went through a sale" /> : (
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
                {openSessions.map(s => (
                  <tr key={s.created + s.name} className="border-b border-lijn-zacht bg-amber-50">
                    <td className="py-1.5 tabular-nums whitespace-nowrap">{fmtDate(s.created)}</td>
                    <td className="py-1.5 font-semibold">{s.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMinutes(s.total_time / 60)}</td>
                    <td className="py-1.5 text-right tabular-nums">€{(s.total_time / 60 * PRICING.LASER_PER_MINUTE).toFixed(2)}</td>
                    <td className="py-1.5 pl-4 text-brand-black/70">Open session, not paid yet</td>
                  </tr>
                ))}
                {lost.rows.map((r, i) => (
                  <tr key={i} className="border-b border-lijn-zacht">
                    <td className="py-1.5 tabular-nums whitespace-nowrap">{fmtDate(r.discarded_at)}</td>
                    <td className="py-1.5 font-semibold">{r.source === 'session' ? `${r.session_name} (assigned)` : 'Unassigned (not verified)'}</td>
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

      <LaserFeedback days={dateRange.days} refreshKey={refreshKey} />
    </div>
  );
}
