/**
 * Type definitions for InvenTree API responses
 */

export interface ItemData {
    id: number;
    quantity: number;
    serial: string | null;
    location: string | null;
    status: string;
    name: string;
    description: string;
    price: number;
    image: string | null;
    part_id: number | null;
    ipn: string;
    category: string;
}

export interface InvenTreeStockItem {
    pk: number;
    quantity: number;
    serial: string | null;
    location: number | null;
    location_detail?: {
        pathstring?: string;
        name?: string;
    };
    status_text: string;
    part: number;
    part_detail?: {
        name: string;
        description: string;
        pricing_min?: number;
        pricing_max?: number;
        image?: string;
        IPN?: string;
        category_name?: string;
        category?: number;
    };
}

export interface InvenTreeBarcodeResponse {
    stockitem?: {
        pk: number;
        [key: string]: unknown;
    };
    part?: {
        pk: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface InvenTreePartListResponse {
    count: number;
    results: Array<{
        pk: number;
        name: string;
        IPN?: string;
        category?: number;
        [key: string]: unknown;
    }>;
}

export interface InvenTreeStockListResponse {
    count: number;
    results: Array<{
        pk: number;
        quantity: number;
        part: number;
        location: number;
        [key: string]: unknown;
    }>;
}

export interface InvenTreeCategoryListResponse {
    count: number;
    results: Array<{
        pk: number;
        name: string;
        pathstring?: string;
        parent?: number;
        [key: string]: unknown;
    }>;
}

export interface InvenTreeLocationListResponse {
    count: number;
    results: Array<{
        pk: number;
        name: string;
        pathstring?: string;
        parent?: number;
        [key: string]: unknown;
    }>;
}

export interface StockOperationPayload {
    items: Array<{
        pk: number;
        quantity: number;
    }>;
    notes: string;
}

export interface CreatePartPayload {
    name: string;
    IPN?: string;
    description?: string;
    category?: number;
    units?: string;
    default_location?: number;
    notes?: string;
    active?: boolean;
    purchaseable?: boolean;
    minimum_stock?: number;
    icon?: string;
}

export interface CreateStockItemPayload {
    part: number;
    location: number;
    quantity: number;
    notes?: string;
    barcode?: string;
    purchase_price?: number;
    purchase_price_currency?: string;
}

export interface UpdatePartPayload {
    category?: number;
    default_location?: number;
    barcode?: string;
    [key: string]: unknown;
}

export interface CreateCategoryPayload {
    name: string;
    description?: string;
    parent?: number;
    default_location?: number;
    default_keywords?: string;
    structural?: boolean;
    icon?: string;
}

export interface CreateLocationPayload {
    name: string;
    description?: string;
    parent?: number;
    structural?: boolean;
    external?: boolean;
    icon?: string;
}
export interface InvenTreeTrackingEntry {
    pk: number;
    item: number;
    part: number;
    date: string;
    deltas: {
        removed?: number;
        added?: number;
        quantity?: number;
    };
    label: string;
    notes: string;
    tracking_type: number;
    user: number;
}

export interface InvenTreeTrackingListResponse {
    count: number;
    results: InvenTreeTrackingEntry[];
}
