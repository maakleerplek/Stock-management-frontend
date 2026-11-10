/**
 * InvenTree API client (barrel). The code lives in http.ts (request helper)
 * and the domain files stock / catalog / orders / parts, chained by inheritance.
 */

import { PartsApi } from './parts';

export { TILL_CUSTOMER } from './orders';
export { isHomeStock } from './stock';

export class InvenTreeClient extends PartsApi {}

// ==================== Singleton Instance ====================
const envUrl = import.meta.env.VITE_INVENTREE_URL;
// Empty string: relative paths through the proxy on the current origin.
const INVENTREE_URL = (envUrl !== undefined && envUrl !== null) ? envUrl : '';

export const inventreeClient = new InvenTreeClient({ baseUrl: INVENTREE_URL });

export default inventreeClient;
