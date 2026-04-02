/**
 * @file cache.ts
 * 
 * Comprehensive caching system for InvenTree API data and images
 * 
 * Features:
 * - API response caching using localStorage with TTL
 * - Image blob caching using IndexedDB
 * - Automatic cache cleanup for expired entries
 * - Cache size management
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

export interface ImageCacheEntry {
    blob: Blob;
    contentType: string;
    timestamp: number;
    size: number;
}

export interface CacheStats {
    apiCacheSize: number;
    apiCacheCount: number;
    imageCacheSize: number;
    imageCacheCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_CACHE_PREFIX = 'inventree_api_';
const IMAGE_DB_NAME = 'InvenTreeImageCache';
const IMAGE_STORE_NAME = 'images';
const IMAGE_DB_VERSION = 1;

// Default TTLs
export const CACHE_TTL = {
    SHORT: 2 * 60 * 1000,      // 2 minutes
    MEDIUM: 15 * 60 * 1000,    // 15 minutes
    LONG: 60 * 60 * 1000,      // 1 hour
    DAY: 24 * 60 * 60 * 1000,  // 24 hours
    WEEK: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Cache size limits (in bytes)
const MAX_IMAGE_CACHE_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_API_CACHE_SIZE = 10 * 1024 * 1024;    // 10 MB

// ============================================================================
// API CACHE (localStorage)
// ============================================================================

export class ApiCache {
    /**
     * Store API response in cache
     */
    static set<T>(key: string, data: T, ttl: number = CACHE_TTL.MEDIUM): void {
        try {
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                ttl,
            };
            
            const cacheKey = API_CACHE_PREFIX + key;
            localStorage.setItem(cacheKey, JSON.stringify(entry));
            
            // Cleanup old entries if cache is getting too large
            this.cleanupIfNeeded();
        } catch (error) {
            console.warn('[ApiCache] Failed to cache data:', error);
            // If quota exceeded, try clearing old entries
            if (error instanceof Error && error.name === 'QuotaExceededError') {
                this.clearExpired();
                // Try again
                try {
                    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
                    localStorage.setItem(API_CACHE_PREFIX + key, JSON.stringify(entry));
                } catch {
                    console.error('[ApiCache] Still failed after cleanup');
                }
            }
        }
    }

    /**
     * Get API response from cache
     */
    static get<T>(key: string): T | null {
        try {
            const cacheKey = API_CACHE_PREFIX + key;
            const cached = localStorage.getItem(cacheKey);
            
            if (!cached) {
                return null;
            }

            const entry: CacheEntry<T> = JSON.parse(cached);
            const age = Date.now() - entry.timestamp;

            // Check if expired
            if (age > entry.ttl) {
                console.debug(`[ApiCache] Cache expired for ${key}`);
                localStorage.removeItem(cacheKey);
                return null;
            }

            console.debug(`[ApiCache] Cache hit for ${key} (age: ${Math.round(age / 1000)}s)`);
            return entry.data;
        } catch (error) {
            console.warn('[ApiCache] Failed to read cache:', error);
            return null;
        }
    }

    /**
     * Check if a key exists and is not expired
     */
    static has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Remove a specific cache entry
     */
    static remove(key: string): void {
        localStorage.removeItem(API_CACHE_PREFIX + key);
    }

    /**
     * Clear all expired cache entries
     */
    static clearExpired(): number {
        let cleared = 0;
        const now = Date.now();
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(API_CACHE_PREFIX)) {
                try {
                    const entry: CacheEntry<unknown> = JSON.parse(localStorage.getItem(key)!);
                    if (now - entry.timestamp > entry.ttl) {
                        localStorage.removeItem(key);
                        cleared++;
                    }
                } catch {
                    // Invalid entry, remove it
                    localStorage.removeItem(key);
                    cleared++;
                }
            }
        }
        
        if (cleared > 0) {
            console.debug(`[ApiCache] Cleared ${cleared} expired entries`);
        }
        return cleared;
    }

    /**
     * Clear all API cache entries
     */
    static clear(): void {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(API_CACHE_PREFIX)) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
        console.debug(`[ApiCache] Cleared ${keys.length} cache entries`);
    }

    /**
     * Get cache statistics
     */
    static getStats(): { count: number; size: number } {
        let count = 0;
        let size = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(API_CACHE_PREFIX)) {
                count++;
                const value = localStorage.getItem(key);
                if (value) {
                    size += new Blob([value]).size;
                }
            }
        }

        return { count, size };
    }

    /**
     * Cleanup if cache is too large
     */
    private static cleanupIfNeeded(): void {
        const stats = this.getStats();
        if (stats.size > MAX_API_CACHE_SIZE) {
            console.warn('[ApiCache] Cache size exceeded, clearing expired entries');
            this.clearExpired();
        }
    }
}

// ============================================================================
// IMAGE CACHE (IndexedDB)
// ============================================================================

export class ImageCache {
    private static dbPromise: Promise<IDBDatabase> | null = null;

    /**
     * Initialize IndexedDB connection
     */
    private static getDB(): Promise<IDBDatabase> {
        if (this.dbPromise) {
            return this.dbPromise;
        }

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);

            request.onerror = () => {
                console.error('[ImageCache] Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
                    const store = db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'url' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
            };
        });

        return this.dbPromise;
    }

    /**
     * Store image blob in cache
     */
    static async set(url: string, blob: Blob, contentType: string): Promise<void> {
        try {
            const db = await this.getDB();
            const transaction = db.transaction([IMAGE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(IMAGE_STORE_NAME);

            const entry: ImageCacheEntry & { url: string } = {
                url,
                blob,
                contentType,
                timestamp: Date.now(),
                size: blob.size,
            };

            await new Promise<void>((resolve, reject) => {
                const request = store.put(entry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            console.debug(`[ImageCache] Cached image: ${url} (${Math.round(blob.size / 1024)}KB)`);

            // Cleanup if cache is too large
            await this.cleanupIfNeeded();
        } catch (error) {
            console.warn('[ImageCache] Failed to cache image:', error);
        }
    }

    /**
     * Get image blob from cache
     */
    static async get(url: string, maxAge: number = CACHE_TTL.WEEK): Promise<Blob | null> {
        try {
            const db = await this.getDB();
            const transaction = db.transaction([IMAGE_STORE_NAME], 'readonly');
            const store = transaction.objectStore(IMAGE_STORE_NAME);

            const entry = await new Promise<(ImageCacheEntry & { url: string }) | undefined>((resolve, reject) => {
                const request = store.get(url);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!entry) {
                return null;
            }

            const age = Date.now() - entry.timestamp;
            
            // Check if expired
            if (age > maxAge) {
                console.debug(`[ImageCache] Image expired: ${url}`);
                await this.remove(url);
                return null;
            }

            console.debug(`[ImageCache] Cache hit: ${url} (age: ${Math.round(age / 1000 / 60)}min)`);
            return entry.blob;
        } catch (error) {
            console.warn('[ImageCache] Failed to read image cache:', error);
            return null;
        }
    }

    /**
     * Check if image exists in cache
     */
    static async has(url: string, maxAge: number = CACHE_TTL.WEEK): Promise<boolean> {
        const blob = await this.get(url, maxAge);
        return blob !== null;
    }

    /**
     * Remove a specific image from cache
     */
    static async remove(url: string): Promise<void> {
        try {
            const db = await this.getDB();
            const transaction = db.transaction([IMAGE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(IMAGE_STORE_NAME);

            await new Promise<void>((resolve, reject) => {
                const request = store.delete(url);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('[ImageCache] Failed to remove image:', error);
        }
    }

    /**
     * Clear all images from cache
     */
    static async clear(): Promise<void> {
        try {
            const db = await this.getDB();
            const transaction = db.transaction([IMAGE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(IMAGE_STORE_NAME);

            await new Promise<void>((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => {
                    console.debug('[ImageCache] Cleared all images');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[ImageCache] Failed to clear cache:', error);
        }
    }

    /**
     * Get cache statistics
     */
    static async getStats(): Promise<{ count: number; size: number }> {
        try {
            const db = await this.getDB();
            const transaction = db.transaction([IMAGE_STORE_NAME], 'readonly');
            const store = transaction.objectStore(IMAGE_STORE_NAME);

            const entries = await new Promise<(ImageCacheEntry & { url: string })[]>((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            const count = entries.length;
            const size = entries.reduce((total, entry) => total + entry.size, 0);

            return { count, size };
        } catch (error) {
            console.warn('[ImageCache] Failed to get stats:', error);
            return { count: 0, size: 0 };
        }
    }

    /**
     * Cleanup old images if cache is too large
     */
    private static async cleanupIfNeeded(): Promise<void> {
        try {
            const stats = await this.getStats();
            
            if (stats.size > MAX_IMAGE_CACHE_SIZE) {
                console.warn(`[ImageCache] Cache size (${Math.round(stats.size / 1024 / 1024)}MB) exceeded limit, cleaning up...`);
                
                const db = await this.getDB();
                const transaction = db.transaction([IMAGE_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(IMAGE_STORE_NAME);
                const index = store.index('timestamp');

                // Get all entries sorted by timestamp (oldest first)
                const entries = await new Promise<(ImageCacheEntry & { url: string })[]>((resolve, reject) => {
                    const request = index.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                // Delete oldest entries until we're under the limit
                let currentSize = stats.size;
                let deleted = 0;

                for (const entry of entries) {
                    if (currentSize <= MAX_IMAGE_CACHE_SIZE * 0.8) {
                        break; // Keep 20% buffer
                    }

                    await this.remove(entry.url);
                    currentSize -= entry.size;
                    deleted++;
                }

                console.debug(`[ImageCache] Deleted ${deleted} old images, freed ${Math.round((stats.size - currentSize) / 1024 / 1024)}MB`);
            }
        } catch (error) {
            console.warn('[ImageCache] Cleanup failed:', error);
        }
    }

    /**
     * Remove expired images
     */
    static async clearExpired(maxAge: number = CACHE_TTL.WEEK): Promise<number> {
        try {
            const db = await this.getDB();
            const transaction = db.transaction([IMAGE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(IMAGE_STORE_NAME);

            const entries = await new Promise<(ImageCacheEntry & { url: string })[]>((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            const now = Date.now();
            let deleted = 0;

            for (const entry of entries) {
                if (now - entry.timestamp > maxAge) {
                    await this.remove(entry.url);
                    deleted++;
                }
            }

            if (deleted > 0) {
                console.debug(`[ImageCache] Cleared ${deleted} expired images`);
            }

            return deleted;
        } catch (error) {
            console.warn('[ImageCache] Failed to clear expired:', error);
            return 0;
        }
    }
}

// ============================================================================
// UNIFIED CACHE MANAGEMENT
// ============================================================================

export class CacheManager {
    /**
     * Get comprehensive cache statistics
     */
    static async getStats(): Promise<CacheStats> {
        const apiStats = ApiCache.getStats();
        const imageStats = await ImageCache.getStats();

        return {
            apiCacheSize: apiStats.size,
            apiCacheCount: apiStats.count,
            imageCacheSize: imageStats.size,
            imageCacheCount: imageStats.count,
        };
    }

    /**
     * Clear all caches
     */
    static async clearAll(): Promise<void> {
        ApiCache.clear();
        await ImageCache.clear();
        console.info('[CacheManager] All caches cleared');
    }

    /**
     * Clear only expired entries
     */
    static async clearExpired(): Promise<void> {
        ApiCache.clearExpired();
        await ImageCache.clearExpired();
        console.info('[CacheManager] Expired cache entries cleared');
    }

    /**
     * Log cache statistics to console
     */
    static async logStats(): Promise<void> {
        const stats = await this.getStats();
        console.group('[CacheManager] Cache Statistics');
        console.log(`API Cache: ${stats.apiCacheCount} entries, ${Math.round(stats.apiCacheSize / 1024)}KB`);
        console.log(`Image Cache: ${stats.imageCacheCount} images, ${Math.round(stats.imageCacheSize / 1024 / 1024)}MB`);
        console.groupEnd();
    }
}

// Export convenience function
export async function getCacheStats(): Promise<CacheStats> {
    return CacheManager.getStats();
}
