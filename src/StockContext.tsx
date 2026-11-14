import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { inventreeClient } from './api/inventreeClient';
import type { ItemData, InvenTreeStockItem } from './api/types';
import { inventoryQueries, INVENTORY } from './features/inventory/queries';
import { joinInventory, type Category, type Location, type PartRow } from './features/inventory/joinInventory';

interface StockContextType {
  /** One entry per part; `id` is the part ID. */
  items: ItemData[];
  categories: Category[];
  locations: Location[];
  lastFetched: number | null;
  /** True while any of the lists is being fetched, in the background too. */
  loading: boolean;
  error: string | null;
  refreshInventory: () => Promise<void>;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

function readableError(err: unknown): string {
  let msg = err instanceof Error ? err.message : 'Failed to fetch inventory data.';
  // Strip any HTML from error messages (e.g. nginx 502 pages)
  if (msg.includes('<') && msg.includes('>')) {
    msg = msg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (msg.length < 20 || msg.includes('Bad Gateway')) msg = 'Cannot connect to InvenTree — server is unreachable.';
  }
  return msg;
}

export function StockProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [stock, parts, cats, locs, supplierCosts, salePrices] = useQueries({
    queries: [
      inventoryQueries.stock(), inventoryQueries.parts(), inventoryQueries.categories(),
      inventoryQueries.locations(), inventoryQueries.supplierCosts(), inventoryQueries.salePrices(),
    ],
  });

  const categories = useMemo(() => (cats.data?.results ?? []) as Category[], [cats.data]);
  const locations = useMemo(() => (locs.data?.results ?? []) as Location[], [locs.data]);
  const items = useMemo(() => {
    if (!stock.data || !parts.data) return [];
    return joinInventory({
      stock: stock.data.results as unknown as InvenTreeStockItem[],
      parts: parts.data.results as PartRow[],
      categories,
      supplierCosts: supplierCosts.data ?? {},
      salePrices: salePrices.data ?? {},
      imageUrl: u => inventreeClient.getFullImageUrl(u),
    });
  }, [stock.data, parts.data, categories, supplierCosts.data, salePrices.data]);

  const all = [stock, parts, cats, locs, supplierCosts, salePrices];
  const failed = [stock, parts, cats, locs].find(q => q.error);
  const refreshInventory = async () => { await queryClient.refetchQueries({ queryKey: INVENTORY }); };

  return (
    <StockContext.Provider value={{
      items,
      categories,
      locations,
      lastFetched: stock.dataUpdatedAt || null,
      loading: all.some(q => q.isFetching),
      error: failed ? readableError(failed.error) : null,
      refreshInventory,
    }}>
      {children}
    </StockContext.Provider>
  );
}

// The hook belongs with its provider; fast refresh reloads this file in full.
// eslint-disable-next-line react-refresh/only-export-components
export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within StockProvider');
  }
  return context;
}
