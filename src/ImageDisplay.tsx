/**
 * @file ImageDisplay.tsx
 * 
 * Reusable component for displaying images with loading states, error handling,
 * and automatic retry logic. Pure Tailwind — no MUI dependencies.
 */

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { loadImage } from './imageHandler';
import { cn } from './lib/utils';

interface ImageDisplayProps {
    /** Relative path to the image (e.g., "media/part_images/abc.png") */
    imagePath: string | null;
    /** Alternative text for accessibility */
    alt?: string;
    /** Width of the image container */
    width?: number | string;
    /** Height of the image container */
    height?: number | string;
    /** Additional CSS classes for the container */
    className?: string;
    /** Callback when image loads successfully */
    onLoad?: () => void;
    /** Callback when image fails to load */
    onError?: (error: string) => void;
    /** Show placeholder while loading */
    showPlaceholder?: boolean;
    /** @deprecated Use className instead — kept for migration compatibility */
    sx?: Record<string, unknown>;
}

/**
 * ImageDisplay Component
 * 
 * Displays images from InvenTree with robust error handling:
 * - Shows loading skeleton while fetching
 * - Displays fallback icon on failure
 * - Validates image before rendering
 * 
 * @example
 * <ImageDisplay
 *   imagePath="media/part_images/part_123.png"
 *   alt="Part image"
 *   width={200}
 *   height={200}
 * />
 */
export default function ImageDisplay({
    imagePath,
    alt = 'Item image',
    width = 200,
    height = 200,
    className,
    onLoad,
    onError,
    showPlaceholder = true,
}: ImageDisplayProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [renderFailed, setRenderFailed] = useState(false);

    const sizeStyle = {
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
    };

    useEffect(() => {
        // Track if component is still mounted
        let isMounted = true;
        let currentUrl: string | null = null;

        // Reset state when imagePath changes
        setIsLoading(true);
        setError(null);
        setImageUrl(null);
        setRenderFailed(false);

        // Don't load if no path provided
        if (!imagePath) {
            setIsLoading(false);
            setError('No image provided');
            onError?.('No image path');
            return;
        }

        // Load the image
        const loadImg = async () => {
            try {
                const result = await loadImage(imagePath);

                if (!isMounted) {
                    // Revoke URL if component unmounted during load
                    if (result.url) URL.revokeObjectURL(result.url);
                    return;
                }

                if (result.success && result.url) {
                    currentUrl = result.url;
                    setImageUrl(result.url);
                    setError(null);
                    onLoad?.();
                } else {
                    const errorMsg = result.error || 'Failed to load image';
                    setError(errorMsg);
                    onError?.(errorMsg);
                }
            } catch (err) {
                if (!isMounted) return;
                const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                setError(errorMsg);
                onError?.(errorMsg);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadImg();

        // Cleanup: revoke Object URL when component unmounts or imagePath changes
        return () => {
            isMounted = false;
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imagePath]); // Only re-run when imagePath changes

    // Loading state
    if (isLoading && showPlaceholder) {
        return (
            <div
                className={cn("bg-white animate-pulse", className)}
                style={sizeStyle}
            />
        );
    }

    // Error state (from loading or rendering)
    if (error || renderFailed) {
        return (
            <div
                className={cn(
                    "flex flex-col items-center justify-center bg-white",
                    className
                )}
                style={sizeStyle}
            >
                <ImageOff className="w-5 h-5 text-brand-black/30" />
            </div>
        );
    }

    // Success state
    if (imageUrl) {
        return (
            <img
                src={imageUrl}
                alt={alt}
                onError={() => {
                    // Only log once, don't cause infinite loops
                    if (!renderFailed) {
                        console.warn(`Image failed to render: ${imagePath}`);
                        setRenderFailed(true);
                    }
                }}
                className={cn("object-contain", className)}
                style={sizeStyle}
            />
        );
    }

    // No image to display (shouldn't reach here normally)
    return null;
}
