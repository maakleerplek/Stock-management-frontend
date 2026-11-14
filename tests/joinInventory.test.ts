import { describe, expect, it } from 'vitest';
import { joinInventory, type PartRow } from '../src/features/inventory/joinInventory';
import type { InvenTreeStockItem } from '../src/api/types';

const item = (o: Partial<InvenTreeStockItem>): InvenTreeStockItem =>
  ({ pk: 1, quantity: 1, serial: null, location: 1, status_text: 'OK', part: 1, ...o });
const parts: PartRow[] = [
  { pk: 1, name: 'Bolt', category: 5, thumbnail: 'a.png', IPN: 'B1' },
  { pk: 2, name: 'Nut', category_detail: { name: 'Fasteners' } },
  { pk: 3, name: 'Glue' },
];

describe('joinInventory', () => {
  const rows = joinInventory({
    stock: [
      item({ pk: 1, quantity: 3, location_detail: { pathstring: 'Shelf/A' } }),
      item({ pk: 2, quantity: 10, location_detail: { pathstring: 'Shelf/B' } }),
      item({ pk: 3, quantity: 99, customer: 7 }), // sold: not stock
    ],
    parts,
    categories: [{ pk: 5, name: 'Bolts' }],
    supplierCosts: { 1: 0.2 },
    salePrices: { 1: 0.5 },
    imageUrl: u => (u ? `/media/${u}` : null),
  });

  it('sums home stock and takes the location of the biggest item', () => {
    expect(rows[0]).toMatchObject({ id: 1, quantity: 13, location: 'Shelf/B', status: 'OK', ipn: 'B1', image: '/media/a.png' });
  });
  it('reads 0 for a missing price or cost, and No Stock without items', () => {
    expect(rows[1]).toMatchObject({ price: 0, cost: 0, quantity: 0, status: 'No Stock', location: null });
    expect(rows[0]).toMatchObject({ price: 0.5, cost: 0.2 });
  });
  it('resolves the category by map, then detail, then Uncategorized', () => {
    expect(rows.map(r => r.category)).toEqual(['Bolts', 'Fasteners', 'Uncategorized']);
  });
});
