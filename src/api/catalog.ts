/** Categories, locations, suppliers and supplier parts. */

import type {
    InvenTreeCategoryListResponse,
    InvenTreeLocationListResponse,
    CreateCategoryPayload,
    CreateLocationPayload,
    InvenTreeCompany,
    CreateSupplierPartPayload,
} from './types';
import { StockApi } from './stock';

export class CatalogApi extends StockApi {
    /**
     * Get all categories (cached for 1 hour - categories change rarely)
     */
    async getCategories(): Promise<InvenTreeCategoryListResponse> {
        return this.request<InvenTreeCategoryListResponse>(
            '/part/category/',
            'GET',
            undefined,
            false
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
            false
        );
        
        return result;
    }

    /**
     * Get all stock locations (cached for 1 hour - locations change rarely)
     */
    async getLocations(): Promise<InvenTreeLocationListResponse> {
        return this.request<InvenTreeLocationListResponse>(
            '/stock/location/',
            'GET',
            undefined,
            false
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
            false
        );
        
        return result;
    }

    async getSuppliers(): Promise<InvenTreeCompany[]> {
        const result = await this.request<{ results: InvenTreeCompany[] }>(
            '/company/?is_supplier=true&limit=200',
            'GET',
            undefined,
            false
        );
        return result.results;
    }

    async createSupplier(payload: { name: string; description?: string; website?: string; email?: string; phone?: string; address?: string }): Promise<{ pk: number; name: string }> {
        return this.request<{ pk: number; name: string }>('/company/', 'POST', {
            ...payload,
            is_supplier: true,
            is_manufacturer: false,
            is_customer: false,
        }, false);
    }

    async createSupplierPart(payload: CreateSupplierPartPayload): Promise<{ pk: number }> {
        return this.request<{ pk: number }>('/company/part/', 'POST', payload, false);
    }

    async getAllSupplierParts(): Promise<{ pk: number; part: number; supplier: number; SKU: string }[]> {
        const result = await this.requestAll<{ pk: number; part: number; supplier: number; SKU: string }>(
            '/company/part/?limit=500'
        );
        return result.results;
    }

    async getSupplierPartsForSupplier(supplierPk: number): Promise<{ pk: number; part: number; supplier: number; SKU: string; pack_quantity: string }[]> {
        const result = await this.request<{ results: { pk: number; part: number; supplier: number; SKU: string; pack_quantity: string }[] }>(
            `/company/part/?supplier=${supplierPk}&limit=200`,
            'GET',
            undefined,
            false
        );
        return result.results;
    }

    async getStockLocations(): Promise<{ pk: number; name: string; pathstring: string }[]> {
        const result = await this.request<{ results: { pk: number; name: string; pathstring: string }[] }>(
            '/stock/location/?limit=100',
            'GET',
            undefined,
            false
        );
        return result.results;
    }
}
