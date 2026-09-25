/**
 * Client for the laser service (laser/ in this repo), proxied by nginx under /laser/.
 */
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const BASE = '/laser/api';

export interface LaserSession {
  id: string;
  name: string;
  created: string;
  total_time: number;
  total_cost: number;
  /** What the till charges: total_time rounded up to whole minutes. */
  minutes: number;
  /** Set when someone pressed Pay: the time is waiting in the checkout. */
  checkout_at: string | null;
}

export interface LaserTime {
  global_time: number;
  laser_state: boolean;
  esp_connected: boolean;
  esp_ip: string | null;
  simulate: boolean;
}

export interface LaserMaterial {
  name: string;
  thicknesses: number[];
}

/** One row of the material cutting library (the binder next to the laser). */
export interface LibraryRow {
  partId: number;
  group: string;
  material: string;
  materialNl: string;
  thickness: number | null;
  cutSpeed: number | null;
  cutPower: number | null;
  cutPowerMin: number | null;
  cutPasses: number | null;
  lineSpeed: number | null;
  linePower: number | null;
  linePowerMin: number | null;
  fillSpeed: number | null;
  fillPower: number | null;
  comment: string;
}

export type LibraryDraft = Omit<LibraryRow, 'partId'>;

export type LaserOperation = 'cut' | 'engrave';
export type LaserOutcome = 'clean' | 'partial' | 'failed' | 'risky';

export interface LaserSetting {
  operation: LaserOperation;
  speed: number | null;
  power: number | null;
  passes: number | null;
  confidence: 'none' | 'baseline' | 'low' | 'good';
  reportCount: number;
  nearestThickness: number | null;
  avoidWarning: string | null;
  capped: boolean;
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  // Library writes: nginx checks the Authentik session cookie, which the
  // browser sends along by itself.
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Only volunteers can change the library. Sign in as volunteer.');
  if (!res.ok) throw new Error(data.error || `Laser service: ${res.status}`);
  return data as T;
}

export const laserApi = {
  config: () => call<{ costPerMin: number; maxPower: number; simulate: boolean }>('/config'),
  createSession: (name: string) => call<{ id: string }>('/sessions', 'POST', { name }),
  deleteSession: (id: string) => call('/sessions/' + encodeURIComponent(id), 'DELETE'),
  setCheckout: (id: string, on: boolean) => call(`/sessions/${encodeURIComponent(id)}/checkout`, 'POST', { on }),
  markPaid: (id: string, order: string) => call(`/sessions/${encodeURIComponent(id)}/paid`, 'POST', { order }),
  flush: (sessionId: string) => call<{ flushed_time: number }>('/flush', 'POST', { session_id: sessionId }),
  reset: () => call('/reset', 'POST'),
  simulate: (on: boolean) => call('/simulate', 'POST', { state: on ? 'ON' : 'OFF' }),
  materials: () => call<{ materials: LaserMaterial[] }>('/materials'),
  library: () => call<{ rows: LibraryRow[]; minPower: number; maxPower: number }>('/library'),
  saveLibraryRow: (partId: number | null, row: LibraryDraft) =>
    partId === null
      ? call<{ partId: number }>('/library', 'POST', row)
      : call<{ partId: number }>(`/library/${partId}`, 'PUT', row),
  deleteLibraryRow: (partId: number) => call(`/library/${partId}`, 'DELETE'),
  recommend: (material: string, thickness: number, ops: LaserOperation[], strength: number) =>
    call<{ results: LaserSetting[] }>(
      `/recommend?material=${encodeURIComponent(material)}&thickness=${thickness}&ops=${ops.join(',')}&strength=${strength}`,
    ),
  logAttempt: (a: {
    material: string; thickness: number; operation: LaserOperation; speed: number; power: number;
    passes: number; strength?: number; outcome: LaserOutcome;
  }) => call('/attempts', 'POST', a),
};

/** Live laser state and sessions over Socket.IO. */
export function useLaserSocket() {
  const [connected, setConnected] = useState(false);
  const [time, setTime] = useState<LaserTime | null>(null);
  const [sessions, setSessions] = useState<LaserSession[]>([]);

  useEffect(() => {
    const socket = io({ path: '/laser/socket.io' });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('time_update', (t: LaserTime) => setTime(t));
    socket.on('sessions', (d: { sessions: LaserSession[] }) => setSessions(d.sessions));
    return () => { socket.disconnect(); };
  }, []);

  return { connected, time, sessions };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map(n => String(n).padStart(2, '0')).join(':');
}
