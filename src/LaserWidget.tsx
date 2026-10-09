/**
 * The small always-on-top timer on the lasercutter PC (#laser-widget).
 * The Windows shell (laser-timer-widget/) shows only this page in a borderless
 * window in the top-right corner. A click opens the full #laser page.
 */
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from './lib/utils';
import { formatDuration, useLaserSocket } from './lib/laserApi';
import { unpaidSessions, widgetState, type WidgetState } from './lib/laserWidget';

declare global {
  interface Window {
    __TAURI__?: { core: { invoke: (cmd: string) => Promise<unknown> } };
  }
}

const LOOK: Record<WidgetState, { box: string; label: string }> = {
  offline: { box: 'bg-brand-beige-dark text-grafiet', label: 'Laser server offline' },
  running: { box: 'bg-brand-black text-white', label: 'Laser running' },
  unassigned: { box: 'bg-orange-500 text-white animate-pulse', label: 'Assign your time & pay →' },
  stale: { box: 'bg-red-500 text-white animate-pulse', label: 'Time not assigned! Tap here →' },
  unpaid: { box: 'bg-orange-100 text-brand-black', label: 'Waiting to be paid →' },
  idle: { box: 'bg-brand-beige text-grafiet', label: 'Laser free' },
};

function openFull() {
  // In the Windows shell: a normal window next to the widget. In a browser: this tab.
  if (window.__TAURI__) window.__TAURI__.core.invoke('open_full');
  else { window.location.hash = 'laser'; window.location.reload(); }
}

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
  const seconds = state === 'unpaid' ? unpaid.reduce((t, s) => t + s.total_time, 0) : time?.global_time ?? 0;
  const look = LOOK[state];

  return (
    <button
      type="button"
      onClick={openFull}
      className={cn('w-screen h-screen flex items-center gap-[8vh] px-[10vh] text-left select-none border border-lijn', look.box)}
    >
      <span
        className={cn('w-[14vh] h-[14vh] rounded-full shrink-0',
          state === 'running' ? 'bg-red-500 animate-pulse' : state === 'offline' ? 'bg-lijn' : 'bg-emerald-500')}
      />
      <span className="flex flex-col leading-tight min-w-0">
        {state !== 'offline' && <span className="font-mono text-[40vh] leading-none font-bold tabular-nums">{formatDuration(seconds)}</span>}
        <span className="text-[15vh] font-semibold truncate mt-[3vh]">
          {look.label}
          {state === 'unpaid' && ` (${unpaid.length})`}
        </span>
      </span>
      {time && !time.esp_connected && state !== 'offline' && (
        <WifiOff className="w-[18vh] h-[18vh] ml-auto shrink-0" aria-label="Laser sensor not connected" />
      )}
    </button>
  );
}
