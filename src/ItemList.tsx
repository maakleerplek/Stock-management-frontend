import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw, Box, Euro, Loader2, Plus, Minus, Trash2, CheckCircle, Tag, MapPin } from 'lucide-react';
import ImageDisplay from './ImageDisplay';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { handleAddItem, handleTakeItem } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import { useStock } from './StockContext';
import StockConfirmationModal from './components/StockConfirmationModal';

interface Item {
    id: number;
    name: string;
    quantity: number;
    price: number;
    image: string | null;
}

interface Adjustment {
    item: Item;
    delta: number;
}

// Compact brutalist chips showing an item's category and storage location.
function MetaTags({ category, location, className }: { category?: string; location?: string | null; className?: string }) {
    const showCategory = category && category !== 'Uncategorized';
    if (!showCategory && !location) return null;
    return (
        <div className={cn("flex flex-wrap items-center gap-1", className)}>
            {showCategory && (
                <span className="inline-flex items-center gap-1 border border-brand-black bg-brand-beige-dark px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-brand-black/70 max-w-[160px]">
                    <Tag size={10} className="flex-shrink-0" />
                    <span className="truncate">{category}</span>
                </span>
            )}
            {location && (
                <span className="inline-flex items-center gap-1 border border-brand-black bg-brand-beige-dark px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-brand-black/70 max-w-[200px]">
                    <MapPin size={10} className="flex-shrink-0" />
                    <span className="truncate">{location}</span>
                </span>
            )}
        </div>
    );
}

export default function ItemList() {
    const { items, loading, error, refreshInventory } = useStock();
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
    const [isCommitting, setIsCommitting] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();

    // Unique category / location values present in the current stock, for the filter dropdowns.
    const categoryOptions = useMemo(
        () => Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
        [items]
    );
    const locationOptions = useMemo(
        () => Array.from(new Set(items.map(i => i.location).filter((l): l is string => Boolean(l)))).sort((a, b) => a.localeCompare(b)),
        [items]
    );

    const filteredItems = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(q) &&
            (categoryFilter === '' || item.category === categoryFilter) &&
            (locationFilter === '' || item.location === locationFilter)
        );
    }, [items, searchQuery, categoryFilter, locationFilter]);

    // Keep pagination valid when the active filters shrink the result set.
    useEffect(() => {
        setPage(0);
    }, [searchQuery, categoryFilter, locationFilter]);

    const pagedItems = filteredItems.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    const hasActiveFilters = categoryFilter !== '' || locationFilter !== '';

    const handleChangePage = (_event: unknown, newPage: number) => setPage(newPage);
    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // Adjustment helpers
    const addAdjustment = (item: Item, delta: number) => {
        setAdjustments(prev => {
            const existing = prev.find(a => a.item.id === item.id);
            if (existing) {
                const newDelta = existing.delta + delta;
                if (newDelta === 0) return prev.filter(a => a.item.id !== item.id);
                return prev.map(a => a.item.id === item.id ? { ...a, delta: newDelta } : a);
            }
            return [...prev, { item, delta }];
        });
    };

    const removeAdjustment = (id: number) => {
        setAdjustments(prev => prev.filter(a => a.item.id !== id));
    };

    const clearAdjustments = () => setAdjustments([]);

    const handleCommit = async () => {
        if (adjustments.length === 0) return;
        setIsCommitting(true);

        try {
            for (const adj of adjustments) {
                let success = false;
                const totalPrice = adj.item.price > 0 ? parseFloat((adj.item.price * Math.abs(adj.delta)).toFixed(2)) : undefined;
                if (adj.delta > 0) {
                    success = await handleAddItem(adj.item.id, adj.delta, adj.item.name, totalPrice, 'inventory-overview');
                } else if (adj.delta < 0) {
                    success = await handleTakeItem(adj.item.id, Math.abs(adj.delta), adj.item.name, totalPrice, 'inventory-overview');
                } else {
                    success = true;
                }
                if (!success) {
                    addToast(`Failed to update "${adj.item.name}". Remaining items not processed.`, 'error');
                    setIsCommitting(false);
                    setIsConfirmOpen(false);
                    return;
                }
            }
            addToast('All stock adjustments saved!', 'success');
            setAdjustments([]);
            setIsConfirmOpen(false);
            
            // Refresh global cache
            await refreshInventory();
        } catch {
            addToast('Unexpected error during commit', 'error');
        } finally {
            setIsCommitting(false);
        }
    };

    const getAdjustmentDelta = (id: number) => {
        return adjustments.find(a => a.item.id === id)?.delta ?? 0;
    };

    if (loading && items.length === 0) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-black" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-brand-beige">
            {/* Main Table Area */}
            <main className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 overflow-hidden">
                {/* Header - Fixed at top */}
                <div className="flex-shrink-0 mb-4 border border-brand-black bg-brand-beige">
                    {/* Top row: title + search + refresh */}
                    <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 p-4">
                        <div className="flex items-center gap-3">
                            <Box className="w-6 h-6 text-brand-black" />
                            <h2 className="text-lg font-black tracking-widest uppercase">STOCK LIST</h2>
                        </div>
                        <div className="flex gap-4 items-center flex-grow max-w-full md:max-w-[500px]">
                            <div className="brutalist-input flex items-center flex-1 px-4 py-2 border border-brand-black bg-brand-beige">
                                <Search className="w-5 h-5 text-brand-black mr-2" />
                                <input
                                    type="text"
                                    placeholder="SEARCH ITEMS..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="flex-1 bg-transparent border-none outline-none text-sm font-bold placeholder-brand-black/50 uppercase"
                                />
                            </div>
                            <button
                                onClick={async () => {
                                    await refreshInventory();
                                    addToast('Stock list refreshed', 'success');
                                }}
                                disabled={loading}
                                title="Refresh List"
                                className={cn("brutalist-button p-3", loading && "opacity-50 cursor-not-allowed")}
                            >
                                <RefreshCw className={cn("w-5 h-5 text-brand-black", loading && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    {/* Filter row: category + location */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 pb-4 border-t border-brand-black/20 pt-4">
                        <div className="flex items-center gap-2 border border-brand-black bg-brand-beige px-3 py-2 flex-1 sm:flex-none sm:min-w-[200px]">
                            <Tag size={14} className="text-brand-black/60 flex-shrink-0" />
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="flex-1 bg-transparent outline-none text-xs font-black uppercase tracking-widest cursor-pointer"
                            >
                                <option value="">ALL CATEGORIES</option>
                                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 border border-brand-black bg-brand-beige px-3 py-2 flex-1 sm:flex-none sm:min-w-[200px]">
                            <MapPin size={14} className="text-brand-black/60 flex-shrink-0" />
                            <select
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                className="flex-1 bg-transparent outline-none text-xs font-black uppercase tracking-widest cursor-pointer"
                            >
                                <option value="">ALL LOCATIONS</option>
                                {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        {hasActiveFilters && (
                            <button
                                onClick={() => { setCategoryFilter(''); setLocationFilter(''); }}
                                className="brutalist-button px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                            >
                                CLEAR FILTERS
                            </button>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/50 sm:ml-auto">
                            {filteredItems.length} {filteredItems.length === 1 ? 'ITEM' : 'ITEMS'}
                        </span>
                    </div>
                </div>

                {error && (
                    <div className="flex-shrink-0 border border-brand-black bg-brand-beige p-4 mb-4">
                        <p className="text-sm font-bold text-red-600 uppercase">{error}</p>
                    </div>
                )}

                {/* Table Container - Fills remaining space and scrolls */}
                <div className="flex-1 min-h-0 flex flex-col border border-brand-black bg-brand-beige">
                    {/* Scrollable list wrapper */}
                    <div className="flex-1 overflow-auto">
                        {/* ── Mobile: row cards (below sm) ── */}
                        <ul className="sm:hidden divide-y divide-brand-black/30">
                            {pagedItems.map((item) => {
                                const delta = getAdjustmentDelta(item.id);
                                return (
                                    <li
                                        key={item.id}
                                        className={cn(
                                            "grid grid-cols-[48px_1fr_auto] gap-3 items-center px-4 py-3",
                                            delta > 0 && "bg-emerald-50",
                                            delta < 0 && "bg-rose-50",
                                            delta === 0 && item.quantity === 0 && "bg-rose-50/50"
                                        )}
                                    >
                                        <div className="border border-brand-black bg-white w-12 h-12 overflow-hidden">
                                            <ImageDisplay imagePath={item.image} alt={item.name} width={48} height={48} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm tracking-tight uppercase truncate">{item.name}</p>
                                            <div className="flex items-center gap-1 mt-0.5 text-brand-black/70">
                                                <Euro className="w-3 h-3" />
                                                <span className="font-bold text-xs">{item.price.toFixed(2)}</span>
                                            </div>
                                            <MetaTags category={item.category} location={item.location} className="mt-1" />
                                        </div>
                                        <div className="flex items-center gap-3 justify-self-end">
                                            <div className="text-right">
                                                <div className={cn(
                                                    "font-black text-lg leading-none",
                                                    item.quantity === 0 && "text-rose-600"
                                                )}>
                                                    {item.quantity}
                                                </div>
                                                <div className="text-[9px] font-black uppercase tracking-widest text-brand-black/50 mt-0.5">
                                                    {delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : 'STOCK'}
                                                </div>
                                            </div>
                                            {isVolunteerMode && item.id > 0 && (
                                                <div className="flex">
                                                    <button
                                                        onClick={() => addAdjustment(item, -1)}
                                                        className="w-11 h-11 flex items-center justify-center border border-brand-black bg-rose-400 active:translate-x-[1px] active:translate-y-[1px]"
                                                        title="Remove 1 from stock"
                                                    >
                                                        <Minus size={18} className="text-brand-black" />
                                                    </button>
                                                    <button
                                                        onClick={() => addAdjustment(item, 1)}
                                                        className="w-11 h-11 flex items-center justify-center border border-l-0 border-brand-black bg-emerald-400 active:translate-x-[1px] active:translate-y-[1px]"
                                                        title="Add 1 to stock"
                                                    >
                                                        <Plus size={18} className="text-brand-black" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                            {filteredItems.length === 0 && !loading && (
                                <li className="p-16 text-center bg-brand-beige-dark">
                                    <p className="text-sm font-black tracking-widest uppercase opacity-40">NO ITEMS FOUND</p>
                                </li>
                            )}
                        </ul>

                        {/* ── Desktop: table (sm and up) ── */}
                        <table className="hidden sm:table w-full min-w-[600px] border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-brand-black bg-brand-beige-dark">
                                    <th className="p-3 pl-6 text-left w-[80px]" />
                                    <th className="p-3 text-left">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">ITEM</span>
                                    </th>
                                    <th className="p-3 text-right w-[100px]">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">STOCK</span>
                                    </th>
                                    <th className="p-3 text-right w-[100px]">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">PRICE</span>
                                    </th>
                                    {isVolunteerMode && (
                                        <th className="p-3 text-center w-[120px]">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">ACTIONS</span>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-brand-black/10">
                                {pagedItems
                                    .map((item) => {
                                        const delta = getAdjustmentDelta(item.id);
                                        return (
                                            <tr key={item.id} className={cn(
                                                "hover:bg-brand-beige-dark/50 transition-colors",
                                                delta > 0 && "bg-emerald-50",
                                                delta < 0 && "bg-rose-50",
                                                delta === 0 && item.quantity === 0 && "bg-rose-50/50"
                                            )}>
                                                <td className="p-2 pl-6">
                                                    <div className="border border-brand-black bg-white w-10 h-10 overflow-hidden flex-shrink-0">
                                                        <ImageDisplay imagePath={item.image} alt={item.name} width={40} height={40} />
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <p className="font-bold text-sm tracking-tight uppercase">{item.name}</p>
                                                    <MetaTags category={item.category} location={item.location} className="mt-1.5" />
                                                </td>
                                                <td className="p-3 text-right">
                                                    <span className={cn(
                                                        "font-black text-sm",
                                                        item.quantity === 0 && "text-rose-600"
                                                    )}>
                                                        {item.quantity}
                                                    </span>
                                                    {delta !== 0 && (
                                                        <span className={cn(
                                                            "ml-2 font-bold text-xs px-2 py-1",
                                                            delta > 0 ? "bg-emerald-400 text-brand-black" : "bg-rose-400 text-brand-black"
                                                        )}>
                                                            {delta > 0 ? `+${delta}` : delta}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Euro className="w-3 h-3 text-brand-black" />
                                                        <span className="font-bold text-sm">{item.price.toFixed(2)}</span>
                                                    </div>
                                                </td>
                                                {isVolunteerMode && (
                                                    <td className="p-3">
                                                        {item.id > 0 ? (
                                                            <div className="flex gap-2 justify-center">
                                                                <button
                                                                    onClick={() => addAdjustment(item, 1)}
                                                                    className="p-1 px-2 border border-brand-black bg-emerald-400 hover:brightness-95 transition-all shadow-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                                                    title="Add 1 to stock"
                                                                >
                                                                    <Plus size={14} className="text-brand-black" />
                                                                </button>
                                                                <button
                                                                    onClick={() => addAdjustment(item, -1)}
                                                                    className="p-1 px-2 border border-brand-black bg-rose-400 hover:brightness-95 transition-all shadow-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                                                    title="Remove 1 from stock"
                                                                >
                                                                    <Minus size={14} className="text-brand-black" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/30 block text-center">NO STOCK</span>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                {filteredItems.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={isVolunteerMode ? 5 : 4} className="p-16 text-center bg-brand-beige-dark">
                                            <p className="text-sm font-black tracking-widest uppercase opacity-40">NO ITEMS FOUND</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination - Fixed at bottom of table */}
                    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-brand-black bg-brand-beige-dark">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <label className="hidden sm:inline text-[10px] font-black tracking-widest uppercase">ROWS:</label>
                            <select value={rowsPerPage} onChange={handleChangeRowsPerPage} className="brutalist-input px-3 py-1 text-xs font-bold border border-brand-black bg-brand-beige">
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-6">
                            <span className="text-[11px] sm:text-xs font-bold uppercase whitespace-nowrap">
                                {filteredItems.length > 0 ? `${page * rowsPerPage + 1}–${Math.min((page + 1) * rowsPerPage, filteredItems.length)} / ${filteredItems.length}` : '0 ITEMS'}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => handleChangePage(null, page - 1)} disabled={page === 0} className={cn("brutalist-button px-4 py-2 text-xs", page === 0 && "opacity-30 cursor-not-allowed")}>PREV</button>
                                <button onClick={() => handleChangePage(null, page + 1)} disabled={page >= Math.ceil(filteredItems.length / rowsPerPage) - 1} className={cn("brutalist-button px-4 py-2 text-xs", page >= Math.ceil(filteredItems.length / rowsPerPage) - 1 && "opacity-30 cursor-not-allowed")}>NEXT</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile / tablet: compact pending-changes bar (sidebar is lg-only) */}
                {isVolunteerMode && adjustments.length > 0 && (
                    <div className="lg:hidden flex-shrink-0 mt-4 border border-brand-black bg-brand-beige p-3 flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70 whitespace-nowrap">
                            {adjustments.length} PENDING
                        </span>
                        <button
                            onClick={clearAdjustments}
                            className="brutalist-button px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                        >
                            CLEAR
                        </button>
                        <button
                            disabled={isCommitting}
                            onClick={() => setIsConfirmOpen(true)}
                            className={cn(
                                "brutalist-button flex-1 py-2 bg-emerald-400 text-brand-black text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2 tracking-widest",
                                isCommitting ? "opacity-75 cursor-not-allowed" : "hover:brightness-95"
                            )}
                        >
                            {isCommitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> SAVING...</>
                            ) : (
                                <><CheckCircle size={16} /> CONFIRM</>
                            )}
                        </button>
                    </div>
                )}
            </main>

            {/* Right Sidebar: Pending Adjustments (volunteer mode, large screens only) */}
            {isVolunteerMode && (
                <aside className="hidden lg:flex lg:w-80 xl:w-96 flex-shrink-0 border-l border-brand-black bg-brand-beige flex-col">
                    <div className="p-2 border-b border-brand-black bg-brand-beige shrink-0">
                        <h2 className="text-brand-black uppercase tracking-widest text-xs font-black flex items-center justify-center gap-2">
                            <RefreshCw size={14} /> PENDING CHANGES
                        </h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60 mt-1">{adjustments.length} ITEM(S) MODIFIED</p>
                    </div>

                    <div className="flex-1 overflow-auto bg-brand-beige p-4 space-y-3">
                        <AnimatePresence mode="popLayout">
                            {adjustments.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30 text-brand-black"
                                >
                                    <Box size={40} className="mb-3" />
                                    <p className="font-black text-xs uppercase tracking-widest">NO PENDING CHANGES</p>
                                    <p className="text-[10px] mt-2 font-bold uppercase">USE +/- BUTTONS TO QUEUE ADJUSTMENTS</p>
                                </motion.div>
                            ) : (
                                adjustments.map(adj => (
                                    <motion.div
                                        key={adj.item.id}
                                        layout
                                        initial={{ x: 20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: -20, opacity: 0 }}
                                        className="border border-brand-black bg-brand-beige p-2 flex items-center gap-2"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-[11px] uppercase truncate">{adj.item.name}</div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60">
                                                {adj.item.quantity} → {adj.item.quantity + adj.delta}
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "font-black text-xs px-2 py-1 border border-brand-black",
                                            adj.delta > 0 ? "bg-emerald-400 text-brand-black" : "bg-rose-400 text-brand-black"
                                        )}>
                                            {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                                        </span>
                                        <button onClick={() => removeAdjustment(adj.item.id)} className="text-brand-black/50 hover:text-red-600 p-1 transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="p-4 border-t border-brand-black bg-brand-beige space-y-3">
                        {adjustments.length > 0 && (
                            <button onClick={clearAdjustments} className="brutalist-button w-full py-2 text-[10px] font-black uppercase border-dashed">
                                CLEAR ALL
                            </button>
                        )}
                        <button
                            disabled={adjustments.length === 0 || isCommitting}
                            onClick={() => setIsConfirmOpen(true)}
                            className={cn(
                                "brutalist-button w-full py-3 bg-emerald-400 text-brand-black text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2 tracking-widest",
                                isCommitting ? "opacity-75 cursor-not-allowed hover:bg-emerald-400" : "hover:brightness-95"
                            )}
                        >
                            {isCommitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> SAVING...</>
                            ) : (
                                <><CheckCircle size={16} /> CONFIRM</>
                            )}
                        </button>
                    </div>
                </aside>
            )}

            <StockConfirmationModal
                open={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleCommit}
                isCommitting={isCommitting}
                adjustments={adjustments.map(adj => ({
                    id: adj.item.id,
                    name: adj.item.name,
                    delta: adj.delta,
                    currentQty: adj.item.quantity
                }))}
            />
        </div>
    );
}
