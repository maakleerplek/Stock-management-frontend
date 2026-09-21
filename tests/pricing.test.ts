import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InvenTreeClient } from '../src/api/inventreeClient';

/**
 * These cover the two things that went wrong in production and were only caught
 * by reading InvenTree's source: a purchase order line counts packs rather than
 * units, and "cost" must come from the supplier price breaks rather than from
 * pricing_min.
 */

type Route = Record<string, unknown>;

/**
 * The client caches GETs in localStorage. Node has none, and the real thing is
 * not what these tests are about, so give it a throwaway in-memory one.
 */
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
});

/** Answer fetch from a path -> payload table, and record what was sent. */
function mockApi(routes: Record<string, Route>) {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        const hit = Object.keys(routes).find(k => url.includes(k));
        if (!hit) return { ok: false, status: 404, text: async () => 'not found' } as Response;
        return { ok: true, status: 200, json: async () => routes[hit] } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
}

function client() {
    return new InvenTreeClient({ baseUrl: '', token: 't' });
}

afterEach(() => vi.unstubAllEnvs());

describe('supplier cost', () => {
    beforeEach(() => store.clear());

    it('divides the pack price by the pack size', async () => {
        mockApi({
            '/company/price-break/': { results: [{ part: 1, quantity: 1, price: '25.07' }] },
            '/company/part/': { results: [{ pk: 1, part: 8, pack_quantity: '24' }] },
        });
        const costs = await client().getSupplierCostPerPart();
        // 25.07 / 24 — the figure InvenTree reports as supplier_price_min
        expect(costs[8]).toBeCloseTo(1.044583, 5);
    });

    it('omits parts with no supplier, rather than inventing a cost', async () => {
        mockApi({
            '/company/price-break/': { results: [{ part: 1, quantity: 1, price: '25.07' }] },
            '/company/part/': { results: [{ pk: 1, part: 8, pack_quantity: '24' }] },
        });
        const costs = await client().getSupplierCostPerPart();
        // part 3 (Multiplex) has no supplier part at all
        expect(costs[3]).toBeUndefined();
    });

    it('takes the break with the smallest order quantity', async () => {
        mockApi({
            '/company/price-break/': {
                results: [
                    { part: 1, quantity: 10, price: '20.00' },
                    { part: 1, quantity: 1, price: '24.00' },
                ],
            },
            '/company/part/': { results: [{ pk: 1, part: 8, pack_quantity: '24' }] },
        });
        const costs = await client().getSupplierCostPerPart();
        expect(costs[8]).toBeCloseTo(1.0, 5);
    });
});

describe('selling price', () => {
    beforeEach(() => store.clear());

    it('reads the single-unit sale price break', async () => {
        mockApi({
            '/part/sale-price/': {
                results: [
                    { part: 8, quantity: 1, price: '2.00' },
                    { part: 2, quantity: 1, price: '3.00' },
                ],
            },
        });
        const prices = await client().getSalePricePerPart();
        expect(prices[8]).toBe(2);
        expect(prices[2]).toBe(3);
    });

    it('marks the part salable and clears the old break before writing', async () => {
        const calls = mockApi({
            '/part/sale-price/?part=8': { results: [{ pk: 5, part: 8, quantity: 1 }] },
            '/part/sale-price/': { results: [] },
            '/part/8/': {},
        });
        await client().setSalePrice(8, 2.5);

        expect(calls.find(c => c.method === 'PATCH' && c.url.includes('/part/8/'))?.body)
            .toEqual({ salable: true });
        // the existing single-unit break is removed, so editing cannot stack duplicates
        expect(calls.some(c => c.method === 'DELETE' && c.url.includes('/part/sale-price/5/'))).toBe(true);
        expect(calls.find(c => c.method === 'POST' && c.url.endsWith('/part/sale-price/'))?.body)
            .toMatchObject({ part: 8, quantity: 1, price: '2.5' });
    });
});

describe('a part with no sale price', () => {
    beforeEach(() => store.clear());

    it('never falls back to a cost figure for the till price', async () => {
        mockApi({
            // no sale price for this part
            '/part/sale-price/': { results: [] },
            '/company/price-break/': { results: [{ part: 1, quantity: 1, price: '25.07' }] },
            '/company/part/': { results: [{ pk: 1, part: 8, pack_quantity: '24' }] },
            '/stock/99/': {
                pk: 99,
                part: 8,
                quantity: 5,
                part_detail: {
                    pk: 8,
                    name: 'Coca Cola',
                    // these are cost figures post-migration; using either as a
                    // selling price would undercharge by half
                    pricing_min: 1.044583,
                    pricing_max: 1.044583,
                },
            },
        });
        const c = client();
        // reach the private formatter the way the barcode path does
        const item = (c as unknown as {
            formatStockItemData: (s: unknown) => { price: number; cost: number };
        }).formatStockItemData({
            pk: 99, part: 8, quantity: 5,
            part_detail: { pk: 8, name: 'Coca Cola', pricing_min: 1.044583, pricing_max: 1.044583 },
        });
        expect(item.price).toBe(0);
        expect(item.price).not.toBeCloseTo(1.0446, 3);
    });
});
