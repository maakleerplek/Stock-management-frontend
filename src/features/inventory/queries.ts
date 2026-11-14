/** Every InvenTree read as a TanStack Query option set. staleTime = the old localStorage TTL. */

import { queryOptions } from '@tanstack/react-query';
import { inventreeClient as api } from '../../api/inventreeClient';

const MIN = 60_000;
export const STALE = { SHORT: 2 * MIN, MEDIUM: 15 * MIN, LONG: 60 * MIN } as const;

/** Everything InvenTree-related sits under this key, so one prefix invalidates all of it. */
export const INVENTREE = ['inventree'] as const;
export const INVENTORY = ['inventree', 'inventory'] as const;

const none = {} as Record<number, number>;

export const inventoryQueries = {
  // Stock changes with every sale: 90 s fresh, plus a 2 min poll while visible.
  stock: () => queryOptions({
    queryKey: [...INVENTORY, 'stock'], queryFn: () => api.getAllStockItems({ home: true }),
    staleTime: 90_000, refetchInterval: 2 * MIN,
  }),
  parts: () => queryOptions({
    queryKey: [...INVENTORY, 'parts'], queryFn: () => api.getAllParts(), staleTime: STALE.MEDIUM,
  }),
  categories: () => queryOptions({
    queryKey: [...INVENTORY, 'categories'], queryFn: () => api.getCategories(), staleTime: STALE.LONG,
  }),
  locations: () => queryOptions({
    queryKey: [...INVENTORY, 'locations'], queryFn: () => api.getLocations(), staleTime: STALE.LONG,
  }),
  // Supplier and sale prices: a missing one only means "unknown", so a failure is not an error.
  supplierCosts: () => queryOptions({
    queryKey: [...INVENTORY, 'supplierCosts'], queryFn: () => api.getSupplierCostPerPart().catch(() => none), staleTime: STALE.LONG,
  }),
  salePrices: () => queryOptions({
    queryKey: [...INVENTORY, 'salePrices'], queryFn: () => api.getSalePricePerPart().catch(() => none), staleTime: STALE.MEDIUM,
  }),
};

export const infoQueries = {
  suppliers: () => queryOptions({
    queryKey: [...INVENTREE, 'suppliers'], queryFn: () => api.getSuppliers(), staleTime: STALE.LONG,
  }),
  lowStock: () => queryOptions({
    queryKey: [...INVENTREE, 'lowStock'], queryFn: () => api.getLowStockParts(), staleTime: STALE.MEDIUM,
  }),
  recentTracking: (limit: number) => queryOptions({
    queryKey: [...INVENTREE, 'tracking', limit], queryFn: () => api.getStockTracking(limit),
  }),
  // Machine payments are extra lines, not stock: without them the list still works.
  recentServiceLines: (limit: number) => queryOptions({
    queryKey: [...INVENTREE, 'serviceLines', limit], queryFn: () => api.getRecentServiceLines(limit).catch(() => []),
  }),
};

export const orderQueries = {
  list: () => queryOptions({
    queryKey: [...INVENTREE, 'purchaseOrders'], queryFn: () => api.getPurchaseOrders(),
  }),
  lines: (poPk: number) => queryOptions({
    queryKey: [...INVENTREE, 'purchaseOrders', poPk, 'lines'], queryFn: () => api.getPurchaseOrderLines(poPk),
  }),
  allSupplierParts: () => queryOptions({
    queryKey: [...INVENTREE, 'supplierParts'], queryFn: () => api.getAllSupplierParts(),
  }),
  supplierParts: (supplierPk: number) => queryOptions({
    queryKey: [...INVENTREE, 'supplierParts', supplierPk], queryFn: () => api.getSupplierPartsForSupplier(supplierPk),
  }),
  stockLocations: () => queryOptions({
    queryKey: [...INVENTREE, 'stockLocations'], queryFn: () => api.getStockLocations(), staleTime: STALE.LONG,
  }),
};
