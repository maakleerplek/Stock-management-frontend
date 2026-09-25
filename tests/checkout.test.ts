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
        return { ok: false, status: 404, text: async () => `unexpected ${method} ${path}` } as Response;
    }));
    return calls;
}

describe('checkout as a sales order', () => {
    beforeEach(() => store.clear());

    it('books lines, allocates across stock items, ships and completes', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 2 }, { pk: 2, quantity: 5 }], 6: [{ pk: 3, quantity: 4 }] });
        const result = await new InvenTreeClient({ baseUrl: '' }).sellParts(
            [{ partId: 8, quantity: 4, unitPrice: 2 }, { partId: 6, quantity: 1, unitPrice: 2 }],
            [{ reference: 'Lasertime (min)', quantity: 3, unitPrice: 0.5 }],
            'Coca Cola x4, Coca Cola Zero x1, Lasertime 3 min',
        );

        expect(result).toEqual({ reference: 'SO-0001', unshipped: [] });
        const writes = calls.filter(c => c.method === 'POST').map(c => c.path);
        expect(writes).toEqual([
            '/order/so/', '/order/so-line/', '/order/so-line/', '/order/so-extra-line/',
            '/order/so/5/issue/', '/order/so/shipment/', '/order/so/5/allocate/',
            '/order/so/shipment/9/ship/', '/order/so/5/complete/', '/order/so/5/complete/',
        ]);
        const allocate = calls.find(c => c.path === '/order/so/5/allocate/')!.body!;
        // largest stock item first, then the rest from the next one
        expect(allocate.items).toEqual([
            { line_item: 100, stock_item: 2, quantity: 4 },
            { line_item: 101, stock_item: 3, quantity: 1 },
        ]);
        expect(calls.find(c => c.path === '/order/so-line/')!.body).toMatchObject({ part: 8, quantity: 4, sale_price: '2.00' });
        expect(calls.find(c => c.path === '/order/so-extra-line/')!.body).toMatchObject({ reference: 'Lasertime (min)', quantity: 3, price: '0.50' });
    });

    it('still sells what the system thinks is out of stock, and reports it', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 1 }] });
        const result = await new InvenTreeClient({ baseUrl: '' }).sellParts([{ partId: 8, quantity: 3, unitPrice: 2 }], [], 'x');
        expect(result.unshipped).toEqual([{ partId: 8, quantity: 2 }]);
        expect(calls.find(c => c.path === '/order/so/5/complete/')!.body).toEqual({ accept_incomplete: true });
    });

    it('skips the shipment when nothing can be allocated', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 0 }] });
        await new InvenTreeClient({ baseUrl: '' }).sellParts([{ partId: 8, quantity: 1, unitPrice: 2 }], [], 'x');
        expect(calls.some(c => c.path === '/order/so/shipment/')).toBe(false);
    });

    it('waits for the worker to ship before completing', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 5 }] });
        await new InvenTreeClient({ baseUrl: '' }).sellParts([{ partId: 8, quantity: 1, unitPrice: 2 }], [], 'x');
        const order = calls.map(c => c.path);
        expect(order.filter(p => p === '/order/so/shipment/9/').length).toBe(2);
        expect(order.lastIndexOf('/order/so/shipment/9/')).toBeLessThan(order.indexOf('/order/so/5/complete/'));
    });

    it('does not cancel once the shipment is with the worker', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 5 }] }, { failAt: '/order/so/5/complete/' });
        await expect(new InvenTreeClient({ baseUrl: '' }).sellParts([{ partId: 8, quantity: 1, unitPrice: 2 }], [], 'x')).rejects.toThrow();
        expect(calls.some(c => c.path === '/order/so/5/cancel/')).toBe(false);
    });

    it('cancels the order when a step fails', async () => {
        const calls = fakeInvenTree({ 8: [{ pk: 1, quantity: 5 }] }, { failAt: '/order/so/5/allocate/' });
        await expect(new InvenTreeClient({ baseUrl: '' }).sellParts([{ partId: 8, quantity: 1, unitPrice: 2 }], [], 'x')).rejects.toThrow();
        expect(calls.at(-1)!.path).toBe('/order/so/5/cancel/');
    });
});
