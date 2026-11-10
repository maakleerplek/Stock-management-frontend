/** Shared InvenTree request helper: URL, cache, timeout, error text, paging. */

import { ApiCache, CACHE_TTL } from '../lib/cache';
import { hasVolunteerSession, markSignedOut, VOLUNTEER_AUTH_FAILED } from '../auth/session';

/** Per InvenTree call; uploads included, so not too tight. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface InvenTreeConfig {
    baseUrl: string;
}

export class HttpBase {
    protected config: InvenTreeConfig;

    constructor(config: InvenTreeConfig) {
        this.config = config;
    }

    /**
     * Generic HTTP request handler for InvenTree API with caching
     * 
     * @param endpoint - API endpoint
     * @param method - HTTP method (GET, POST, PATCH, etc.)
     * @param body - Request body
     * @param isFormData - Whether body is FormData
     * @param useCache - Whether to use cache for GET requests (default: true)
     * @param cacheTTL - Cache TTL in milliseconds (default: 90000)
     */
    protected async request<T>(
        endpoint: string,
        method: string = 'GET',
        body?: unknown,
        isFormData: boolean = false,
        useCache: boolean = true,
        cacheTTL: number = CACHE_TTL.MEDIUM
    ): Promise<T> {
        const url = `${this.config.baseUrl}/api/${endpoint.replace(/^\//, '')}`;

        // Generate cache key for GET requests
        const cacheKey = `${method}_${endpoint}`;
        
        // Try cache for GET requests
        if (method === 'GET' && useCache) {
            const cached = ApiCache.get<T>(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }
        
        // The proxy adds the InvenTree token. Volunteer-only calls are allowed
        // by the sign-in cookie, which the browser sends on its own.
        const headers: Record<string, string> = {};
        const wasSignedIn = hasVolunteerSession();

        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            // A hung InvenTree otherwise kept the checkout spinner up for nginx's
            // full 60 s on each of the ~10 calls a sale makes.
            const response = await fetch(url, {
                method,
                headers,
                body: isFormData ? (body as BodyInit) : (body ? JSON.stringify(body) : undefined),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            }).catch((err: unknown) => {
                if (err instanceof DOMException && err.name === 'TimeoutError') {
                    throw new Error(`InvenTree did not answer within ${REQUEST_TIMEOUT_MS / 1000} s`);
                }
                throw err;
            });

            if (!response.ok) {
                let errorText = await response.text().catch(() => 'No error details');
                
                // Strip HTML from error responses (e.g. nginx 502/504 pages)
                if (errorText.includes('<') && errorText.includes('>')) {
                    const statusMessages: Record<number, string> = {
                        502: 'InvenTree server is unreachable (Bad Gateway)',
                        503: 'InvenTree server is unavailable',
                        504: 'InvenTree server timed out',
                        401: 'Authentication failed — check your API token',
                        403: 'Access denied — insufficient permissions',
                        404: 'Resource not found',
                    };
                    errorText = statusMessages[response.status] || `Server returned ${response.status}`;
                }
                
                if (response.status === 401) {
                    if (wasSignedIn) {
                        markSignedOut();
                        window.dispatchEvent(new Event(VOLUNTEER_AUTH_FAILED));
                    }
                    throw new Error(wasSignedIn
                        ? 'Volunteer sign-in expired - sign in again'
                        : 'Only volunteers can do this - sign in first');
                }
                throw new Error(`InvenTree API error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            // Normalize InvenTree response: if it's a flat array, wrap it in a results object
            const normalizedData = Array.isArray(data) 
                ? { count: data.length, results: data } as unknown as T
                : data;
            
            // Cache GET responses
            if (method === 'GET' && useCache) {
                ApiCache.set(cacheKey, normalizedData, cacheTTL);
            }
            
            return normalizedData;
        } catch (error) {
            if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('NetworkError') || error.message.includes('Failed to fetch'))) {
                console.error(
                    `[InvenTree] Cannot connect to InvenTree at ${this.config.baseUrl} — server unreachable or CORS blocked.`,
                    `\n  Endpoint: ${method} ${endpoint}`,
                    `\n  Check VITE_INVENTREE_URL and that the server is running.`,
                    error
                );
            } else {
                console.error(`[InvenTree] API call failed: ${method} ${endpoint}`, error);
            }
            throw error;
        }
    }
    
    /**
     * Invalidate cached data for an endpoint
     */
    /**
     * GET every page of a list endpoint. `endpoint` already carries
     * `limit=500`; one page used to be all the app read, so past 500 rows
     * parts went missing and sale prices fell back to 0.
     */
    protected async requestAll<R>(
        endpoint: string,
        useCache: boolean = true,
        cacheTTL: number = CACHE_TTL.MEDIUM
    ): Promise<{ count: number; results: R[] }> {
        const pageSize = 500;
        const results: R[] = [];
        for (let offset = 0; ; offset += pageSize) {
            const page = await this.request<{ count: number; results: R[] }>(
                `${endpoint}&offset=${offset}`, 'GET', undefined, false, useCache, cacheTTL
            );
            const rows = page.results || [];
            results.push(...rows);
            if (rows.length < pageSize || results.length >= page.count) {
                return { count: results.length, results };
            }
        }
    }

    invalidateCache(endpoint: string, method: string = 'GET'): void {
        // Prefix match: '/stock/' also clears '/stock/?part=8&...'.
        ApiCache.removePrefix(`${method}_${endpoint}`);
    }
    
    /**
     * Clear all cached API data
     */
    clearCache(): void {
        ApiCache.clear();
    }
}
