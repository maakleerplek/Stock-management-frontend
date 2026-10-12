import { useMemo } from 'react';
import { Zap, Users, Clock, Timer, Trash2, Euro, Wrench, Hourglass } from 'lucide-react';
import { laserStats, lostLaserStats, laserLedger, laserSessionList, sessionUse, SESSION_STATUS_LABELS, type ServiceLine, type DiscardRow, type LaserSessionRow } from '../lib/services';
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

/** Laser use per session (the name is a person or a project), what was paid, and time not on any session. */
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
  const sessions = useMemo(
    () => laserSessionList(laserSessions.sessions, discarded, serviceLines, days),
    [laserSessions, discarded, serviceLines, days],
  );
  const use = sessionUse(sessions);
  const resets = lost.rows.filter(r => r.source === 'unassigned');
  const { paid: paidOutside, workshop, volunteer, other, none } = ledger.deleted;
  const notPaid = { minutes: ledger.unpaid.minutes + other.minutes + none.minutes, value: ledger.unpaid.value + other.value + none.value };

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
        { label: 'Sessions (excl. workshop / HTL)', value: use.count, icon: Zap, bg: 'bg-brand-beige-dark' },
        { label: 'Avg per session (excl. workshop / HTL)', value: use.count ? fmtMinutes(use.avgMinutes) : '–', icon: Hourglass, bg: 'bg-brand-beige-dark' },
        { label: 'Paid', value: fmtMinutes(laser.minutes + paidOutside.minutes), sub: `€${(laser.revenue + paidOutside.value).toFixed(2)}`, icon: Euro, bg: 'bg-green-50' },
        { label: 'Workshop / HTL', value: fmtMinutes(workshop.minutes), sub: `€${workshop.value.toFixed(2)}`, icon: Wrench, bg: 'bg-brand-beige-dark' },
        { label: 'Volunteer (own credit)', value: fmtMinutes(volunteer.minutes), sub: `€${volunteer.value.toFixed(2)}`, icon: Users, bg: 'bg-brand-beige-dark' },
        { label: 'Open / not paid', value: fmtMinutes(notPaid.minutes), sub: `€${notPaid.value.toFixed(2)}`, icon: Clock, bg: notPaid.minutes ? 'bg-amber-50' : 'bg-brand-beige-dark' },
        { label: 'Not verified', value: fmtMinutes(ledger.unverified.minutes), sub: `€${ledger.unverified.value.toFixed(2)}`, icon: Trash2, bg: ledger.unverified.count ? 'bg-rose-50' : 'bg-brand-beige-dark' },
        {
          label: 'All laser time',
          value: fmtMinutes(laser.minutes + paidOutside.minutes + workshop.minutes + volunteer.minutes + notPaid.minutes + ledger.unverified.minutes),
          icon: Timer,
          bg: 'bg-brand-beige-dark',
        },
      ]} />

      <Section title="Laser sessions" icon={Zap}>
        {sessions.length === 0 ? <Empty text="No laser sessions in this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-black/60 border-b border-lijn">
                  <th className="py-1.5 font-semibold">When</th>
                  <th className="py-1.5 font-semibold">Name / project</th>
                  <th className="py-1.5 font-semibold text-right">Time</th>
                  <th className="py-1.5 font-semibold text-right">Value</th>
                  <th className="py-1.5 font-semibold pl-4">Status</th>
                  <th className="py-1.5 font-semibold pl-4">Note</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i} className={cn('border-b border-lijn-zacht', (s.status === 'open' || s.status === 'none' || s.status === 'other') && 'bg-amber-50')}>
                    <td className="py-1.5 tabular-nums whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="py-1.5 font-semibold">{s.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMinutes(s.minutes)}</td>
                    <td className="py-1.5 text-right tabular-nums">€{(s.minutes * PRICING.LASER_PER_MINUTE).toFixed(2)}</td>
                    <td className="py-1.5 pl-4 whitespace-nowrap">{SESSION_STATUS_LABELS[s.status]}</td>
                    <td className="py-1.5 pl-4 text-brand-black/70">{s.reason ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {laser.typedMinutes > 0 && (
          <p className="text-[10px] text-brand-black/50 mt-3">
            Also {fmtMinutes(laser.typedMinutes)} typed in at the till without a session (paid, not in this list).
          </p>
        )}
      </Section>

      {resets.length > 0 && (
        <Section title="Time not on any session (counter reset)" icon={Trash2}>
          <table className="w-full text-xs">
            <tbody>
              {resets.map((r, i) => (
                <tr key={i} className="border-b border-lijn-zacht">
                  <td className="py-1.5 tabular-nums whitespace-nowrap">{fmtDate(r.discarded_at)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMinutes(r.seconds / 60)}</td>
                  <td className="py-1.5 text-right tabular-nums">€{(r.seconds / 60 * PRICING.LASER_PER_MINUTE).toFixed(2)}</td>
                  <td className="py-1.5 pl-4 text-brand-black/70">{r.reason ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <LaserFeedback days={dateRange.days} refreshKey={refreshKey} />
    </div>
  );
}
