/**
 * @file imageHandler.ts
 * 
 * Image loading from InvenTree via Caddy proxy.
 * Uses Object URLs for efficient memory usage.
 */

// Import the InvenTree token from environment
const INVENTREE_TOKEN = import.meta.env.VITE_INVENTREE_TOKEN || '';

// ============================================================================
// CONSTANTS
// ============================================================================

const IMAGE_RETRY_ATTEMPTS = 2;
const IMAGE_RETRY_DELAY = 500; // ms
const IMAGE_LOAD_TIMEOUT = 10000; // 10 seconds

// ============================================================================
// TYPES
// ============================================================================

export interface ImageLoadResult {
    success: boolean;
    url?: string;
    error?: string;
}

// ============================================================================
// HELPER
// ============================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// IMAGE LOADING
// ============================================================================

/**
 * Load an image from InvenTree via the backend proxy.
 * Returns an Object URL for efficient rendering.
 * 
 * IMPORTANT: Callers must revoke the returned URL when done using URL.revokeObjectURL().
 * 
 * @param imageRelativePath - Relative path to image (e.g., "media/part_images/abc.png")
 * @returns ImageLoadResult with Object URL or error information
 */
export async function loadImage(imageRelativePath: string | null): Promise<ImageLoadResult> {
    if (!imageRelativePath || imageRelativePath.trim() === '') {
        return { success: false, error: 'No image path provided' };
    }

    // Handle absolute URLs from InvenTree (e.g., http://inventree-server:8000/media/...)
    // We want to extract just the path after the domain
    let cleanPath = imageRelativePath;
    try {
        if (imageRelativePath.startsWith('http')) {
            const url = new URL(imageRelativePath);
            cleanPath = url.pathname; // This gives us /media/...
        }
    } catch (e) {
        console.warn('Failed to parse image path as URL:', imageRelativePath);
    }

    // Ensure the path starts with / for proper proxying through Caddy
    const proxiedUrl = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

    let lastError = '';
    for (let attempt = 1; attempt <= IMAGE_RETRY_ATTEMPTS; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), IMAGE_LOAD_TIMEOUT);

            console.debug(`[Image] Fetching ${proxiedUrl}`);
            const response = await fetch(proxiedUrl, {
                method: 'GET',
                headers: {
                    // Include Authorization header for InvenTree media access
                    'Authorization': `Token ${INVENTREE_TOKEN}`,
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error(`[Image] HTTP error for ${cleanPath}: ${response.status}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            console.debug(`[Image] Content-Type: ${contentType}`);

            // Reject HTML responses (error pages, login redirects)
            if (contentType.includes('text/html')) {
                throw new Error('Server returned HTML instead of image');
            }

            const blob = await response.blob();

            if (!blob || blob.size === 0) {
                throw new Error('Empty response received');
            }

            // Use Object URL instead of data URL for better memory efficiency
            const objectUrl = URL.createObjectURL(blob);

            return { success: true, url: objectUrl };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            lastError = errorMsg;

            console.warn(`Image load attempt ${attempt}/${IMAGE_RETRY_ATTEMPTS} failed for ${cleanPath}: ${errorMsg}`);

            // Don't retry on definitive errors
            if (errorMsg.includes('404') || errorMsg.includes('HTML instead')) {
                break;
            }

            if (attempt < IMAGE_RETRY_ATTEMPTS) {
                await sleep(IMAGE_RETRY_DELAY * attempt);
            }
        }
    }

    return { success: false, error: lastError || 'Failed to load image' };
}
