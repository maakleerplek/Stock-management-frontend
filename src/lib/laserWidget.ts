/**
 * What the always-on-top laser widget on the lasercutter PC shows.
 * The widget itself is src/LaserWidget.tsx, the Windows shell is laser-timer-widget/.
 */
import type { LaserSession, LaserTime } from './laserApi';

export type WidgetState =
  | 'offline'     // no connection to the laser service
  | 'running'     // the laser is firing, time is counting
  | 'unassigned'  // the job is done, nobody has put the time on a session yet
  | 'stale'       // same, but for longer than STALE_AFTER_S: someone walked away
  | 'unpaid'      // all time is on sessions, but they are not paid yet
  | 'idle';

/** Unassigned time turns red after this long. */
export const STALE_AFTER_S = 5 * 60;

/** Sessions with time on them that nobody pressed Pay on yet. */
export const unpaidSessions = (sessions: LaserSession[]) =>
  sessions.filter(s => s.total_time > 0 && !s.checkout_at);

/**
 * @param unassignedSince ms timestamp of when unassigned time showed up with the
 *   laser off, or null. The widget keeps it, the server does not.
 */
export function widgetState(
  connected: boolean,
  time: LaserTime | null,
  sessions: LaserSession[],
  unassignedSince: number | null,
  now: number,
): WidgetState {
  if (!connected || !time) return 'offline';
  if (time.laser_state) return 'running';
  if (time.global_time > 0) {
    return unassignedSince !== null && now - unassignedSince >= STALE_AFTER_S * 1000 ? 'stale' : 'unassigned';
  }
  if (unpaidSessions(sessions).length) return 'unpaid';
  return 'idle';
}
