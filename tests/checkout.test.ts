import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
});

const { InvenTreeClient, TILL_CUSTOMER } = await import('../src/api/inventreeClient');

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

/** A small fake InvenTree that remembers the order status. */
function fakeInvenTree(stock: Record<number, { pk: number; quantity: number }[]>, opts: { failAt?: string } = {}) {
    const calls: Call[] = [];
    let status = 10;
    let nextPk = 100;
    let shipped = false;
    let polls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const path = url.replace(/^\/api/, '');
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ method, path, body });
        const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
        if (opts.failAt && path.startsWith(opts.failAt)) return { ok: false, status: 400, text: async () => 'nope' } as Response;

        if (path.startsWith('/company/?')) return ok([{ pk: 7, name: TILL_CUSTOMER }]);
        if (path === '/order/so/' && method === 'POST') return ok({ pk: 5, reference: 'SO-0001' });
        if (path === '/order/so-line/') return ok({ pk: nextPk++ });
        if (path === '/order/so-extra-line/') return ok({ pk: nextPk++ });
        if (path === '/order/so/5/issue/') { status = 15; return ok({}); }
        if (path.startsWith('/stock/?part=')) {
            const part = Number(new URLSearchParams(path.split('?')[1]).get('part'));
            return ok({ count: 1, results: (stock[part] ?? []).map(s => ({ ...s, part })) });
        }
        if (path === '/order/so/shipment/') return ok({ pk: 9 });
        if (path === '/order/so/5/allocate/') return ok({});
        if (path === '/order/so/shipment/9/ship/') { shipped = true; return ok({ task_id: 'x' }); }
        // The worker ships on the second look.
        if (path === '/order/so/shipment/9/') { polls++; return ok({ shipment_date: shipped && polls > 1 ? '2026-09-23' : null }); }
        if (path === '/order/so/5/' && method === 'GET') return ok({ status });
        if (path === '/order/so/5/complete/') { status = status === 20 ? 30 : 20; return ok({}); }
        if (path === '/order/so/5/cancel/') return ok({});
        if (path === '/stock/remove/') return ok({});
        return { ok: false, status: 404, text: async () => `unexpected ${method} ${path}` } as Response;
    }));
    return calls;
}

describe('volunteer stock removal', () => {
    beforeEach(() => store.clear());

    it('removes across stock items in one request', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 2 }, { pk: 2, quantity: 5 }] });

        await new InvenTreeClient({ baseUrl: '' }).removeStockFromPart(8, 6, 'test');
        const removes = calls.filter(c => c.path === '/stock/remove/');
        expect(removes).toHaveLength(1);
        expect(removes[0].body).toEqual({ items: [{ pk: 2, quantity: 5 }, { pk: 1, quantity: 1 }], notes: 'test' });
    });

    it('removes nothing when there is not enough stock', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 2 }] });
        await expect(new InvenTreeClient({ baseUrl: '' }).removeStockFromPart(8, 3, 'test')).rejects.toThrow('Only 2 in stock');
        expect(calls.some(c => c.path === '/stock/remove/')).toBe(false);
    });
});
