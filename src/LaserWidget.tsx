/**
 * The laser bar on the lasercutter PC (#laser-widget).
 * The Windows shell (laser-timer-widget/) docks only this page as a full-height
 * bar along the right edge of the screen. A click opens the full #laser page.
 */
import { useEffect, useState } from 'react';
import { WifiOff, Zap } from 'lucide-react';
import { cn } from './lib/utils';
import { PRICING } from './constants';
import { formatDuration, useLaserSocket } from './lib/laserApi';
import { unpaidSessions, widgetState, type WidgetState } from './lib/laserWidget';

declare global {
  interface Window {
    __TAURI__?: { core: { invoke: (cmd: string) => Promise<unknown> } };
  }
}

const LOOK: Record<WidgetState, { bar: string; label: string; action?: string }> = {
  offline: { bar: 'bg-brand-beige-dark text-grafiet', label: 'Laser server offline' },
  running: { bar: 'bg-brand-black text-white', label: 'Laser running' },
  unassigned: { bar: 'bg-orange-500 text-white', label: 'Laser time not assigned yet', action: 'Assign & pay' },
  stale: { bar: 'bg-red-500 text-white animate-pulse', label: 'Laser time not assigned!', action: 'Assign & pay' },
  unpaid: { bar: 'bg-orange-100 text-brand-black', label: 'Waiting to be paid', action: 'Pay' },
  idle: { bar: 'bg-brand-beige text-grafiet', label: 'Laser free' },
};

function openFull() {
  // In the Windows shell: a normal window next to the bar. In a browser: this tab.
  if (window.__TAURI__) window.__TAURI__.core.invoke('open_full');
  else { window.location.hash = 'laser'; window.location.reload(); }
}

const euro = (minutes: number) => `€${(minutes * PRICING.LASER_PER_MINUTE).toFixed(2)}`;

export default function LaserWidget() {
  const { connected, time, sessions } = useLaserSocket();
  const [now, setNow] = useState(Date.now());
  const [unassignedSince, setUnassignedSince] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Start the "walked away" clock when time is waiting and the laser is off.
  const waiting = !!time && !time.laser_state && time.global_time > 0;
  useEffect(() => {
    setUnassignedSince(waiting ? Date.now() : null);
  }, [waiting]);

  const state = widgetState(connected, time, sessions, unassignedSince, now);
  const unpaid = unpaidSessions(sessions);
  const look = LOOK[state];
  const pending = time?.global_time ?? 0;

  return (
    <button
      type="button"
      onClick={openFull}
      className={cn('w-screen h-screen flex flex-col text-left select-none border-l border-lijn overflow-hidden', look.bar)}
    >
      <div className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold opacity-80">
        <Zap className="w-4 h-4" />
        Lasercutter
        {time && !time.esp_connected && state !== 'offline' && (
          <WifiOff className="w-4 h-4 ml-auto" aria-label="Laser sensor not connected" />
        )}
      </div>

      <div className="px-4 pt-6">
        <div className="flex items-center gap-2">
          <span
            className={cn('w-3 h-3 rounded-full shrink-0',
              state === 'running' ? 'bg-red-500 animate-pulse' : state === 'offline' ? 'bg-lijn' : 'bg-emerald-500')}
          />
          <span className="text-base font-semibold leading-tight">{look.label}</span>
        </div>
        {state !== 'offline' && (
          <div className="font-mono text-5xl font-bold tabular-nums mt-3">{formatDuration(pending)}</div>
        )}
        {pending > 0 && <div className="text-sm mt-1 opacity-80">{euro(pending / 60)}</div>}
      </div>

      {unpaid.length > 0 && (
        <div className="px-4 pt-8 min-h-0 overflow-hidden">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">Not paid yet</div>
          <ul className="space-y-2">
            {unpaid.map(s => (
              <li key={s.id} className="rounded-lg bg-black/10 px-3 py-2">
                <div className="font-semibold truncate">{s.name}</div>
                <div className="text-sm opacity-80 tabular-nums">{s.minutes} min · {euro(s.minutes)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto p-4">
        {look.action ? (
          <div className="rounded-xl bg-brand-black text-white text-center text-xl font-bold py-4 shadow-lg">
            {look.action} →
          </div>
        ) : (
          <div className="text-sm opacity-70">Tap to open the laser page</div>
        )}
      </div>
    </button>
  );
}
