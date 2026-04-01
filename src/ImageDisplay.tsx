/**
 * @file ImageDisplay.tsx
 * 
 * Reusable component for displaying images with loading states, error handling,
 * and automatic retry logic.
 */

import { useEffect, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import { loadImage } from './imageHandler';



interface ImageDisplayProps {
    /** Relative path to the image (e.g., "media/part_images/abc.png") */
    imagePath: string | null;
    /** Alternative text for accessibility */
    alt?: string;
    /** Width of the image container */
    width?: number | string;
    /** Height of the image container */
    height?: number | string;
    /** CSS styles for the container */
    sx?: SxProps<Theme>;
    /** Callback when image loads successfully */
    onLoad?: () => void;
    /** Callback when image fails to load */
    onError?: (error: string) => void;
    /** Show placeholder while loading */
    showPlaceholder?: boolean;
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
    sx = {},
    onLoad,
    onError,
    showPlaceholder = true,
}: ImageDisplayProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [renderFailed, setRenderFailed] = useState(false);

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

    // Render states

    // Loading state
    if (isLoading && showPlaceholder) {
        return (
            <Skeleton
                variant="rectangular"
                width={width}
                height={height}
                sx={{
                    borderRadius: 1.5,
                    ...sx,
                }}
            />
        );
    }

    // Error state (from loading or rendering)
    if (error || renderFailed) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width,
                    height,
                    gap: 1,
                    ...sx,
                }}
            >
                <ImageNotSupportedIcon
                    sx={{
                        fontSize: 40,
                        color: 'text.disabled',
                    }}
                />
                <Typography variant="caption" color="text.disabled" align="center" sx={{ px: 1 }}>
                    {error || 'Image failed to render'}
                </Typography>
            </Box>
        );
    }

    // Success state
    if (imageUrl) {
        return (
            <Box
                component="img"
                src={imageUrl}
                alt={alt}
                onError={() => {
                    // Only log once, don't cause infinite loops
                    if (!renderFailed) {
                        console.warn(`Image failed to render: ${imagePath}`);
                        setRenderFailed(true);
                    }
                }}
                sx={{
                    width,
                    height,
                    objectFit: 'contain',
                    borderRadius: 1.5,
                    ...sx,
                }}
            />
        );
    }

    // No image to display (shouldn't reach here normally)
    return null;
}
