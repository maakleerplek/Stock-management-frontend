/**
 * @file CacheManager.tsx
 * 
 * UI component for managing application cache (API data and images)
 * Displays cache statistics and provides controls to clear cache
 */

import { useState, useEffect } from 'react';
import { Database, Trash2, RefreshCw, X, HardDrive } from 'lucide-react';
import { CacheManager, getCacheStats, type CacheStats } from '../lib/cache';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface CacheManagerProps {
    open: boolean;
    onClose: () => void;
}

export default function CacheManagerComponent({ open, onClose }: CacheManagerProps) {
    const [stats, setStats] = useState<CacheStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);

    const loadStats = async () => {
        setLoading(true);
        try {
            const cacheStats = await getCacheStats();
            setStats(cacheStats);
        } catch (error) {
            console.error('Failed to load cache stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            loadStats();
        }
    }, [open]);

    const handleClearAll = async () => {
        if (!confirm('Clear all cached data? This will force fresh downloads of all API data and images.')) {
            return;
        }

        setClearing(true);
        try {
            await CacheManager.clearAll();
            await loadStats(); // Reload stats
            alert('Cache cleared successfully!');
        } catch (error) {
            console.error('Failed to clear cache:', error);
            alert('Failed to clear cache. Check console for details.');
        } finally {
            setClearing(false);
        }
    };

    const handleClearExpired = async () => {
        setClearing(true);
        try {
            await CacheManager.clearExpired();
            await loadStats(); // Reload stats
            alert('Expired cache entries cleared!');
        } catch (error) {
            console.error('Failed to clear expired cache:', error);
            alert('Failed to clear expired cache. Check console for details.');
        } finally {
            setClearing(false);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-brand-black/50 z-40"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-white border-2 border-brand-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b-2 border-brand-black bg-brand-beige-dark">
                                <div className="flex items-center gap-3">
                                    <Database className="w-6 h-6" />
                                    <h2 className="text-lg font-black uppercase tracking-widest">CACHE MANAGER</h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-brand-beige border-2 border-brand-black transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 bg-brand-beige space-y-6">
                                {loading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <RefreshCw className="w-8 h-8 animate-spin text-brand-black" />
                                    </div>
                                ) : stats ? (
                                    <>
                                        {/* Stats */}
                                        <div className="space-y-4">
                                            {/* API Cache */}
                                            <div className="border-2 border-brand-black bg-white p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <HardDrive className="w-5 h-5" />
                                                    <h3 className="font-black uppercase text-sm tracking-widest">API CACHE</h3>
                                                </div>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="font-bold uppercase text-xs">ENTRIES:</span>
                                                        <span className="font-black">{stats.apiCacheCount}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="font-bold uppercase text-xs">SIZE:</span>
                                                        <span className="font-black">{formatBytes(stats.apiCacheSize)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Image Cache */}
                                            <div className="border-2 border-brand-black bg-white p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Database className="w-5 h-5" />
                                                    <h3 className="font-black uppercase text-sm tracking-widest">IMAGE CACHE</h3>
                                                </div>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="font-bold uppercase text-xs">IMAGES:</span>
                                                        <span className="font-black">{stats.imageCacheCount}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="font-bold uppercase text-xs">SIZE:</span>
                                                        <span className="font-black">{formatBytes(stats.imageCacheSize)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Total */}
                                            <div className="border-2 border-brand-black bg-emerald-400 p-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-black uppercase tracking-widest">TOTAL SIZE:</span>
                                                    <span className="font-black text-lg">
                                                        {formatBytes(stats.apiCacheSize + stats.imageCacheSize)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="space-y-3">
                                            <button
                                                onClick={handleClearExpired}
                                                disabled={clearing}
                                                className={cn(
                                                    "brutalist-button w-full py-3 flex items-center justify-center gap-2",
                                                    clearing && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <RefreshCw className={cn("w-5 h-5", clearing && "animate-spin")} />
                                                <span className="font-black uppercase text-sm tracking-widest">
                                                    CLEAR EXPIRED
                                                </span>
                                            </button>

                                            <button
                                                onClick={handleClearAll}
                                                disabled={clearing}
                                                className={cn(
                                                    "brutalist-button w-full py-3 flex items-center justify-center gap-2 bg-rose-400",
                                                    clearing && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <Trash2 className="w-5 h-5" />
                                                <span className="font-black uppercase text-sm tracking-widest">
                                                    CLEAR ALL CACHE
                                                </span>
                                            </button>
                                        </div>

                                        {/* Info */}
                                        <div className="text-xs font-bold uppercase tracking-wide text-brand-black/60 text-center">
                                            <p>Cache helps speed up the app by storing data locally.</p>
                                            <p className="mt-1">Clear if you're experiencing issues.</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="font-black uppercase text-sm tracking-widest text-brand-black/40">
                                            FAILED TO LOAD STATS
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex gap-3 p-6 border-t-2 border-brand-black bg-white">
                                <button
                                    onClick={loadStats}
                                    disabled={loading}
                                    className={cn(
                                        "brutalist-button flex-1 py-3",
                                        loading && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <RefreshCw className={cn("w-5 h-5 mx-auto", loading && "animate-spin")} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="brutalist-button flex-1 py-3 font-black uppercase tracking-widest"
                                >
                                    CLOSE
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
