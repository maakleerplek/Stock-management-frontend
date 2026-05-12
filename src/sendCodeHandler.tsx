/**
 * @file sendCodeHandler.tsx
 * 
 * This file handles all communication with InvenTree API for inventory management.
 * It provides functions to:
 * - Fetch items by barcode/QR code
 * - Remove items from stock (checkout)
 * - Add items to stock (volunteer mode)
 * - Set stock to absolute quantity
 * 
 * NOTE: This now uses the direct InvenTree API client instead of the backend middleman.
 */

import { inventreeClient } from './api/inventreeClient';
import type { ItemData } from './api/types';

const TV_URL = import.meta.env.VITE_TV_PRESENTATION_URL as string | undefined;

async function sendChangelogEvent(
    action: 'checkout' | 'add' | 'remove' | 'set',
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

/**
 * Fetch item data using a barcode or QR code
 * 
 * Uses InvenTree's barcode API with fallback logic:
 * 1. Direct barcode match
 * 2. Part barcode match → find stock
 * 3. IPN (Internal Part Number) search
 * 4. Part name search (partial match)
 * 
 * @param code - The barcode/QR code to look up
 * @returns The item data if found, null if not found or error occurred
 */
export async function handleSend(code: string): Promise<ItemData | null> {
    if (!code || code === "No result") {
        console.debug("No barcode data to send.");
        return null;
    }

    console.debug(`Fetching item for barcode: ${code}`);

    try {
        const item = await inventreeClient.lookupBarcode(code);
        
        if (item) {
            const { name, quantity, price } = item;
            console.debug(`Found: ${name} (Qty: ${quantity}, €${price.toFixed(2)})`);
            return item;
        }

        console.debug("No item found for this barcode.");
        return null;
    } catch (error) {
        console.error("Error fetching item:", error);
        return null;
    }
}

/**
 * Remove item from stock (checkout operation)
 * 
 * @param itemId - Stock item ID
 * @param quantity - Amount to remove
 * @returns true if successful, false otherwise
 */
export async function handleTakeItem(
    itemId: number,
    quantity: number,
    itemName?: string,
    totalPrice?: number,
    source = 'checkout',
): Promise<boolean> {
    try {
        await inventreeClient.removeStock(itemId, quantity, `Removed via Stock App - Checkout`);
        console.debug(`Successfully removed ${quantity} units from item ${itemId}`);
        if (itemName) void sendChangelogEvent('checkout', itemName, quantity, source, totalPrice);
        return true;
    } catch (error) {
        console.error(`Failed to remove item ${itemId}:`, error);
        return false;
    }
}

/**
 * Add item to stock (volunteer mode operation)
 * 
 * @param itemId - Stock item ID
 * @param quantity - Amount to add
 * @returns true if successful, false otherwise
 */
export async function handleAddItem(
    itemId: number,
    quantity: number,
    itemName?: string,
    totalPrice?: number,
    source = 'volunteer-scanner',
): Promise<boolean> {
    try {
        await inventreeClient.addStock(itemId, quantity, `Added via Stock App - Volunteer Mode`);
        console.debug(`Successfully added ${quantity} units to item ${itemId}`);
        if (itemName) void sendChangelogEvent('add', itemName, quantity, source, totalPrice);
        return true;
    } catch (error) {
        console.error(`Failed to add item ${itemId}:`, error);
        return false;
    }
}

/**
 * Set stock to an absolute quantity
 * 
 * Calculates the difference between current and target quantity,
 * then performs add or remove operation accordingly.
 * 
 * @param itemId - Stock item ID
 * @param quantity - Target absolute quantity
 * @returns true if successful, false otherwise
 */
export async function handleSetItem(
    itemId: number,
    quantity: number,
    itemName?: string,
    _totalPrice?: number,
    source = 'volunteer-scanner',
): Promise<boolean> {
    try {
        await inventreeClient.setStock(itemId, quantity, `Stock set via App - Volunteer Mode`);
        console.debug(`Successfully set item ${itemId} to ${quantity} units`);
        if (itemName) void sendChangelogEvent('set', itemName, quantity, source);
        return true; // no price for set — absolute quantity, price wouldn't be meaningful
    } catch (error) {
        console.error(`Failed to set item ${itemId}:`, error);
        return false;
    }
}

/**
 * Report a creation event (new part, category, or location) to the TV changelog.
 * item_name should describe what was created, e.g. "Item: Club Mate" or "Category: Drinks".
 */
export function reportCreateEvent(item_name: string): void {
    void sendChangelogEvent('create', item_name, 1, 'volunteer-scanner');
}

// Re-export ItemData type for convenience
export type { ItemData };