/**
 * Cellar storage, served by the laser service (laser/storage.py). Anyone may
 * store and extend; admin/ is for volunteers (nginx checks the session).
 */
const BASE = '/storage/api';

export type StorageStatus = 'ok' | 'expired' | 'reminded' | 'may_remove';

export interface StoredItem {
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  content: string;
  created: string;
  expires: string;
  remindedAt: string | null;
  status: StorageStatus;
}

export interface StoreResult {
  code: string;
  created: string;
  expires: string;
  spot: string;
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Only volunteers can do this. Sign in as volunteer.');
  if (res.status === 429) throw new Error('Too many tries. Wait a minute and try again.');
  if (!res.ok) throw new Error(data.error || `Storage service: ${res.status}`);
  return data as T;
}

export const storageApi = {
  config: () => call<{ spot: string; days: number; graceDays: number }>('/config'),
  store: (item: { firstName: string; lastName: string; email: string; content: string }) =>
    call<StoreResult>('/items', 'POST', item),
  extendWithToken: (token: string) => call<{ code: string; expires: string }>('/extend', 'POST', { token }),
  extendWithCode: (code: string, email: string) =>
    call<{ code: string; expires: string }>('/extend', 'POST', { code, email }),
  list: () => call<{ items: StoredItem[]; graceDays: number }>('/admin/items'),
  adminExtend: (code: string) =>
    call<{ code: string; expires: string }>(`/admin/items/${encodeURIComponent(code)}/extend`, 'POST', {}),
  pickup: (code: string, reason: 'picked_up' | 'removed') =>
    call(`/admin/items/${encodeURIComponent(code)}/pickup`, 'POST', { reason }),
};
