import { useMemo } from 'react';
import { useStock } from '../StockContext';
import type { PartPrice } from '../lib/itemAnalytics';

/** part_id -> name, prices and category, from the stock list. */
export function usePartLookup(): Map<number, PartPrice> {
  const { items } = useStock();
  return useMemo(() => {
    const map = new Map<number, PartPrice>();
    items.forEach(item => {
      if (item.part_id != null && !map.has(item.part_id)) {
        map.set(item.part_id, {
          name: item.name,
          sellingPrice: item.price,   // sale price break
          costPrice: item.cost,       // supplier price / pack size
          category: item.category,
        });
      }
    });
    return map;
  }, [items]);
}
