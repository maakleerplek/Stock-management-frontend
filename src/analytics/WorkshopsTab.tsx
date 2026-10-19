import { useEffect, useState } from 'react';
import { CalendarDays, GraduationCap, Users } from 'lucide-react';
import { htlWorkshops, type Workshop } from '../lib/workshops';
import { Section, Empty, StatCards } from './ui';

/** Upcoming HTL workshops from the public agenda (via the TV). Attendees follow with Odoo access. */
export default function WorkshopsTab({ refreshKey }: { refreshKey: number }) {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/tv/api/screen-data')
      .then(res => { if (!res.ok) throw new Error(`TV data: ${res.status}`); return res.json(); })
      .then(data => { if (!cancelled) setWorkshops(htlWorkshops(data)); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load workshops'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return <div className="flex items-center justify-center p-8"><span className="text-xs font-semibold text-brand-black/50 animate-pulse">Loading workshops...</span></div>;
  }
  return (
    <div className="space-y-6">
      <StatCards cards={[
        { label: 'Upcoming HTL workshops', value: workshops.length, icon: GraduationCap, bg: 'bg-brand-beige-dark' },
        { label: 'Attendees', value: '–', sub: 'needs Odoo access', icon: Users, bg: 'bg-brand-beige-dark' },
      ]} />
      <Section title="Upcoming workshops (High Tech Lab)" icon={CalendarDays}>
        {error ? <Empty text={`Could not load the agenda: ${error}`} /> : workshops.length === 0 ? <Empty text="No HTL workshops on the agenda." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-brand-black/60 border-b border-lijn">
                  <th className="py-1.5 font-semibold">When</th>
                  <th className="py-1.5 font-semibold">Workshop</th>
                  <th className="py-1.5 font-semibold text-right">Price</th>
                  <th className="py-1.5 font-semibold text-right">Attendees</th>
                </tr>
              </thead>
              <tbody>
                {workshops.map(w => (
                  <tr key={`${w.slug}-${w.dateISO}`} className="border-b border-lijn-zacht">
                    <td className="py-1.5 tabular-nums whitespace-nowrap">{new Date(w.dateISO).toLocaleDateString('nl-BE')} {w.time}</td>
                    <td className="py-1.5"><a href={w.link} target="_blank" rel="noreferrer" className="underline">{w.title}</a></td>
                    <td className="py-1.5 text-right tabular-nums">{w.price || '–'}</td>
                    <td className="py-1.5 text-right tabular-nums">–</td>
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
