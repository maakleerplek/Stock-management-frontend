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
    StockOperationPayload,
    CreatePartPayload,
    CreateStockItemPayload,
    UpdatePartPayload,
    CreateCategoryPayload,
    CreateLocationPayload,
} from './types';

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
     * Generic HTTP request handler for InvenTree API
     */
    private async request<T>(
        endpoint: string,
        method: string = 'GET',
        body?: unknown,
        isFormData: boolean = false
    ): Promise<T> {
        const url = `${this.config.baseUrl}/api/${endpoint.replace(/^\//, '')}`;
        
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
                throw new Error(`InvenTree API error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            // Normalize InvenTree response: if it's a flat array, wrap it in a results object
            if (Array.isArray(data)) {
                return { count: data.length, results: data } as unknown as T;
            }
            return data;
        } catch (error) {
            console.error(`InvenTree API call failed: ${method} ${endpoint}`, error);
            throw error;
        }
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
        await this.request('/stock/add/', 'POST', payload);
    }

    /**
     * Remove stock from an inventory item
     */
    async removeStock(itemId: number, quantity: number, notes: string = 'Removed via Stock App'): Promise<void> {
        const payload: StockOperationPayload = {
            items: [{ pk: itemId, quantity }],
            notes,
        };
        await this.request('/stock/remove/', 'POST', payload);
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
     * Get detailed stock item information
     */
    async getStockItem(itemId: number): Promise<InvenTreeStockItem> {
        return this.request<InvenTreeStockItem>(
            `/stock/${itemId}/?part_detail=true&location_detail=true`
        );
    }

    /**
     * Get all stock items with optional filters
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

        const queryString = params.toString();
        const endpoint = queryString ? `/stock/?${queryString}` : '/stock/';
        
        return this.request<InvenTreeStockListResponse>(endpoint);
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
     */
    async lookupBarcode(barcode: string): Promise<ItemData | null> {
        if (!barcode || barcode === 'No result') {
            return null;
        }

        try {
            let stockId: number | null = null;

            // Step 1: Try direct barcode scan
            try {
                const barcodeResp = await this.request<InvenTreeBarcodeResponse>(
                    '/barcode/',
                    'POST',
                    { barcode }
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
                    `/part/?IPN=${encodeURIComponent(barcode)}`
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
                    `/part/?search=${encodeURIComponent(barcode)}`
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
        return this.request('/part/', 'POST', payload);
    }

    /**
     * Update an existing part
     */
    async updatePart(partId: number, payload: UpdatePartPayload): Promise<unknown> {
        return this.request(`/part/${partId}/`, 'PATCH', payload);
    }

    /**
     * Upload an image to a part
     */
    async uploadPartImage(partId: number, imageFile: File): Promise<unknown> {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        return this.request(`/part/${partId}/`, 'PATCH', formData, true);
    }

    /**
     * Get part details
     */
    async getPart(partId: number): Promise<unknown> {
        return this.request(`/part/${partId}/`);
    }

    // ==================== Stock Item Management ====================

    /**
     * Create a new stock item
     */
    async createStockItem(payload: CreateStockItemPayload): Promise<{ pk: number }> {
        return this.request('/stock/', 'POST', payload);
    }

    // ==================== Categories ====================

    /**
     * Get all categories
     */
    async getCategories(): Promise<InvenTreeCategoryListResponse> {
        return this.request<InvenTreeCategoryListResponse>('/part/category/');
    }

    /**
     * Create a new category
     */
    async createCategory(payload: CreateCategoryPayload): Promise<{ pk: number }> {
        return this.request('/part/category/', 'POST', payload);
    }

    // ==================== Locations ====================

    /**
     * Get all stock locations
     */
    async getLocations(): Promise<InvenTreeLocationListResponse> {
        return this.request<InvenTreeLocationListResponse>('/stock/location/');
    }

    /**
     * Create a new location
     */
    async createLocation(payload: CreateLocationPayload): Promise<{ pk: number }> {
        return this.request('/stock/location/', 'POST', payload);
    }
}

// ==================== Singleton Instance ====================
const envUrl = import.meta.env.VITE_INVENTREE_URL;
// Use empty string as default so it uses relative paths (current origin)
const INVENTREE_URL = (envUrl !== undefined && envUrl !== null) ? envUrl : '';
const INVENTREE_TOKEN = import.meta.env.VITE_INVENTREE_TOKEN || '';

if (!INVENTREE_TOKEN) {
    console.error('VITE_INVENTREE_TOKEN is not set! Please configure your .env file.');
}

export const inventreeClient = new InvenTreeClient({
    baseUrl: INVENTREE_URL,
    token: INVENTREE_TOKEN,
});

export default inventreeClient;
