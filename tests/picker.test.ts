import { describe, expect, it } from 'vitest';
import { pickerCategories, pickerItems, woodCategory } from '../src/lib/picker';
import type { ItemData } from '../src/api/types';

const item = (id: number, name: string, category: string, over: Partial<ItemData> = {}): ItemData => ({
  id, name, category, quantity: 3, price: 2, serial: null, location: null, status: '', description: '', cost: 1, image: null, part_id: id, ipn: '', ...over,
});

describe('product grid', () => {
  const items = [
    item(1, 'Cola', 'Drinks'), item(2, '4mm MDF', 'Wood'), item(2, '4mm MDF', 'Wood'),   // same part twice
    item(3, 'Empty', 'Wood', { quantity: 0 }), item(4, 'Free', 'Drinks', { price: 0 }),
    item(5, 'Lasercutter', 'Machinegebruik'), item(6, 'PLA White', 'Filament'),
  ];
  it('sells what is in stock with a price, once per part, no machines', () => {
    expect(pickerItems(items, null).map(i => i.id)).toEqual([2, 1, 6]);
    expect(pickerItems(items, 'Wood').map(i => i.id)).toEqual([2]);
  });
  it('shows drinks first and finds the wood for Buy wood', () => {
    expect(pickerCategories(items)).toEqual(['Drinks', 'Filament', 'Wood']);
    expect(woodCategory(items)).toBe('Wood');
  });
});
