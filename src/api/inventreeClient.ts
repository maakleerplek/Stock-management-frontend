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
    StockOperationPayload,
    CreatePartPayload,
    CreateStockItemPayload,
    UpdatePartPayload,
    CreateCategoryPayload,
    CreateLocationPayload,
} from './types';
import { ApiCache, CACHE_TTL } from '../lib/cache';

interface InvenTreeConfig {
    baseUrl: string;
    token: string;
}

class InvenTreeClient {
    private config: InvenTreeConfig;

    constructor(config: InvenTreeConfig) {
        this.config = config;
    }

    /**
     * Generic HTTP request handler for InvenTree API with caching
     * 
     * @param endpoint - API endpoint
     * @param method - HTTP method (GET, POST, PATCH, etc.)
     * @param body - Request body
     * @param isFormData - Whether body is FormData
     * @param useCache - Whether to use cache for GET requests (default: true)
     * @param cacheTTL - Cache TTL in milliseconds (default: CACHE_TTL.MEDIUM)
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
        console.log(`[InvenTree] ${method} ${url}`, body !== undefined ? body : '');

        // Generate cache key for GET requests
        const cacheKey = `${method}_${endpoint}`;
        
        // Try cache for GET requests
        if (method === 'GET' && useCache) {
            const cached = ApiCache.get<T>(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }
        
        const headers: Record<string, string> = {
            'Authorization': `Token ${this.config.token}`,
        };

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
                const errorText = await response.text().catch(() => 'No error details');
                if (response.status === 401 || response.status === 403) {
                    console.error(`[InvenTree] Authentication failed (${response.status}) — check VITE_INVENTREE_TOKEN.`, errorText);
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
        const cacheKey = `${method}_${endpoint}`;
        ApiCache.remove(cacheKey);
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
    }): Promise<InvenTreeStockListResponse> {
        const params = new URLSearchParams();
        if (filters?.part) params.append('part', String(filters.part));
        if (filters?.location) params.append('location', String(filters.location));
        if (filters?.in_stock !== undefined) params.append('in_stock', String(filters.in_stock));
        if (filters?.search) params.append('search', filters.search);

        params.append('part_detail', 'true');
        params.append('location_detail', 'true');
        const queryString = params.toString();
        const endpoint = `/stock/?${queryString}`;
        
        return this.request<InvenTreeStockListResponse>(
            endpoint,
            'GET',
            undefined,
            false,
            true,
            CACHE_TTL.MEDIUM
        );
    }

    // ==================== Barcode Lookup ====================

    /**
     * Look up stock item by barcode with multi-step fallback logic
     * 
     * Fallback order:
     * 1. Direct barcode scan (stock item has this barcode)
     * 2. Part barcode (find stock for that part)
     * 3. IPN (Internal Part Number) search
     * 4. Part name search (partial match)
     * 
     * Note: Barcode lookups are NOT cached since they're real-time user actions
     */
    async lookupBarcode(barcode: string): Promise<ItemData | null> {
        if (!barcode || barcode === 'No result') {
            return null;
        }

        try {
            let stockId: number | null = null;

            // Step 1: Try direct barcode scan (no cache for real-time lookups)
            try {
                const barcodeResp = await this.request<InvenTreeBarcodeResponse>(
                    '/barcode/',
                    'POST',
                    { barcode },
                    false,
                    false // Don't cache barcode lookups
                );

                stockId = barcodeResp.stockitem?.pk ?? null;

                // Step 2: If part matched but no stock item, find stock for that part
                if (!stockId && barcodeResp.part?.pk) {
                    console.debug(`Barcode matched part ${barcodeResp.part.pk}, searching for stock`);
                    const stockItems = await this.getAllStockItems({
                        part: barcodeResp.part.pk,
                        in_stock: true,
                    });
                    stockId = stockItems.results[0]?.pk ?? null;
                }
            } catch (error) {
                console.debug('Direct barcode lookup failed, trying fallbacks', error);
            }

            // Step 3: Fallback - Search by IPN (Internal Part Number)
            if (!stockId) {
                console.debug('Trying IPN search for:', barcode);
                const parts = await this.request<InvenTreePartListResponse>(
                    `/part/?IPN=${encodeURIComponent(barcode)}`,
                    'GET',
                    undefined,
                    false,
                    false // Don't cache searches
                );
                const partId = parts.results[0]?.pk;
                if (partId) {
                    const stockItems = await this.getAllStockItems({
                        part: partId,
                        in_stock: true,
                    });
                    stockId = stockItems.results[0]?.pk ?? null;
                }
            }

            // Step 4: Fallback - Search by part name (partial match)
            if (!stockId) {
                console.debug('Trying part name search for:', barcode);
                const parts = await this.request<InvenTreePartListResponse>(
                    `/part/?search=${encodeURIComponent(barcode)}`,
                    'GET',
                    undefined,
                    false,
                    false // Don't cache searches
                );
                const partId = parts.results[0]?.pk;
                if (partId) {
                    const stockItems = await this.getAllStockItems({
                        part: partId,
                        in_stock: true,
                    });
                    stockId = stockItems.results[0]?.pk ?? null;
                }
            }

            if (!stockId) {
                console.debug('No stock item found for barcode:', barcode);
                return null;
            }

            // Get full details and format for the app
            const stockItem = await this.getStockItem(stockId);
            return this.formatStockItemData(stockItem);

        } catch (error) {
            console.error('Barcode lookup failed:', error);
            return null;
        }
    }

    /**
     * Transform InvenTree stock item response to app's ItemData format
     */
    private formatStockItemData(stockItem: InvenTreeStockItem): ItemData {
        const partDetail = stockItem.part_detail;
        const locationDetail = stockItem.location_detail;

        return {
            id: stockItem.pk,
            quantity: stockItem.quantity,
            serial: stockItem.serial,
            location: locationDetail?.pathstring || locationDetail?.name || null,
            status: stockItem.status_text,
            name: partDetail?.name || '',
            description: partDetail?.description || '',
            price: partDetail?.pricing_min || 0,
            image: this.getFullImageUrl(partDetail?.image),
            part_id: stockItem.part,
            ipn: partDetail?.IPN || '',
            category: partDetail?.category_name || 'Uncategorized',
        };
    }

    /**
     * Convert relative image URLs to absolute URLs
     */
    private getFullImageUrl(imageUrl: string | null | undefined): string | null {
        if (!imageUrl) return null;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            return imageUrl;
        }
        return `${this.config.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }

    // ==================== Part Management ====================

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
        const result = await this.request<{ pk: number }>(
            '/stock/',
            'POST',
            payload,
            false,
            false
        );
        
        // Invalidate stock list cache
        this.invalidateCache('/stock/');
        
        return result;
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
        console.log('[InvenTree] createLocation called with payload:', payload);
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

    // ==================== Dashboard & Metrics ====================

    /**
     * Get recent stock tracking entries
     */
    async getStockTracking(limit: number = 10): Promise<InvenTreeTrackingListResponse> {
        return this.request<InvenTreeTrackingListResponse>(
            `/stock/track/?limit=${limit}&ordering=-date`
        );
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
// Use empty string as default so it uses relative paths (current origin)
const INVENTREE_URL = (envUrl !== undefined && envUrl !== null) ? envUrl : '';
const INVENTREE_TOKEN = import.meta.env.VITE_INVENTREE_TOKEN || '';

console.log('[InvenTree] Client init — baseUrl:', JSON.stringify(INVENTREE_URL), '| token present:', !!INVENTREE_TOKEN, '| token prefix:', INVENTREE_TOKEN.slice(0, 12) || '(none)');
if (!INVENTREE_TOKEN) {
    console.error('[InvenTree] VITE_INVENTREE_TOKEN is not set! Please configure your .env file.');
}

export const inventreeClient = new InvenTreeClient({
    baseUrl: INVENTREE_URL,
    token: INVENTREE_TOKEN,
});

export default inventreeClient;
