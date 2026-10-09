import { describe, expect, it } from 'vitest';
import { STALE_AFTER_S, widgetState } from '../src/lib/laserWidget';
import type { LaserSession, LaserTime } from '../src/lib/laserApi';

const time = (global_time: number, laser_state = false): LaserTime =>
  ({ global_time, laser_state, esp_connected: true, esp_ip: null, simulate: false });
const session = (total_time: number, checkout_at: string | null = null): LaserSession =>
  ({ id: 'a', name: 'Jan', created: '', total_time, total_cost: 0, minutes: 1, checkout_at });

describe('widgetState', () => {
  const now = 1_000_000_000;

  it('offline without a connection or data', () => {
    expect(widgetState(false, time(10), [], null, now)).toBe('offline');
    expect(widgetState(true, null, [], null, now)).toBe('offline');
  });

  it('running while the laser fires, even with time waiting', () => {
    expect(widgetState(true, time(30, true), [], now - 1e9, now)).toBe('running');
  });

  it('unassigned time with the laser off, red after a while', () => {
    expect(widgetState(true, time(30), [], now, now)).toBe('unassigned');
    expect(widgetState(true, time(30), [], null, now)).toBe('unassigned');
    expect(widgetState(true, time(30), [], now - STALE_AFTER_S * 1000, now)).toBe('stale');
  });

  it('unpaid sessions once everything is assigned', () => {
    expect(widgetState(true, time(0), [session(60)], null, now)).toBe('unpaid');
    expect(widgetState(true, time(0), [session(60, '2026-10-09T10:00:00')], null, now)).toBe('idle');
    expect(widgetState(true, time(0), [session(0)], null, now)).toBe('idle');
  });
});
