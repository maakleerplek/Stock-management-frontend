/** Shared InvenTree request helper: URL, timeout, error text, paging. No caching: TanStack Query does that. */

import { hasVolunteerSession, markSignedOut, VOLUNTEER_AUTH_FAILED } from '../auth/session';

/** Per InvenTree call; uploads included, so not too tight. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface InvenTreeConfig {
    baseUrl: string;
}

export class HttpBase {
    protected config: InvenTreeConfig;

    /** Set by the app: runs after every successful write, so queries can refetch. */
    onMutation?: (endpoint: string, method: string) => void;

    constructor(config: InvenTreeConfig) {
        this.config = config;
    }

    /**
     * Generic HTTP request handler for InvenTree API
     *
     * @param endpoint - API endpoint
     * @param method - HTTP method (GET, POST, PATCH, etc.)
     * @param body - Request body
     * @param isFormData - Whether body is FormData
     */
    protected async request<T>(
        endpoint: string,
        method: string = 'GET',
        body?: unknown,
        isFormData: boolean = false
    ): Promise<T> {
        const url = `${this.config.baseUrl}/api/${endpoint.replace(/^\//, '')}`;

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
                        globalThis.dispatchEvent?.(new Event(VOLUNTEER_AUTH_FAILED));
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

            if (method !== 'GET') this.onMutation?.(endpoint, method);
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
     * GET every page of a list endpoint. `endpoint` already carries
     * `limit=500`; one page used to be all the app read, so past 500 rows
     * parts went missing and sale prices fell back to 0.
     */
    protected async requestAll<R>(endpoint: string): Promise<{ count: number; results: R[] }> {
        const pageSize = 500;
        const results: R[] = [];
        for (let offset = 0; ; offset += pageSize) {
            const page = await this.request<{ count: number; results: R[] }>(
                `${endpoint}&offset=${offset}`
            );
            const rows = page.results || [];
            results.push(...rows);
            if (rows.length < pageSize || results.length >= page.count) {
                return { count: results.length, results };
            }
        }
    }

}
