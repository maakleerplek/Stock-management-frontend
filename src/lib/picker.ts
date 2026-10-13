import type { ItemData } from '../api/types';

/** Never in the grid: machine prices are paid as machine time, not as items (the kiosk hides them too). */
const HIDDEN = /^machinegebruik$/i;

/** What the product grid sells: in stock, with a price, one per part, by name. */
export function pickerItems(items: ItemData[], category: string | null): ItemData[] {
    const seen = new Set<number>();
    return items
        .filter(i => i.quantity > 0 && i.price > 0 && !HIDDEN.test(i.category))
        .filter(i => !category || i.category === category)
        .filter(i => !seen.has(i.id) && !!seen.add(i.id))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** The categories the grid shows, drinks first like at the kiosk. */
export function pickerCategories(items: ItemData[]): string[] {
    const cats = [...new Set(pickerItems(items, null).map(i => i.category))];
    const rank = (c: string) => (/drink|drank/i.test(c) ? 0 : 1);
    return cats.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The wood category, for "Buy wood" on the laser page. */
export const woodCategory = (items: ItemData[]) => pickerCategories(items).find(c => /wood|hout/i.test(c)) ?? null;
