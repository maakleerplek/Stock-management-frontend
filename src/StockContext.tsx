import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { inventreeClient, isHomeStock } from './api/inventreeClient';
import type { ItemData, InvenTreeStockItem } from './api/types';

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

interface PartRow {
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

interface StockContextType {
  /** One entry per part; `id` is the part ID. */
  items: ItemData[];
  categories: Category[];
  locations: Location[];
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  fetchInventory: (force?: boolean) => Promise<void>;
  refreshInventory: () => Promise<void>;
}

const CACHE_TTL = 90 * 1000; // 90 seconds — fresh enough for a busy shop

const StockContext = createContext<StockContextType | undefined>(undefined);

export function StockProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetched && (now - lastFetched < CACHE_TTL)) {
      console.debug('[StockContext] Using cached inventory data.');
      return;
    }

    setLoading(true);
    setError(null);
    console.debug('[StockContext] Fetching fresh inventory data...');

    try {
      // If forcing refresh, clear API cache for stock items
      if (force) {
        inventreeClient.invalidateCache('/stock/');
        inventreeClient.invalidateCache('/part/?active=true&virtual=false&limit=500');
        inventreeClient.invalidateCache('/part/category/');
        inventreeClient.invalidateCache('/stock/location/');
      }

      // Fetch in parallel for speed
      const [stockResp, partsResp, catResp, locResp, supplierCosts, salePrices] = await Promise.all([
        inventreeClient.getAllStockItems({ home: true }),
        inventreeClient.getAllParts(),
        inventreeClient.getCategories(),
        inventreeClient.getLocations(),
        // Real cost per unit from the supplier price breaks. Parts with no
        // supplier are simply absent, which reads as "unknown" downstream.
        inventreeClient.getSupplierCostPerPart().catch(() => ({} as Record<number, number>)),
        // Selling price from InvenTree's sale price breaks. There is no fallback
        // to pricing_max: that is a cost figure now, and a cost shown as a price
        // looks plausible enough to go unnoticed. A part with no sale price
        // reads 0.00, which does not.
        inventreeClient.getSalePricePerPart().catch(() => ({} as Record<number, number>)),
      ]);

      const categories = catResp.results as Category[];
      const categoryMap = new Map<number, string>(categories.map(c => [c.pk, c.name]));
      const resolveCategory = (part: PartRow): string =>
        (part.category && categoryMap.get(part.category)) || part.category_detail?.name || part.category_name || 'Uncategorized';

      // Group the stock items that are still ours by part. Sold items (at a
      // customer, in a sales order) are not stock any more.
      const stockByPart = new Map<number, InvenTreeStockItem[]>();
      for (const item of stockResp.results as unknown as InvenTreeStockItem[]) {
        if (!isHomeStock(item)) continue;
        const list = stockByPart.get(item.part) ?? [];
        list.push(item);
        stockByPart.set(item.part, list);
      }

      const formattedItems: ItemData[] = (partsResp.results as PartRow[]).map(part => {
        const stock = (stockByPart.get(part.pk) ?? []).sort((a, b) => b.quantity - a.quantity);
        const main = stock[0];
        return {
          id: part.pk,
          quantity: stock.reduce((sum, i) => sum + i.quantity, 0),
          serial: null,
          location: main?.location_detail?.pathstring || main?.location_detail?.name || null,
          status: main?.status_text ?? 'No Stock',
          name: part.name || '',
          description: part.description || '',
          price: salePrices[part.pk] ?? 0,
          cost: supplierCosts[part.pk] ?? 0,
          image: inventreeClient.getFullImageUrl(part.thumbnail || part.image) || null,
          part_id: part.pk,
          ipn: part.IPN || '',
          category: resolveCategory(part),
        };
      });

      setItems(formattedItems);
      setCategories(categories);
      setLocations(locResp.results as Location[]);
      setLastFetched(now);
      console.debug('[StockContext] Inventory successfully synchronized.');
    } catch (err) {
      console.error('[StockContext] Failed to fetch inventory:', err);
      let errorMsg = err instanceof Error ? err.message : 'Failed to fetch inventory data.';
      // Strip any HTML from error messages (e.g. nginx 502 pages)
      if (errorMsg.includes('<') && errorMsg.includes('>')) {
        errorMsg = errorMsg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        // If stripping HTML left a mostly empty string, use a friendly fallback
        if (errorMsg.length < 20 || errorMsg.includes('Bad Gateway')) {
          errorMsg = 'Cannot connect to InvenTree — server is unreachable.';
        }
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [lastFetched]);

  const refreshInventory = useCallback(async () => {
    await fetchInventory(true);
  }, [fetchInventory]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Without this the inventory is only ever loaded once. An installed PWA that is
  // left open — which is how this actually gets used — would keep showing the
  // numbers from whenever it was opened, with no error and nothing on screen to
  // say the data is old. Re-fetch whenever the app comes back to the foreground,
  // and on a slow timer while it is visible.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchInventory(true);
      }
    };

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    const timer = window.setInterval(refreshIfVisible, 2 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [fetchInventory]);

  return (
    <StockContext.Provider value={{ 
      items, 
      categories, 
      locations, 
      lastFetched, 
      loading, 
      error, 
      fetchInventory,
      refreshInventory
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
