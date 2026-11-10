/** Parts, barcode lookup, images and pricing. */

import type {
    ItemData,
    InvenTreeBarcodeResponse,
    InvenTreePartListResponse,
    CreatePartPayload,
    UpdatePartPayload,
} from './types';
import { CACHE_TTL } from '../lib/cache';
import { OrdersApi } from './orders';

export class PartsApi extends OrdersApi {
    /**
     * Sale prices and supplier costs, memoised so the synchronous stock-item
     * formatter can use them. Callers refresh via ensurePricingMaps() first.
     */
    private salePriceMap: Record<number, number> = {};
    private supplierCostMap: Record<number, number> = {};
    private pricingMapsAt = 0;

    private async ensurePricingMaps(): Promise<void> {
        if (this.pricingMapsAt && Date.now() - this.pricingMapsAt < 60_000) return;
        try {
            const [sale, cost] = await Promise.all([
                this.getSalePricePerPart(),
                this.getSupplierCostPerPart(),
            ]);
            this.salePriceMap = sale;
            this.supplierCostMap = cost;
            this.pricingMapsAt = Date.now();
        } catch {
            // Keep whatever we had; the formatter falls back on its own.
        }
    }

    /**
     * Find the part behind a scanned code, in this order:
     * 1. InvenTree's barcode registry (a part, or a stock item's part)
     * 2. the part's IPN
     * 3. a part name search
     *
     * Not cached: a scan is a live action.
     */
    async lookupBarcode(barcode: string): Promise<ItemData | null> {
        if (!barcode || barcode === 'No result') return null;

        try {
            let partId: number | null = null;

            try {
                const resp = await this.request<InvenTreeBarcodeResponse>('/barcode/', 'POST', { barcode }, false, false);
                partId = resp.part?.pk ?? null;
                // Barcodes used to be linked to stock items. That item may have
                // been sold since; only its part still means anything.
                if (!partId && resp.stockitem?.pk) partId = (await this.getStockItem(resp.stockitem.pk)).part;
            } catch {
                // Unknown to the registry: try the fallbacks.
            }

            for (const query of [`IPN=${encodeURIComponent(barcode)}`, `search=${encodeURIComponent(barcode)}`]) {
                if (partId) break;
                const parts = await this.request<InvenTreePartListResponse>(`/part/?${query}`, 'GET', undefined, false, false);
                partId = parts.results[0]?.pk ?? null;
            }

            return partId ? await this.getPartItemData(partId) : null;
        } catch (error) {
            console.error('Barcode lookup failed:', error);
            return null;
        }
    }

    /** One part as the app shows it: its total stock over all its stock items. */
    async getPartItemData(partId: number): Promise<ItemData> {
        const [part, items] = await Promise.all([
            this.request<{
                pk: number; name: string; description: string; IPN: string | null;
                image: string | null; thumbnail: string | null;
                category_detail?: { name: string } | null;
            }>(`/part/${partId}/?category_detail=true`, 'GET', undefined, false, false),
            this.getHomeStockItems(partId),
            // The till reads the price. Without the maps it would show 0.
            this.ensurePricingMaps(),
        ]);
        const main = items[0];
        return {
            id: partId,
            quantity: items.reduce((sum, i) => sum + i.quantity, 0),
            serial: null,
            location: main?.location_detail?.pathstring || main?.location_detail?.name || null,
            status: main?.status_text ?? 'No stock',
            name: part.name,
            description: part.description || '',
            // No pricing_max fallback: it is a cost figure, and charging the
            // supplier cost is a plausible-looking error nobody catches. 0 is not.
            price: this.salePriceMap[partId] ?? 0,
            cost: this.supplierCostMap[partId] ?? 0,
            image: this.getFullImageUrl(part.image),
            part_id: partId,
            ipn: part.IPN || '',
            category: part.category_detail?.name || 'Uncategorized',
        };
    }

    /**
     * Convert image URLs so they route through the nginx proxy.
     * InvenTree returns absolute URLs (http://10.x.x.x/media/...) which
     * bypass the proxy and fail due to mixed-content or unreachable port.
     * We always use just the pathname so /media/ is handled by nginx.
     */
    getFullImageUrl(imageUrl: string | null | undefined): string | null {
        if (!imageUrl) return null;
        try {
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                return new URL(imageUrl).pathname;
            }
        } catch {
            // fall through to relative handling
        }
        // Bare relative path (e.g. "part_images/foo.png") — InvenTree serves these under /media/
        if (!imageUrl.startsWith('/')) {
            return `/media/${imageUrl}`;
        }
        return imageUrl;
    }

    async getAllParts(): Promise<InvenTreePartListResponse> {
        return this.requestAll<InvenTreePartListResponse['results'][number]>(
            '/part/?active=true&virtual=false&limit=500'
        ) as Promise<InvenTreePartListResponse>;
    }

    /**
     * Create a new part
     */
    async createPart(payload: CreatePartPayload): Promise<{ pk: number }> {
        const result = await this.request<{ pk: number }>(
            '/part/',
            'POST',
            payload,
            false,
            false
        );
        
        // Invalidate part list cache
        this.invalidateCache('/part/');
        
        return result;
    }

    /**
     * Update an existing part
     */
    async updatePart(partId: number, payload: UpdatePartPayload): Promise<unknown> {
        const result = await this.request(
            `/part/${partId}/`,
            'PATCH',
            payload,
            false,
            false
        );
        
        // Invalidate part cache
        this.invalidateCache(`/part/${partId}/`);
        this.invalidateCache('/part/');
        
        return result;
    }

    /**
     * Upload an image to a part
     */
    async uploadPartImage(partId: number, imageFile: File): Promise<unknown> {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        const result = await this.request(
            `/part/${partId}/`,
            'PATCH',
            formData,
            true,
            false
        );
        
        // Invalidate part cache
        this.invalidateCache(`/part/${partId}/`);
        
        return result;
    }

    /**
     * Get part details
     */
    async getPart(partId: number): Promise<unknown> {
        return this.request(
            `/part/${partId}/`,
            'GET',
            undefined,
            false,
            true,
            CACHE_TTL.MEDIUM
        );
    }

    /**
     * Link a barcode to a part. A barcode can point at one thing only, so it
     * is first taken off a stock item it may still be linked to.
     */
    async linkBarcodeToPart(barcode: string, partPk: number): Promise<'linked' | 'already'> {
        try {
            const current = await this.request<InvenTreeBarcodeResponse>('/barcode/', 'POST', { barcode }, false, false);
            if (current.part?.pk === partPk) return 'already';
            if (current.stockitem?.pk) {
                await this.request('/barcode/unlink/', 'POST', { stockitem: current.stockitem.pk }, false, false);
            }
        } catch {
            // Not in the registry yet.
        }
        await this.request('/barcode/link/', 'POST', { barcode, part: partPk }, false, false);
        return 'linked';
    }

    /**
     * Record what customers pay for this part.
     *
     * Marks the part salable — InvenTree refuses a sale price break otherwise —
     * and replaces any existing single-unit break so editing a price does not
     * stack duplicates.
     */
    async setSalePrice(partPk: number, price: number, currency: string = 'EUR'): Promise<void> {
        await this.request(`/part/${partPk}/`, 'PATCH', { salable: true }, false, false);
        const existing = await this.request<{ results: { pk: number; part: number; quantity: number }[] }>(
            `/part/sale-price/?part=${partPk}&limit=100`, 'GET', undefined, false, false
        );
        // New break first, old ones after: deleting first left the part with no
        // price (sold at €0) whenever the POST failed.
        const created = await this.request<{ pk: number }>('/part/sale-price/', 'POST',
            { part: partPk, quantity: 1, price: String(price), price_currency: currency }, false, false);
        for (const b of existing.results || []) {
            if (b.quantity === 1 && b.pk !== created?.pk) {
                await this.request(`/part/sale-price/${b.pk}/`, 'DELETE', undefined, false, false);
            }
        }
        this.invalidateCache('/part/sale-price/?limit=500');
    }

    /**
     * Selling price per unit, keyed by internal part pk.
     *
     * This is InvenTree's sale price break, which is where a "price the customer
     * pays" actually belongs. It used to be kept in the stock item's
     * purchase_price, which made InvenTree report the selling price as the cost
     * of goods and left every margin figure wrong.
     */
    async getSalePricePerPart(): Promise<Record<number, number>> {
        const resp = await this.requestAll<{ part: number; quantity: number; price: string | number }>(
            '/part/sale-price/?limit=500'
        );
        // Lowest break quantity is the single-unit price.
        const best = new Map<number, { qty: number; price: number }>();
        for (const b of resp.results || []) {
            const price = typeof b.price === 'string' ? parseFloat(b.price) : b.price;
            if (!isFinite(price)) continue;
            const current = best.get(b.part);
            if (!current || b.quantity < current.qty) best.set(b.part, { qty: b.quantity, price });
        }
        const out: Record<number, number> = {};
        for (const [partPk, v] of best) out[partPk] = v.price;
        return out;
    }

    /**
     * Real supplier cost per single unit, keyed by internal part pk.
     *
     * Deliberately not pricing_min: that is InvenTree's blended "overall" low,
     * which for a part with no supplier is just the selling price echoed back —
     * it would show Multiplex costing the same as it sells for. Build it from
     * the supplier price breaks instead, dividing the pack price by the pack
     * size, and leave parts with no supplier out entirely so the UI can say
     * "unknown" rather than print a wrong number.
     */
    async getSupplierCostPerPart(): Promise<Record<number, number>> {
        const [breaksResp, partsResp] = await Promise.all([
            this.requestAll<{ part: number; quantity: number; price: string | number }>(
                '/company/price-break/?limit=500', true, CACHE_TTL.LONG
            ),
            this.requestAll<{ pk: number; part: number; pack_quantity: string }>(
                '/company/part/?limit=500', true, CACHE_TTL.LONG
            ),
        ]);

        // supplier part -> internal part and pack size
        const supplierParts = new Map<number, { partPk: number; pack: number }>();
        for (const sp of partsResp.results || []) {
            supplierParts.set(sp.pk, { partPk: sp.part, pack: parseFloat(sp.pack_quantity) || 1 });
        }

        // Cheapest break at the smallest order quantity is the base unit price.
        const bestBreak = new Map<number, { qty: number; price: number }>();
        for (const b of breaksResp.results || []) {
            const price = typeof b.price === 'string' ? parseFloat(b.price) : b.price;
            if (!isFinite(price)) continue;
            const current = bestBreak.get(b.part);
            if (!current || b.quantity < current.qty) {
                bestBreak.set(b.part, { qty: b.quantity, price });
            }
        }

        const costs: Record<number, number> = {};
        for (const [supplierPartPk, brk] of bestBreak) {
            const sp = supplierParts.get(supplierPartPk);
            if (!sp || sp.pack <= 0) continue;
            costs[sp.partPk] = brk.price / sp.pack;
        }
        return costs;
    }

    /**
     * Get parts that are below their minimum stock level
     */
    async getLowStockParts(): Promise<InvenTreePartListResponse> {
        return this.request<InvenTreePartListResponse>('/part/?low_stock=true');
    }
}
