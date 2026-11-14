/** Stock items: add/remove/set, per-part stock, merging, tracking log. */

import type {
    InvenTreeStockItem,
    InvenTreeStockListResponse,
    InvenTreeTrackingListResponse,
    InvenTreeTrackingEntry,
    StockOperationPayload,
    CreateStockItemPayload,
} from './types';
import { HttpBase } from './http';

/** Still ours: not sold, installed, consumed or being built. */
export function isHomeStock(item: InvenTreeStockItem): boolean {
    return !item.customer && !item.sales_order && !item.belongs_to && !item.consumed_by && !item.is_building;
}

export class StockApi extends HttpBase {
    /**
     * Add stock to an inventory item
     */
    async addStock(itemId: number, quantity: number, notes: string = 'Added via Stock App'): Promise<void> {
        const payload: StockOperationPayload = {
            items: [{ pk: itemId, quantity }],
            notes,
        };
        await this.request('/stock/add/', 'POST', payload, false);
    }

    /**
     * Remove stock from an inventory item
     */
    async removeStock(itemId: number, quantity: number, notes: string = 'Removed via Stock App'): Promise<void> {
        const payload: StockOperationPayload = {
            items: [{ pk: itemId, quantity }],
            notes,
        };
        await this.request('/stock/remove/', 'POST', payload, false);
    }

    /**
     * Set stock to an absolute quantity
     * Calculates the difference and performs add or remove operation
     */
    async setStock(itemId: number, targetQuantity: number, notes: string = 'Stock set via App'): Promise<void> {
        const stockItem = await this.getStockItem(itemId);
        const currentQuantity = stockItem.quantity;
        const difference = targetQuantity - currentQuantity;

        if (difference === 0) {
            return; // Already at target quantity
        }

        if (difference > 0) {
            await this.addStock(itemId, difference, notes);
        } else {
            await this.removeStock(itemId, Math.abs(difference), notes);
        }
    }

    /**
     * Get detailed stock item information (cached for 2 minutes)
     */
    async getStockItem(itemId: number): Promise<InvenTreeStockItem> {
        return this.request<InvenTreeStockItem>(
            `/stock/${itemId}/?part_detail=true&location_detail=true`,
            'GET',
            undefined,
            false
        );
    }

    /**
     * Get all stock items with optional filters (cached for 15 minutes)
     */
    async getAllStockItems(filters?: {
        part?: number;
        location?: number;
        in_stock?: boolean;
        search?: string;
        /** Only stock that is still ours: not sold, consumed or installed. */
        home?: boolean;
    }): Promise<InvenTreeStockListResponse> {
        const params = new URLSearchParams();
        if (filters?.part) params.append('part', String(filters.part));
        if (filters?.location) params.append('location', String(filters.location));
        if (filters?.in_stock !== undefined) params.append('in_stock', String(filters.in_stock));
        if (filters?.search) params.append('search', filters.search);
        if (filters?.home) {
            params.append('sent_to_customer', 'false');
            params.append('consumed', 'false');
            params.append('installed', 'false');
        }
        params.append('part_detail', 'true');
        params.append('location_detail', 'true');

        // Every sale adds a stock item at the customer, so page through
        // instead of trusting one page to hold everything.
        const pageSize = 500;
        const results: InvenTreeStockListResponse['results'] = [];
        for (let offset = 0; ; offset += pageSize) {
            const page = await this.request<InvenTreeStockListResponse>(
                `/stock/?${params.toString()}&limit=${pageSize}&offset=${offset}`,
                'GET', undefined, false
            );
            results.push(...page.results);
            if (page.results.length < pageSize || results.length >= page.count) {
                return { count: results.length, results } as InvenTreeStockListResponse;
            }
        }
    }

    // ==================== Stock per part ====================
    //
    // The app works per part. Sales orders move sold units into new stock items
    // "at the customer", and sometimes move a whole item, so a part's stock items
    // change over time. These methods pick the right items at the moment of the
    // action instead of remembering item IDs.

    /** A part's stock items that are still ours, including empty ones, largest first. */
    async getHomeStockItems(partId: number): Promise<InvenTreeStockItem[]> {
        const resp = await this.request<InvenTreeStockListResponse>(
            `/stock/?part=${partId}&sent_to_customer=false&consumed=false&installed=false&location_detail=true&limit=100`, 'GET', undefined, false
        );
        return (resp.results as unknown as InvenTreeStockItem[])
            .filter(isHomeStock)
            .sort((a, b) => b.quantity - a.quantity);
    }

    /** Add to the part's main stock item, or create one in the part's default location. */
    async addStockToPart(partId: number, quantity: number, notes: string): Promise<void> {
        const [home] = await this.getHomeStockItems(partId);
        if (home) return this.addStock(home.pk, quantity, notes);

        const part = await this.request<{ default_location: number | null }>(`/part/${partId}/`, 'GET', undefined, false);
        if (!part.default_location) {
            throw new Error('This item has no stock yet and no default location. Set one in InvenTree first.');
        }
        await this.createStockItem({ part: partId, quantity, location: part.default_location, notes });
    }

    /** Remove from the part's stock items, largest first. For corrections, not sales. */
    async removeStockFromPart(partId: number, quantity: number, notes: string): Promise<void> {
        // One request for all stock items: InvenTree applies it in full or not at
        // all. One call per item could fail halfway, and a retry removed the first part twice.
        const items: { pk: number; quantity: number }[] = [];
        let left = quantity;
        for (const item of await this.getHomeStockItems(partId)) {
            if (left <= 0) break;
            const take = Math.min(left, item.quantity);
            if (take > 0) items.push({ pk: item.pk, quantity: take });
            left -= take;
        }
        if (left > 0) throw new Error(`Only ${quantity - left} in stock, could not remove ${quantity}.`);
        await this.request('/stock/remove/', 'POST', { items, notes }, false);
    }

    /** Set the part's total stock. */
    async setPartStock(partId: number, target: number, notes: string): Promise<void> {
        const items = await this.getHomeStockItems(partId);
        const total = items.reduce((sum, i) => sum + i.quantity, 0);
        if (target > total) return this.addStockToPart(partId, target - total, notes);
        if (target < total) return this.removeStockFromPart(partId, total - target, notes);
    }

    /**
     * Create a new stock item
     */
    async createStockItem(payload: CreateStockItemPayload): Promise<{ pk: number }> {
        const result = await this.request<{ pk: number } | { pk: number }[]>(
            '/stock/',
            'POST',
            payload,
            false
        );

        // InvenTree returns an array when creating stock items
        return Array.isArray(result) ? result[0] : result;
    }

    /**
     * Fold several stock items of the same part into one.
     *
     * Receiving always creates a fresh stock item, but this setup keeps a single
     * long-lived item per part and the stock list, the TV screen and the barcode
     * scanner all assume that. Merging straight after a delivery keeps that true.
     * The lowest pk is merged into, so the item everything already points at is
     * the one that survives.
     */
    async mergeStockItems(itemPks: number[], locationPk: number): Promise<void> {
        if (itemPks.length < 2) return;
        const ordered = [...itemPks].sort((a, b) => a - b);
        await this.request(
            '/stock/merge/',
            'POST',
            {
                items: ordered.map(pk => ({ item: pk })),
                location: locationPk,
                allow_mismatched_suppliers: true,
                allow_mismatched_status: true,
                notes: 'Consolidated after receiving a purchase order',
            },
            false
        );
    }

    /**
     * After a delivery, collapse each part back to one stock item per location.
     * Reports which parts could not be merged rather than throwing — the stock is
     * already booked in by this point, so a failure here is untidy, not lost.
     */
    async consolidateStockForParts(partPks: number[], locationPk: number): Promise<string[]> {
        const failed: string[] = [];
        for (const partPk of Array.from(new Set(partPks))) {
            try {
                const resp = await this.getAllStockItems({ part: partPk, location: locationPk });
                const pks = (resp.results || []).map((i: { pk: number }) => i.pk);
                if (pks.length > 1) {
                    await this.mergeStockItems(pks, locationPk);
                }
            } catch {
                failed.push(String(partPk));
            }
        }
        return failed;
    }

    /**
     * Set the purchase price (supplier unit cost) on a stock item
     */
    async setStockItemPurchasePrice(stockItemPk: number, unitPrice: number, currency: string = 'EUR'): Promise<void> {
        await this.request(
            `/stock/${stockItemPk}/`,
            'PATCH',
            { purchase_price: unitPrice.toString(), purchase_price_currency: currency },
            false
        );
    }

    /**
     * Recent stock history. InvenTree 1.7 dropped /stock/track/; the same events
     * now come from /audit/, mapped here to the old entry shape.
     */
    async getStockTracking(limit: number = 10): Promise<InvenTreeTrackingListResponse> {
        const page = await this.request<AuditListResponse>(
            `/audit/?model_type=stockitem&limit=${limit}&ordering=-timestamp`
        );
        return { count: page.count, results: page.results.map(auditToTracking) };
    }

    /**
     * The complete history, newest first. Pages through the API so the
     * history charts are not cut off at the first page.
     */
    async getAllStockTracking(pageSize: number = 500): Promise<InvenTreeTrackingEntry[]> {
        const all: InvenTreeTrackingEntry[] = [];
        for (let offset = 0; ; offset += pageSize) {
            const path = `/audit/?model_type=stockitem&limit=${pageSize}&offset=${offset}&ordering=-timestamp`;
            const page = await this.request<AuditListResponse>(path, 'GET', undefined, false);
            all.push(...page.results.map(auditToTracking));
            if (page.results.length < pageSize || all.length >= page.count) return all;
        }
    }
}

interface AuditEntry {
    pk: number;
    timestamp: string;
    actor: number | null;
    event_type: number;
    event_label: string;
    notes: string | null;
    deltas: InvenTreeTrackingEntry['deltas'] | null;
    object_pk: string;
    parent_object_pk: string | null;
}
interface AuditListResponse {
    count: number;
    results: AuditEntry[];
}

function auditToTracking(e: AuditEntry): InvenTreeTrackingEntry {
    return {
        pk: e.pk,
        item: Number(e.object_pk),
        part: Number(e.parent_object_pk),
        date: e.timestamp.replace(' ', 'T'), // "2026-11-10 17:00" is not ISO
        deltas: e.deltas ?? {},
        label: e.event_label,
        notes: e.notes ?? '',
        tracking_type: e.event_type,
        user: e.actor ?? 0,
    };
}
