/** The app's QueryClient, its localStorage persistence, and the refetch after every write. */

import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { inventreeClient } from '../../api/inventreeClient';
import { INVENTREE, INVENTORY } from './queries';

const DAY = 24 * 60 * 60_000;

export const queryClient = new QueryClient({
  // gcTime must be at least the persister's maxAge, or restored data is dropped at once.
  defaultOptions: { queries: { gcTime: DAY, retry: 1, refetchOnWindowFocus: true } },
});

export const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'inventree_query_cache' });

/** Only the inventory lists are stored: the tracking log is too big for localStorage. */
export const persistOptions = {
  persister,
  maxAge: DAY,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === 'success' && q.queryKey[1] === INVENTORY[1],
  },
};

// Any write to InvenTree can change stock, parts, prices or orders, so all of
// it refetches (active queries only). A burst of writes (a sale makes ~10)
// becomes one refetch.
let timer: ReturnType<typeof setTimeout> | undefined;
export function invalidateInventree(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: INVENTREE }), 300);
}
inventreeClient.onMutation = invalidateInventree;

// Old caches (response cache in localStorage, image cache in IndexedDB) are dead weight now.
for (const k of Object.keys(localStorage)) if (k.startsWith('inventree_api_')) localStorage.removeItem(k);
indexedDB?.deleteDatabase('InvenTreeImageCache');
