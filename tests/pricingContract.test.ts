import { describe, it, expect, vi, beforeEach } from 'vitest';
import contract from './contract/pricing-cases.json';

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

type Case = (typeof contract.cases)[number] & { known_mismatch?: string; world_patch?: { drop_sale_prices?: number[] } };

// The stock app only prices item sale prices itself (getSalePricePerPart); machines, prints, minimum
// and rounding are priced by core/checkout.py. So only item unit prices can be compared here.
async function salePrices(drop: number[] = []) {
    const results = contract.world.sale_breaks.filter(b => !drop.includes(b.part));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results }) }) as Response));
    return new InvenTreeClient({ baseUrl: '' }).getSalePricePerPart();
}

describe('pricing contract (items)', () => {
    beforeEach(() => store.clear());

    it('uses the same walk-in customer name', () => {
        expect(TILL_CUSTOMER).toBe(contract.constants.till_customer);
    });

    for (const c of contract.cases as Case[]) {
        const items = (c.expected as { items?: { part: number; unit_price: number }[] }).items;
        const skip = c.known_mismatch?.includes('typescript')
            ? `known mismatch: ${c.known_mismatch}`
            : !items || (c.cart as { volunteer?: boolean }).volunteer ? 'priced server-side only (core/checkout.py), nothing to compare in TS' : '';
        (skip ? it.skip : it)(`${c.name}${skip ? ` [skipped: ${skip}]` : ''}`, async () => {
            const prices = await salePrices(c.world_patch?.drop_sale_prices);
            for (const i of items!) expect(prices[i.part]).toBeCloseTo(i.unit_price, 6);
        });
    }
});
