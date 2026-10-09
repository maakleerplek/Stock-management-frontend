import { useState, useEffect } from 'react';
import { Package, RefreshCw, Sigma, Zap } from 'lucide-react';
import inventreeClient from '../api/inventreeClient';
import type { InvenTreeTrackingEntry } from '../api/types';
import { laserApi } from '../lib/laserApi';
import type { ServiceLine, DiscardRow, LaserSessionRow } from '../lib/services';
import { cn } from '../lib/utils';
import { SegmentedButtons } from './ui';
import ItemsTab from './ItemsTab';
import LaserTab from './LaserTab';
import TotalsTab from './TotalsTab';
import { useStock } from '../StockContext';

const DATE_RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: null },
] as const;

export type DateRange = typeof DATE_RANGES[number];

// A new analysis is one more entry here and one more tab file.
const TABS = [
  { id: 'totals', label: 'Totals', icon: Sigma, subtitle: 'Revenue, costs and profit' },
  { id: 'items', label: 'Items', icon: Package, subtitle: 'Stock movement & revenue' },
  { id: 'laser', label: 'Laser', icon: Zap, subtitle: 'Laser time, paid via a session or not' },
] as const;

type TabId = typeof TABS[number]['id'];

// The open sub-tab lives in the hash after the page: #analytics/laser.
function tabFromHash(): TabId {
  const sub = window.location.hash.split('/')[1];
  return TABS.find(t => t.id === sub)?.id ?? 'totals';
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_RANGES[1]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { refreshInventory } = useStock();

  const [trackingEntries, setTrackingEntries] = useState<InvenTreeTrackingEntry[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [discarded, setDiscarded] = useState<DiscardRow[]>([]);
  const [laserSessions, setLaserSessions] = useState<{ sessions: LaserSessionRow[]; unassignedSeconds: number }>({ sessions: [], unassignedSeconds: 0 });
  const [laserLoading, setLaserLoading] = useState(true);

  useEffect(() => {
    window.history.replaceState(null, '', `#analytics/${tab}`);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    setTrackingLoading(true);
    setTrackingError(null);
    inventreeClient.getAllStockTracking()
      .then(all => { if (!cancelled) setTrackingEntries(all); })
      .catch(err => { if (!cancelled) setTrackingError(err instanceof Error ? err.message : 'Failed to load tracking data'); })
      .finally(() => { if (!cancelled) setTrackingLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Laser data comes from sales orders and the laser service, apart from the
  // tracking log, so a failure here leaves the rest of the page working.
  useEffect(() => {
    let cancelled = false;
    setLaserLoading(true);
    Promise.all([
      inventreeClient.getAllServiceLines()
        .then(lines => { if (!cancelled) setServiceLines(lines); })
        .catch(err => console.warn('[Analytics] Could not load service lines:', err)),
      laserApi.discarded()
        .then(d => { if (!cancelled) setDiscarded(d.rows); })
        .catch(err => console.warn('[Analytics] Could not load laser time without a session:', err)),
      laserApi.allSessions()
        .then(d => { if (!cancelled) setLaserSessions({ sessions: d.sessions, unassignedSeconds: d.unassigned_seconds }); })
        .catch(err => console.warn('[Analytics] Could not load laser sessions:', err)),
    ]).finally(() => { if (!cancelled) setLaserLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const current = TABS.find(t => t.id === tab)!;

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
                onClick={() => { setRefreshKey(k => k + 1); void refreshInventory(); }}
                className="border border-lijn p-1.5 hover:bg-brand-beige-dark transition-colors"
                title="Refresh"
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

        {tab === 'totals' && (
          <TotalsTab
            trackingEntries={trackingEntries}
            serviceLines={serviceLines}
            discarded={discarded}
            laserSessions={laserSessions}
            loading={trackingLoading || laserLoading}
            trackingError={trackingError}
            dateRange={dateRange}
          />
        )}
        {tab === 'items' && (
          <ItemsTab
            trackingEntries={trackingEntries}
            loading={trackingLoading}
            error={trackingError}
            onRetry={() => setRefreshKey(k => k + 1)}
            dateRange={dateRange}
          />
        )}
        {tab === 'laser' && (
          <LaserTab serviceLines={serviceLines} discarded={discarded} laserSessions={laserSessions} loading={laserLoading} dateRange={dateRange} refreshKey={refreshKey} />
        )}

      </div>
    </div>
  );
}
