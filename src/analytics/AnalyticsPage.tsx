import { useState, useEffect } from 'react';
import { Cuboid, Drill, GraduationCap, Package, RefreshCw, Sigma, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { SegmentedButtons } from './ui';
import LaserFeedback from './LaserFeedback';

const DATE_RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: null },
] as const;

// Each tab is one provisioned Grafana dashboard (grafana/provisioning/dashboards/json/<uid>.json).
const TABS = [
  { id: 'totals', label: 'Totals', icon: Sigma, subtitle: 'Revenue, costs and profit' },
  { id: 'items', label: 'Items', icon: Package, subtitle: 'Stock movement & revenue' },
  { id: 'laser', label: 'Laser', icon: Zap, subtitle: 'Laser time, paid via a session or not' },
  { id: 'print', label: '3D printing', icon: Cuboid, subtitle: 'Prints paid and by volunteers, against the filament taken' },
  { id: 'cnc', label: 'CNC', icon: Drill, subtitle: 'CNC time paid, per job' },
  { id: 'workshops', label: 'Workshops', icon: GraduationCap, subtitle: 'HTL workshops on the agenda' },
] as const;

type TabId = typeof TABS[number]['id'];

// The open sub-tab lives in the hash after the page: #analytics/laser.
function tabFromHash(): TabId {
  const sub = window.location.hash.split('/')[1];
  return TABS.find(t => t.id === sub)?.id ?? 'totals';
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [dateRange, setDateRange] = useState<typeof DATE_RANGES[number]>(DATE_RANGES[1]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    window.history.replaceState(null, '', `#analytics/${tab}`);
  }, [tab]);

  const current = TABS.find(t => t.id === tab)!;
  // ALL = 10 years: the analytics server reads anything over 3650 days as all time.
  const from = dateRange.days ? `now-${dateRange.days}d` : 'now-10y';

  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">

        <div className="border-b border-lijn">
          <div className="pb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-brand-black">Analytics</h2>
              <p className="font-bold text-xs text-brand-black/60 mt-1">
                {current.subtitle} — {dateRange.label === 'ALL' ? 'all time' : `last ${dateRange.label}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedButtons
                options={DATE_RANGES.map(r => ({ value: r.label, label: r.label }))}
                value={dateRange.label}
                onChange={label => setDateRange(DATE_RANGES.find(r => r.label === label)!)}
              />
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className="border border-lijn p-1.5 hover:bg-brand-beige-dark transition-colors"
                title="Reload"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="flex gap-5 sm:gap-8 overflow-x-auto overflow-y-hidden">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-1 py-2.5 font-medium text-xs sm:text-sm border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap',
                  tab === t.id
                    ? 'border-brand-black text-brand-black'
                    : 'border-transparent text-grafiet hover:text-brand-black'
                )}
              >
                <t.icon size={14} className="flex-shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <iframe
          key={`${tab}-${from}-${refreshKey}`}
          title={current.label}
          src={`/grafana/d/htl-${tab}?kiosk&theme=light&from=${from}&to=now`}
          className="w-full h-[calc(100vh-15rem)] min-h-[600px] border border-lijn bg-white"
        />

        {tab === 'laser' && <LaserFeedback days={dateRange.days} refreshKey={refreshKey} />}

      </div>
    </div>
  );
}
