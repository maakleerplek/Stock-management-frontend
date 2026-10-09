import { describe, expect, it } from 'vitest';
import { widgetState } from '../src/lib/laserWidget';
import type { LaserSession, LaserTime } from '../src/lib/laserApi';

const time = (global_time: number, laser_state = false): LaserTime =>
  ({ global_time, laser_state, esp_connected: true, esp_ip: null, simulate: false });
const session = (total_time: number, checkout_at: string | null = null): LaserSession =>
  ({ id: 'a', name: 'Jan', created: '', total_time, total_cost: 0, minutes: 1, checkout_at });

describe('widgetState', () => {
  it('offline without a connection or data', () => {
    expect(widgetState(false, time(10), [])).toBe('offline');
    expect(widgetState(true, null, [])).toBe('offline');
  });

  it('running while the laser fires, even with time waiting', () => {
    expect(widgetState(true, time(30, true), [])).toBe('running');
  });

  it('unassigned time with the laser off', () => {
    expect(widgetState(true, time(30), [])).toBe('unassigned');
  });

  it('unpaid sessions once everything is assigned', () => {
    expect(widgetState(true, time(0), [session(60)])).toBe('unpaid');
    expect(widgetState(true, time(0), [session(60, '2026-10-09T10:00:00')])).toBe('idle');
    expect(widgetState(true, time(0), [session(0)])).toBe('idle');
  });
});
