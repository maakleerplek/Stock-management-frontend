import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPendingPaid, markPaidReliably, pendingPaidIds } from '../src/lib/laserApi';

// The tests run in node: a tiny localStorage, and fetch answers from a list.
const store = new Map<string, string>();
const answers: (number | 'down')[] = [];
const fetchMock = vi.fn(async () => {
  const a = answers.shift() ?? 200;
  if (a === 'down') throw new TypeError('Failed to fetch');
  return new Response(JSON.stringify(a === 200 ? { ok: true } : { error: 'Session not found' }), { status: a });
});

beforeEach(() => {
  store.clear();
  answers.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('markPaidReliably', () => {
  it('tries again when the laser service is away for a moment', async () => {
    answers.push('down', 200);
    expect(await markPaidReliably('a', 'SO-1', 0)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pendingPaidIds().size).toBe(0);
  });

  it('takes "not found" as done: already paid, or an empty session that is gone', async () => {
    answers.push(404);
    expect(await markPaidReliably('a', 'SO-1', 0)).toBe(true);
  });

  it('queues the session when it keeps failing, and the flush works it off', async () => {
    answers.push('down', 'down', 'down');
    expect(await markPaidReliably('a', 'SO-1', 0)).toBe(false);
    expect(pendingPaidIds()).toEqual(new Set(['a']));

    answers.push('down');
    await flushPendingPaid();
    expect(pendingPaidIds()).toEqual(new Set(['a']));     // still away

    answers.push(200);
    await flushPendingPaid();
    expect(pendingPaidIds().size).toBe(0);
  });
});
