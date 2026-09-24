/**
 * InvenTree API Client
 * 
 * Direct HTTP client for InvenTree REST API
 * Replaces the Python backend middleman with direct API calls from the frontend.
 * 
 * Key features:
 * - Stock operations (add, remove, set quantity)
 * - Barcode lookup with multi-step fallback logic
 * - Part and category management
 * - Image upload support
 */

import type {
    ItemData,
    InvenTreeStockItem,
    InvenTreeBarcodeResponse,
    InvenTreePartListResponse,
    InvenTreeStockListResponse,
    InvenTreeCategoryListResponse,
    InvenTreeLocationListResponse,
    InvenTreeTrackingListResponse,
    InvenTreeTrackingEntry,
    StockOperationPayload,
    CreatePartPayload,
    CreateStockItemPayload,
    UpdatePartPayload,
    CreateCategoryPayload,
    CreateLocationPayload,
    InvenTreeCompany,
    CreateSupplierPartPayload,
    PurchaseOrderLine,
} from './types';
import { ApiCache, CACHE_TTL } from '../lib/cache';
import { hasVolunteerSession, markSignedOut, VOLUNTEER_AUTH_FAILED } from '../auth/session';

import { DEFAULTS } from '../constants';

const CURRENCY = DEFAULTS.CURRENCY;

/** Name of the InvenTree customer that till sales are booked on. */
export const TILL_CUSTOMER = 'Walk-in customer';

/** SalesOrderStatus.COMPLETE in InvenTree. */
const SO_STATUS_COMPLETE = 30;

/** How long checkout waits for InvenTree's worker to ship an order. */
const SHIPMENT_TIMEOUT_MS = 30_000;
const SHIPMENT_POLL_MS = 400;

/** Still ours: not sold, installed, consumed or being built. */
export function isHomeStock(item: InvenTreeStockItem): boolean {
    return !item.customer && !item.sales_order && !item.belongs_to && !item.consumed_by && !item.is_building;
}

interface InvenTreeConfig {
    baseUrl: string;
}

export class InvenTreeClient {
    private config: InvenTreeConfig;

    /**
     * Sale prices and supplier costs, memoised so the synchronous stock-item
     * formatter can use them. Callers refresh via ensurePricingMaps() first.
     */
    private salePriceMap: Record<number, number> = {};
    private supplierCostMap: Record<number, number> = {};
    private pricingMapsAt = 0;

    constructor(config: InvenTreeConfig) {
        this.config = config;
    }

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
     * Generic HTTP request handler for InvenTree API with caching
     * 
     * @param endpoint - API endpoint
     * @param method - HTTP method (GET, POST, PATCH, etc.)
     * @param body - Request body
     * @param isFormData - Whether body is FormData
     * @param useCache - Whether to use cache for GET requests (default: true)
     * @param cacheTTL - Cache TTL in milliseconds (default: 90000)
     */
    private async request<T>(
        endpoint: string,
        method: string = 'GET',
        body?: unknown,
        isFormData: boolean = false,
        useCache: boolean = true,
        cacheTTL: number = CACHE_TTL.MEDIUM
    ): Promise<T> {
        const url = `${this.config.baseUrl}/api/${endpoint.replace(/^\//, '')}`;

        // Generate cache key for GET requests
        const cacheKey = `${method}_${endpoint}`;
        
        // Try cache for GET requests
        if (method === 'GET' && useCache) {
            const cached = ApiCache.get<T>(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }
        
        // The proxy adds the InvenTree token. Volunteer-only calls are allowed
        // by the sign-in cookie, which the browser sends on its own.
        const headers: Record<string, string> = {};
        const wasSignedIn = hasVolunteerSession();

        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: isFormData ? (body as BodyInit) : (body ? JSON.stringify(body) : undefined),
            });

            if (!response.ok) {
                let errorText = await response.text().catch(() => 'No error details');
                
                // Strip HTML from error responses (e.g. nginx 502/504 pages)
                if (errorText.includes('<') && errorText.includes('>')) {
                    const statusMessages: Record<number, string> = {
                        502: 'InvenTree server is unreachable (Bad Gateway)',
                        503: 'InvenTree server is unavailable',
                        504: 'InvenTree server timed out',
                        401: 'Authentication failed — check your API token',
                        403: 'Access denied — insufficient permissions',
                        404: 'Resource not found',
                    };
                    errorText = statusMessages[response.status] || `Server returned ${response.status}`;
                }
                
                if (response.status === 401) {
                    if (wasSignedIn) {
                        markSignedOut();
                        window.dispatchEvent(new Event(VOLUNTEER_AUTH_FAILED));
                    }
                    throw new Error(wasSignedIn
                        ? 'Volunteer sign-in expired - sign in again'
                        : 'Only volunteers can do this - sign in first');
                }
                throw new Error(`InvenTree API error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            // Normalize InvenTree response: if it's a flat array, wrap it in a results object
            const normalizedData = Array.isArray(data) 
                ? { count: data.length, results: data } as unknown as T
                : data;
            
            // Cache GET responses
            if (method === 'GET' && useCache) {
                ApiCache.set(cacheKey, normalizedData, cacheTTL);
            }
            
            return normalizedData;
        } catch (error) {
            if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('NetworkError') || error.message.includes('Failed to fetch'))) {
                console.error(
                    `[InvenTree] Cannot connect to InvenTree at ${this.config.baseUrl} — server unreachable or CORS blocked.`,
                    `\n  Endpoint: ${method} ${endpoint}`,
                    `\n  Check VITE_INVENTREE_URL and that the server is running.`,
                    error
                );
            } else {
                console.error(`[InvenTree] API call failed: ${method} ${endpoint}`, error);
            }
            throw error;
        }
    }
    
    /**
     * Invalidate cached data for an endpoint
     */
    invalidateCache(endpoint: string, method: string = 'GET'): void {
        // Prefix match: '/stock/' also clears '/stock/?part=8&...'.
        ApiCache.removePrefix(`${method}_${endpoint}`);
    }
    
    /**
     * Clear all cached API data
     */
    clearCache(): void {
        ApiCache.clear();
    }

    // ==================== Stock Operations ====================

    /**
     * Add stock to an inventory item
     */
    async addStock(itemId: number, quantity: number, notes: string = 'Added via Stock App'): Promise<void> {
        const payload: StockOperationPayload = {
            items: [{ pk: itemId, quantity }],
            notes,
        };
        await this.request('/stock/add/', 'POST', payload, false, false);
        
        // Invalidate related caches
        this.invalidateCache(`/stock/${itemId}/?part_detail=true&location_detail=true`);
        this.invalidateCache('/stock/');
    }

    /**
     * Remove stock from an inventory item
     */
    async removeStock(itemId: number, quantity: number, notes: string = 'Removed via Stock App'): Promise<void> {
        const payload: StockOperationPayload = {
            items: [{ pk: itemId, quantity }],
            notes,
        };
        await this.request('/stock/remove/', 'POST', payload, false, false);
        
        // Invalidate related caches
        this.invalidateCache(`/stock/${itemId}/?part_detail=true&location_detail=true`);
        this.invalidateCache('/stock/');
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
            false,
            true,
            CACHE_TTL.SHORT
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
                'GET', undefined, false, true, CACHE_TTL.MEDIUM
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
            `/stock/?part=${partId}&sent_to_customer=false&consumed=false&installed=false&location_detail=true&limit=100`, 'GET', undefined, false, false
        );
        return (resp.results as unknown as InvenTreeStockItem[])
            .filter(isHomeStock)
            .sort((a, b) => b.quantity - a.quantity);
    }

    /** Add to the part's main stock item, or create one in the part's default location. */
    async addStockToPart(partId: number, quantity: number, notes: string): Promise<void> {
        const [home] = await this.getHomeStockItems(partId);
        if (home) return this.addStock(home.pk, quantity, notes);

        const part = await this.request<{ default_location: number | null }>(`/part/${partId}/`, 'GET', undefined, false, false);
        if (!part.default_location) {
            throw new Error('This item has no stock yet and no default location. Set one in InvenTree first.');
        }
        await this.createStockItem({ part: partId, quantity, location: part.default_location, notes });
    }

    /** Remove from the part's stock items, largest first. For corrections, not sales. */
    async removeStockFromPart(partId: number, quantity: number, notes: string): Promise<void> {
        let left = quantity;
        for (const item of await this.getHomeStockItems(partId)) {
            if (left <= 0) break;
            const take = Math.min(left, item.quantity);
            if (take > 0) await this.removeStock(item.pk, take, notes);
            left -= take;
        }
        if (left > 0) throw new Error(`Only ${quantity - left} in stock, could not remove ${quantity}.`);
    }

    /** Set the part's total stock. */
    async setPartStock(partId: number, target: number, notes: string): Promise<void> {
        const items = await this.getHomeStockItems(partId);
        const total = items.reduce((sum, i) => sum + i.quantity, 0);
        if (target > total) return this.addStockToPart(partId, target - total, notes);
        if (target < total) return this.removeStockFromPart(partId, total - target, notes);
    }

    // ==================== Checkout via sales orders ====================

    private tillCustomerPk: number | null = null;

    /** The InvenTree customer every till sale is booked on. Creating it needs a volunteer. */
    async getTillCustomer(): Promise<number> {
        if (this.tillCustomerPk) return this.tillCustomerPk;
        const found = await this.request<InvenTreeCompany[] | { results: InvenTreeCompany[] }>(
            `/company/?is_customer=true&search=${encodeURIComponent(TILL_CUSTOMER)}`, 'GET', undefined, false, false
        );
        const list = Array.isArray(found) ? found : found.results;
        const existing = list.find(c => c.name === TILL_CUSTOMER);
        if (existing) return (this.tillCustomerPk = existing.pk);

        try {
            const created = await this.request<InvenTreeCompany>('/company/', 'POST', {
                name: TILL_CUSTOMER,
                description: 'Sales at the self-service till of the stock app',
                is_customer: true,
                is_supplier: false,
                is_manufacturer: false,
            }, false, false);
            return (this.tillCustomerPk = created.pk);
        } catch (err) {
            if (!hasVolunteerSession()) {
                throw new Error(`InvenTree has no "${TILL_CUSTOMER}" customer yet. A volunteer has to sign in once to set it up.`);
            }
            throw err;
        }
    }

    /**
     * Book a till sale as a sales order: create it, add the lines, issue it,
     * allocate stock to one shipment, ship it and complete the order.
     *
     * Items the app thinks are out of stock are still sold: the line stays
     * partly unshipped, which shows the difference in InvenTree instead of
     * refusing the sale.
     */
    async sellParts(
        lines: { partId: number; quantity: number; unitPrice: number }[],
        extras: number,
        description: string,
    ): Promise<{ reference: string; unshipped: { partId: number; quantity: number }[] }> {
        const customer = await this.getTillCustomer();
        const order = await this.request<{ pk: number; reference: string }>('/order/so/', 'POST', {
            customer,
            description: description.slice(0, 250),
        }, false, false);

        // Once a shipment is handed to InvenTree's worker, cancelling the order
        // could leave stock shipped against a cancelled order.
        let shipping = false;
        try {
            const lineItems: { pk: number; partId: number; quantity: number }[] = [];
            for (const line of lines) {
                const created = await this.request<{ pk: number }>('/order/so-line/', 'POST', {
                    order: order.pk,
                    part: line.partId,
                    quantity: line.quantity,
                    sale_price: line.unitPrice.toFixed(2),
                    sale_price_currency: CURRENCY,
                }, false, false);
                lineItems.push({ pk: created.pk, partId: line.partId, quantity: line.quantity });
            }
            if (extras > 0) {
                await this.request('/order/so-extra-line/', 'POST', {
                    order: order.pk,
                    reference: 'Extra services',
                    quantity: 1,
                    price: extras.toFixed(2),
                    price_currency: CURRENCY,
                }, false, false);
            }

            await this.request(`/order/so/${order.pk}/issue/`, 'POST', {}, false, false);

            const allocations: { line_item: number; stock_item: number; quantity: number }[] = [];
            const unshipped: { partId: number; quantity: number }[] = [];
            for (const line of lineItems) {
                let left = line.quantity;
                for (const item of await this.getHomeStockItems(line.partId)) {
                    if (left <= 0) break;
                    const take = Math.min(left, item.quantity);
                    if (take > 0) allocations.push({ line_item: line.pk, stock_item: item.pk, quantity: take });
                    left -= take;
                }
                if (left > 0) unshipped.push({ partId: line.partId, quantity: left });
            }

            if (allocations.length > 0) {
                const shipment = await this.request<{ pk: number }>('/order/so/shipment/', 'POST', {
                    order: order.pk,
                    reference: '1',
                }, false, false);
                await this.request(`/order/so/${order.pk}/allocate/`, 'POST', {
                    items: allocations,
                    shipment: shipment.pk,
                }, false, false);
                await this.request(`/order/so/shipment/${shipment.pk}/ship/`, 'POST', {}, false, false);
                shipping = true;
                // Shipping runs in InvenTree's background worker, which sets
                // shipment_date when the stock has actually moved.
                const deadline = Date.now() + SHIPMENT_TIMEOUT_MS;
                for (;;) {
                    const state = await this.request<{ shipment_date: string | null }>(
                        `/order/so/shipment/${shipment.pk}/`, 'GET', undefined, false, false
                    );
                    if (state.shipment_date) break;
                    if (Date.now() > deadline) {
                        throw new Error(`${order.reference} is booked, but InvenTree is still shipping it. Check the order in InvenTree.`);
                    }
                    await new Promise(r => setTimeout(r, SHIPMENT_POLL_MS));
                }
            }

            // Without SALESORDER_SHIP_COMPLETE the first call only reaches "shipped".
            for (let i = 0; i < 2; i++) {
                const state = await this.request<{ status: number }>(`/order/so/${order.pk}/`, 'GET', undefined, false, false);
                if (state.status === SO_STATUS_COMPLETE) break;
                await this.request(`/order/so/${order.pk}/complete/`, 'POST', { accept_incomplete: true }, false, false);
            }

            this.invalidateCache('/stock/');
            return { reference: order.reference, unshipped };
        } catch (err) {
            // Leave no half-finished order behind, unless stock may already be moving.
            if (!shipping) {
                await this.request(`/order/so/${order.pk}/cancel/`, 'POST', {}, false, false).catch(() => undefined);
            }
            throw err;
        }
    }

    // ==================== Barcode Lookup ====================

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

    // ==================== Part Management ====================

    async getAllParts(): Promise<InvenTreePartListResponse> {
        return this.request(
            '/part/?active=true&limit=500',
            'GET',
            undefined,
            false,
            true,
            CACHE_TTL.MEDIUM
        );
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

    // ==================== Stock Item Management ====================

    /**
     * Create a new stock item
     */
    async createStockItem(payload: CreateStockItemPayload): Promise<{ pk: number }> {
        const result = await this.request<{ pk: number } | { pk: number }[]>(
            '/stock/',
            'POST',
            payload,
            false,
            false
        );

        // Invalidate stock list cache
        this.invalidateCache('/stock/');

        // InvenTree returns an array when creating stock items
        return Array.isArray(result) ? result[0] : result;
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

    // ==================== Categories ====================

    /**
     * Get all categories (cached for 1 hour - categories change rarely)
     */
    async getCategories(): Promise<InvenTreeCategoryListResponse> {
        return this.request<InvenTreeCategoryListResponse>(
            '/part/category/',
            'GET',
            undefined,
            false,
            true,
            CACHE_TTL.LONG
        );
    }

    /**
     * Create a new category
     */
    async createCategory(payload: CreateCategoryPayload): Promise<{ pk: number }> {
        const result = await this.request<{ pk: number }>(
            '/part/category/',
            'POST',
            payload,
            false,
            false
        );
        
        // Invalidate categories cache
        this.invalidateCache('/part/category/');
        
        return result;
    }

    // ==================== Locations ====================

    /**
     * Get all stock locations (cached for 1 hour - locations change rarely)
     */
    async getLocations(): Promise<InvenTreeLocationListResponse> {
        return this.request<InvenTreeLocationListResponse>(
            '/stock/location/',
            'GET',
            undefined,
            false,
            true,
            CACHE_TTL.LONG
        );
    }

    /**
     * Create a new location
     */
    async createLocation(payload: CreateLocationPayload): Promise<{ pk: number }> {
        const result = await this.request<{ pk: number }>(
            '/stock/location/',
            'POST',
            payload,
            false,
            false
        );
        
        // Invalidate locations cache
        this.invalidateCache('/stock/location/');
        
        return result;
    }

    // ==================== Suppliers / Companies ====================

    async getSuppliers(): Promise<InvenTreeCompany[]> {
        const result = await this.request<{ results: InvenTreeCompany[] }>(
            '/company/?is_supplier=true&limit=200',
            'GET',
            undefined,
            false,
            true,
            CACHE_TTL.LONG
        );
        return result.results;
    }

    async createSupplier(payload: { name: string; description?: string; website?: string; email?: string; phone?: string; address?: string }): Promise<{ pk: number; name: string }> {
        return this.request<{ pk: number; name: string }>('/company/', 'POST', {
            ...payload,
            is_supplier: true,
            is_manufacturer: false,
            is_customer: false,
        }, false, false);
    }

    async createSupplierPart(payload: CreateSupplierPartPayload): Promise<{ pk: number }> {
        return this.request<{ pk: number }>('/company/part/', 'POST', payload, false, false);
    }

    async getAllSupplierParts(): Promise<{ pk: number; part: number; supplier: number; SKU: string }[]> {
        const result = await this.request<{ results: { pk: number; part: number; supplier: number; SKU: string }[] }>(
            '/company/part/?limit=500',
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    async getSupplierPartsForSupplier(supplierPk: number): Promise<{ pk: number; part: number; supplier: number; SKU: string; pack_quantity: string }[]> {
        const result = await this.request<{ results: { pk: number; part: number; supplier: number; SKU: string; pack_quantity: string }[] }>(
            `/company/part/?supplier=${supplierPk}&limit=200`,
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    // ==================== Purchase Orders ====================

    async getPurchaseOrders(): Promise<{ pk: number; reference: string; status: number; status_text: string; supplier: number; supplier_detail: { name: string }; description: string; creation_date: string }[]> {
        const result = await this.request<{ results: Awaited<ReturnType<InvenTreeClient['getPurchaseOrders']>> }>(
            '/order/po/?limit=50&ordering=-creation_date',
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    async createPurchaseOrder(payload: { supplier: number; reference?: string; description?: string }): Promise<{ pk: number; reference: string }> {
        return this.request('/order/po/', 'POST', payload, false, false);
    }

    async addPurchaseOrderLine(payload: { order: number; part: number; quantity: number; purchase_price?: string; purchase_price_currency?: string }): Promise<{ pk: number }> {
        return this.request('/order/po-line/', 'POST', payload, false, false);
    }

    async issuePurchaseOrder(poPk: number): Promise<void> {
        await this.request(`/order/po/${poPk}/issue/`, 'POST', {}, false, false);
    }

    async cancelPurchaseOrder(poPk: number): Promise<void> {
        await this.request(`/order/po/${poPk}/cancel/`, 'POST', {}, false, false);
    }

    /**
     * Line items on an order. `quantity` and `received` are both counted in
     * supplier packs, not in single units — multiply by the supplier part's
     * pack_quantity to show units.
     */
    async getPurchaseOrderLines(poPk: number): Promise<PurchaseOrderLine[]> {
        const result = await this.request<{ results: PurchaseOrderLine[] }>(
            `/order/po-line/?order=${poPk}&part_detail=true&limit=100`,
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    /**
     * Book received goods in against the order.
     *
     * Quantities are in packs, matching the line items. InvenTree creates the
     * stock itself, applying pack_quantity, and bumps each line's `received`.
     */
    async receivePurchaseOrderItems(
        poPk: number,
        items: { line_item: number; quantity: number; location: number; batch_code?: string }[],
        locationPk: number
    ): Promise<void> {
        await this.request(
            `/order/po/${poPk}/receive/`,
            'POST',
            {
                items: items.map(i => ({
                    line_item: i.line_item,
                    quantity: i.quantity,
                    location: i.location,
                    batch_code: i.batch_code ?? '',
                    status: 10, // StockStatus.OK
                })),
                location: locationPk,
            },
            false,
            false
        );
    }

    /**
     * Close the order. InvenTree refuses to close an order with outstanding
     * lines unless accept_incomplete is set, which is the "we are not getting
     * the rest" case.
     */
    async completePurchaseOrder(poPk: number, acceptIncomplete: boolean = false): Promise<void> {
        await this.request(
            `/order/po/${poPk}/complete/`,
            'POST',
            { accept_incomplete: acceptIncomplete },
            false,
            false
        );
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
            false,
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
        this.invalidateCache('/stock/');
        return failed;
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
        for (const b of existing.results || []) {
            if (b.quantity === 1) {
                await this.request(`/part/sale-price/${b.pk}/`, 'DELETE', undefined, false, false);
            }
        }
        await this.request('/part/sale-price/', 'POST',
            { part: partPk, quantity: 1, price: String(price), price_currency: currency }, false, false);
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
        const resp = await this.request<{ results: { part: number; quantity: number; price: string | number }[] }>(
            '/part/sale-price/?limit=500', 'GET', undefined, false, true, CACHE_TTL.MEDIUM
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
            this.request<{ results: { part: number; quantity: number; price: string | number }[] }>(
                '/company/price-break/?limit=500', 'GET', undefined, false, true, CACHE_TTL.LONG
            ),
            this.request<{ results: { pk: number; part: number; pack_quantity: string }[] }>(
                '/company/part/?limit=500', 'GET', undefined, false, true, CACHE_TTL.LONG
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

    async getStockLocations(): Promise<{ pk: number; name: string; pathstring: string }[]> {
        const result = await this.request<{ results: { pk: number; name: string; pathstring: string }[] }>(
            '/stock/location/?limit=100',
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    // ==================== Dashboard & Metrics ====================

    /**
     * Set the purchase price (supplier unit cost) on a stock item
     */
    async setStockItemPurchasePrice(stockItemPk: number, unitPrice: number, currency: string = 'EUR'): Promise<void> {
        await this.request(
            `/stock/${stockItemPk}/`,
            'PATCH',
            { purchase_price: unitPrice.toString(), purchase_price_currency: currency },
            false,
            false
        );
        this.invalidateCache(`/stock/${stockItemPk}/?part_detail=true&location_detail=true`);
        this.invalidateCache('/stock/');
    }

    /**
     * Get recent stock tracking entries
     */
    async getStockTracking(limit: number = 10): Promise<InvenTreeTrackingListResponse> {
        return this.request<InvenTreeTrackingListResponse>(
            `/stock/track/?limit=${limit}&ordering=-date`
        );
    }

    /**
     * The complete tracking log, newest first. Pages through the API so the
     * history charts are not cut off at the first page.
     */
    async getAllStockTracking(pageSize: number = 500): Promise<InvenTreeTrackingEntry[]> {
        const all: InvenTreeTrackingEntry[] = [];
        for (let offset = 0; ; offset += pageSize) {
            const path = `/stock/track/?limit=${pageSize}&offset=${offset}&ordering=-date`;
            const page = await this.request<InvenTreeTrackingListResponse>(path, 'GET', undefined, false, false);
            all.push(...page.results);
            if (page.results.length < pageSize || all.length >= page.count) return all;
        }
    }

    /**
     * Get parts that are below their minimum stock level
     */
    async getLowStockParts(): Promise<InvenTreePartListResponse> {
        return this.request<InvenTreePartListResponse>('/part/?low_stock=true');
    }
}

// ==================== Singleton Instance ====================
const envUrl = import.meta.env.VITE_INVENTREE_URL;
// Empty string: relative paths through the proxy on the current origin.
const INVENTREE_URL = (envUrl !== undefined && envUrl !== null) ? envUrl : '';

export const inventreeClient = new InvenTreeClient({ baseUrl: INVENTREE_URL });

export default inventreeClient;
