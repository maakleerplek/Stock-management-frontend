/** Pure join of the six InvenTree lists into one ItemData row per part. */

import { isHomeStock } from '../../api/stock';
import type { ItemData, InvenTreeStockItem } from '../../api/types';

export interface Category {
  pk: number;
  name: string;
  parent?: number | null;
  pathstring?: string;
  [key: string]: unknown;
}

export interface Location {
  pk: number;
  name: string;
  parent?: number | null;
  pathstring?: string;
  [key: string]: unknown;
}

export interface PartRow {
  pk: number;
  name: string;
  description?: string;
  IPN?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  category?: number | null;
  category_name?: string;
  category_detail?: { name?: string } | null;
}

export interface InventoryInput {
  stock: InvenTreeStockItem[];
  parts: PartRow[];
  categories: Category[];
  /** Supplier cost per unit by part pk; parts without a supplier are absent. */
  supplierCosts: Record<number, number>;
  /** Sale price by part pk. A part without one reads 0, never a cost figure. */
  salePrices: Record<number, number>;
  imageUrl: (url: string | null | undefined) => string | null;
}

export function joinInventory({ stock, parts, categories, supplierCosts, salePrices, imageUrl }: InventoryInput): ItemData[] {
  const categoryMap = new Map<number, string>(categories.map(c => [c.pk, c.name]));
  const resolveCategory = (part: PartRow): string =>
    (part.category && categoryMap.get(part.category)) || part.category_detail?.name || part.category_name || 'Uncategorized';

  // Group the stock items that are still ours by part. Sold items (at a
  // customer, in a sales order) are not stock any more.
  const stockByPart = new Map<number, InvenTreeStockItem[]>();
  for (const item of stock) {
    if (!isHomeStock(item)) continue;
    const list = stockByPart.get(item.part) ?? [];
    list.push(item);
    stockByPart.set(item.part, list);
  }

  return parts.map(part => {
    const items = (stockByPart.get(part.pk) ?? []).sort((a, b) => b.quantity - a.quantity);
    const main = items[0];
    return {
      id: part.pk,
      quantity: items.reduce((sum, i) => sum + i.quantity, 0),
      serial: null,
      location: main?.location_detail?.pathstring || main?.location_detail?.name || null,
      status: main?.status_text ?? 'No Stock',
      name: part.name || '',
      description: part.description || '',
      price: salePrices[part.pk] ?? 0,
      cost: supplierCosts[part.pk] ?? 0,
      image: imageUrl(part.thumbnail || part.image) || null,
      part_id: part.pk,
      ipn: part.IPN || '',
      category: resolveCategory(part),
    };
  });
}
