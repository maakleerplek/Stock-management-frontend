import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { inventreeClient } from './api/inventreeClient';
import type { ItemData } from './api/types';

interface StockContextType {
  items: ItemData[];
  categories: any[];
  locations: any[];
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  fetchInventory: (force?: boolean) => Promise<void>;
  refreshInventory: () => Promise<void>;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

const StockContext = createContext<StockContextType | undefined>(undefined);

export function StockProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
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
        inventreeClient.invalidateCache('/part/?active=true&limit=500');
        inventreeClient.invalidateCache('/part/category/');
        inventreeClient.invalidateCache('/stock/location/');
      }

      // Fetch in parallel for speed
      const [stockResp, partsResp, catResp, locResp] = await Promise.all([
        inventreeClient.getAllStockItems(),
        inventreeClient.getAllParts(),
        inventreeClient.getCategories(),
        inventreeClient.getLocations(),
      ]);

      // Map stock items by part_id so we can detect parts with no stock record
      const stockByPartId = new Map<number, any>();
      const formattedItems: ItemData[] = stockResp.results.map((item: any) => {
        stockByPartId.set(item.part, item);
        return {
          id: item.pk,
          quantity: item.quantity,
          serial: item.serial,
          location: item.location_detail?.pathstring || item.location_detail?.name || null,
          status: item.status_text,
          name: item.part_detail?.name || '',
          description: item.part_detail?.description || '',
          price: item.part_detail?.pricing_min || 0,
          image: inventreeClient.getFullImageUrl(item.part_detail?.thumbnail || item.part_detail?.image) || null,
          part_id: item.part,
          ipn: item.part_detail?.IPN || '',
          category: item.part_detail?.category_name || 'Uncategorized',
        };
      });

      // Add parts that have no stock record at all (show with quantity 0)
      for (const part of (partsResp.results as any[])) {
        if (!stockByPartId.has(part.pk)) {
          formattedItems.push({
            id: -(part.pk),
            quantity: 0,
            serial: null,
            location: null,
            status: 'No Stock',
            name: part.name || '',
            description: part.description || '',
            price: part.pricing_min || 0,
            image: inventreeClient.getFullImageUrl(part.thumbnail || part.image) || null,
            part_id: part.pk,
            ipn: part.IPN || '',
            category: part.category_detail?.name || part.category_name || 'Uncategorized',
          });
        }
      }

      setItems(formattedItems);
      setCategories(catResp.results);
      setLocations(locResp.results);
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

export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within StockProvider');
  }
  return context;
}
