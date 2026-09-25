/**
 * @file sendCodeHandler.ts
 * 
 * Stock actions of the app, per part:
 * - look up a scanned code
 * - checkout: one InvenTree sales order per sale
 * - volunteer corrections: add, remove, set
 */

import { inventreeClient } from './api/inventreeClient';
import type { ItemData } from './api/types';

const TV_URL = import.meta.env.VITE_TV_PRESENTATION_URL as string | undefined;

async function sendChangelogEvent(
    action: 'checkout' | 'add' | 'remove' | 'set' | 'create',
    item_name: string,
    quantity: number,
    source: string,
    price?: number,
): Promise<void> {
    if (!TV_URL) return;
    try {
        await fetch(`${TV_URL}/api/changelog`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, source, item_name, quantity, ...(price != null ? { price } : {}) }),
        });
    } catch {
        // Non-critical — changelog failures should never block the main flow
    }
}

/**
 * Wraps a scanned item with a unique counter so scanning the same barcode
 * twice in a row still triggers the ShoppingWindow useEffect.
 */
export interface ScanEvent {
    item: ItemData;
    id: number;
}

/** The part behind a scanned code, or null. */
export async function handleSend(code: string): Promise<ItemData | null> {
    if (!code || code === "No result") return null;
    try {
        return await inventreeClient.lookupBarcode(code);
    } catch (error) {
        console.error("Error fetching item:", error);
        return null;
    }
}

/** Notes on volunteer corrections. Sales are sales orders, not notes. */
export const NOTES = {
    ADD: 'Added via Stock App - Volunteer Mode',
    REMOVE: 'Removed via Stock App - Volunteer Mode',
    SET: 'Stock set via App - Volunteer Mode',
} as const;

/** A machine service on the bill: laser minutes, CNC minutes, printed grams. */
export interface ExtraLine {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
}

export const extraTotal = (extras: ExtraLine[]) => extras.reduce((sum, e) => sum + e.quantity * e.unitPrice, 0);
export const describeExtra = (e: ExtraLine) => `${e.name} ${e.quantity} ${e.unit}`;

export interface CheckoutLine {
    partId: number;
    name: string;
    quantity: number;
    unitPrice: number;
}

/**
 * Book a till sale as one InvenTree sales order.
 * Returns the order reference, or throws with a message for the user.
 */
export async function handleCheckout(lines: CheckoutLine[], extras: ExtraLine[]): Promise<string> {
    const description = [
        ...lines.map(l => `${l.name} x${l.quantity}`),
        ...extras.map(describeExtra),
    ].join(', ');
    const result = await inventreeClient.sellParts(
        lines.map(l => ({ partId: l.partId, quantity: l.quantity, unitPrice: l.unitPrice })),
        extras.map(e => ({ reference: `${e.name} (${e.unit})`, quantity: e.quantity, unitPrice: e.unitPrice })),
        description,
    );
    if (result.unshipped.length) {
        console.warn(`[Checkout] ${result.reference}: sold more than InvenTree had in stock`, result.unshipped);
    }
    for (const l of lines) {
        void sendChangelogEvent('checkout', l.name, l.quantity, 'checkout',
            l.unitPrice > 0 ? parseFloat((l.unitPrice * l.quantity).toFixed(2)) : undefined);
    }
    return result.reference;
}

/** Volunteer: add stock to a part. */
export async function handleAddItem(
    partId: number,
    quantity: number,
    itemName?: string,
    totalPrice?: number,
    source = 'volunteer-scanner',
): Promise<boolean> {
    try {
        await inventreeClient.addStockToPart(partId, quantity, NOTES.ADD);
        if (itemName) void sendChangelogEvent('add', itemName, quantity, source, totalPrice);
        return true;
    } catch (error) {
        console.error(`Failed to add to part ${partId}:`, error);
        return false;
    }
}

/** Volunteer: take stock off a part (a correction, not a sale). */
export async function handleRemoveItem(
    partId: number,
    quantity: number,
    itemName?: string,
    totalPrice?: number,
    source = 'volunteer-scanner',
): Promise<boolean> {
    try {
        await inventreeClient.removeStockFromPart(partId, quantity, NOTES.REMOVE);
        if (itemName) void sendChangelogEvent('remove', itemName, quantity, source, totalPrice);
        return true;
    } catch (error) {
        console.error(`Failed to remove from part ${partId}:`, error);
        return false;
    }
}

/** Volunteer: set a part's total stock. */
export async function handleSetItem(
    partId: number,
    quantity: number,
    itemName?: string,
    _totalPrice?: number,
    source = 'volunteer-scanner',
): Promise<boolean> {
    try {
        await inventreeClient.setPartStock(partId, quantity, NOTES.SET);
        // No price for set: it is an absolute quantity.
        if (itemName) void sendChangelogEvent('set', itemName, quantity, source);
        return true;
    } catch (error) {
        console.error(`Failed to set part ${partId}:`, error);
        return false;
    }
}

/**
 * Report a creation event (new part, category, or location) to the TV changelog.
 * item_name should describe what was created, e.g. "Item: Club Mate" or "Category: Drinks".
 */
export function reportCreateEvent(item_name: string, quantity = 1): void {
    void sendChangelogEvent('create', item_name, Math.max(1, Math.round(quantity)), 'volunteer-scanner');
}

// Re-export ItemData type for convenience
export type { ItemData };