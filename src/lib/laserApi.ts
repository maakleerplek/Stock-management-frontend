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

/** Every session, open and paid, for the analytics (GET /sessions/all). */
export interface LaserSessionRecord {
  id: string;
  name: string;
  created: string;
  total_time: number;
  checkout_at: string | null;
  paid_at: string | null;
  order_ref: string | null;
}

/** Laser time cleared without a paid session (it may have been paid some other way). */
export interface DiscardedTime {
  id: number;
  seconds: number;
  source: 'unassigned' | 'session';
  session_name: string | null;
  reason: string | null;
  discarded_at: string;
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

/** One "Tried it? How did it go?" report. Stored in InvenTree (laser/feedback.py). */
export interface FeedbackReport {
  /** The InvenTree part that holds the report. */
  id: number;
  created_at: string;
  material: string;
  thickness_mm: number;
  operation: LaserOperation;
  speed: number;
  power: number;
  passes: number;
  strength: number | null;
  outcome: LaserOutcome;
  submitted_by: string | null;
}

/** Reports for one material, thickness and operation, next to the library and the advice. */
export interface FeedbackGroup {
  material: string;
  thickness: number;
  operation: LaserOperation;
  last: string;
  counts: Record<LaserOutcome, number>;
  library: { partId: number; setting: { speed: number; power: number; passes: number } | null } | null;
  /** What the laser page shows: library row and reports blended. */
  advice: LaserSetting;
  /** The reports alone; this is what "Update library" writes. */
  reported: LaserSetting;
  /** At least 3 good reports and they are more than 10 % off the library. */
  differs: boolean;
}

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

/** An answer from the laser service that was not OK; `status` 0 means it could not be reached. */
export class LaserApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  // Library writes: nginx checks the Authentik session cookie, which the
  // browser sends along by itself.
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new LaserApiError('Laser service unreachable', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new LaserApiError('Only volunteers can do this. Sign in as volunteer.', 401);
  if (!res.ok) throw new LaserApiError(data.error || `Laser service: ${res.status}`, res.status);
  return data as T;
}

export const laserApi = {
  config: () => call<{ costPerMin: number; maxPower: number; simulate: boolean }>('/config'),
  createSession: (name: string) => call<{ id: string }>('/sessions', 'POST', { name }),
  deleteSession: (id: string, reason?: string) => call('/sessions/' + encodeURIComponent(id), 'DELETE', { reason }),
  setCheckout: (id: string, on: boolean) => call(`/sessions/${encodeURIComponent(id)}/checkout`, 'POST', { on }),
  markPaid: (id: string, order: string) => call(`/sessions/${encodeURIComponent(id)}/paid`, 'POST', { order }),
  flush: (sessionId: string) => call<{ flushed_time: number }>('/flush', 'POST', { session_id: sessionId }),
  reset: (reason?: string) => call('/reset', 'POST', { reason }),
  discarded: () => call<{ rows: DiscardedTime[] }>('/discarded'),
  allSessions: () => call<{ sessions: LaserSessionRecord[]; unassigned_seconds: number }>('/sessions/all'),
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
  // Volunteers only (nginx: /laser/api/admin/).
  feedback: (days?: number | null) =>
    call<{ reports: FeedbackReport[]; groups: FeedbackGroup[] }>(`/admin/feedback${days ? `?days=${days}` : ''}`),
  deleteReport: (id: number) => call(`/admin/attempts/${id}`, 'DELETE'),
};

// Sessions that are sold but could not be marked paid yet. They stay out of the
// checkout until that works, so nobody pays them twice. Lives in this browser.
const PENDING_PAID_KEY = 'laserPendingPaid.v1';
type PendingPaid = { id: string; order: string };

function readPending(): PendingPaid[] {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_PAID_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writePending(list: PendingPaid[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_PAID_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_PAID_KEY);
  } catch { /* storage blocked: the retries below are all we have */ }
}

/** Session IDs that are sold but not marked paid on the server yet. */
export const pendingPaidIds = () => new Set(readPending().map(p => p.id));

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Mark paid, a few tries. A 404 means it is already paid (or was empty and is gone): done. */
async function tryMarkPaid(id: string, order: string, tries: number, delayMs: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      await laserApi.markPaid(id, order);
      return true;
    } catch (e) {
      if (e instanceof LaserApiError && e.status === 404) return true;
      if (i < tries - 1) await wait(delayMs * (i + 1));
    }
  }
  return false;
}

/**
 * After a sale: mark the laser session paid. If the laser service stays
 * unreachable, keep it in a queue that flushPendingPaid() works off later.
 * Returns false when it is queued.
 */
export async function markPaidReliably(id: string, order: string, delayMs = 1000): Promise<boolean> {
  if (await tryMarkPaid(id, order, 3, delayMs)) return true;
  writePending([...readPending().filter(p => p.id !== id), { id, order }]);
  return false;
}

/** Retry the queued sessions; call on load and whenever the laser service is back. */
export async function flushPendingPaid(): Promise<void> {
  for (const p of readPending()) {
    if (await tryMarkPaid(p.id, p.order, 1, 0)) writePending(readPending().filter(q => q.id !== p.id));
  }
}

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
