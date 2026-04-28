import { useState, useMemo } from 'react';
import { Search, RefreshCw, Box, Euro, Loader2, Plus, Minus, Trash2, CheckCircle } from 'lucide-react';
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

export default function ItemList() {
    const { items, loading, error, refreshInventory } = useStock();
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
    const [isCommitting, setIsCommitting] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();

    const filteredItems = useMemo(() => {
        return items.filter(item =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [items, searchQuery]);

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
                if (adj.delta > 0) {
                    success = await handleAddItem(adj.item.id, adj.delta);
                } else if (adj.delta < 0) {
                    success = await handleTakeItem(adj.item.id, Math.abs(adj.delta));
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
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-white">
            {/* Main Table Area */}
            <main className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 overflow-hidden">
                {/* Header - Fixed at top */}
                <div className="flex-shrink-0 flex flex-col md:flex-row justify-between items-stretch md:items-center mb-4 gap-4 border-2 border-brand-black bg-white p-4">
                    <div className="flex items-center gap-3">
                        <Box className="w-6 h-6 text-brand-black" />
                        <h2 className="text-lg font-black tracking-widest uppercase">STOCK LIST</h2>
                    </div>
                    <div className="flex gap-4 items-center flex-grow max-w-full md:max-w-[500px]">
                        <div className="brutalist-input flex items-center flex-1 px-4 py-2 border-2 border-brand-black bg-gray-50">
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
                            onClick={() => refreshInventory()}
                            disabled={loading}
                            title="Refresh List"
                            className={cn("brutalist-button p-3", loading && "opacity-50 cursor-not-allowed")}
                        >
                            <RefreshCw className={cn("w-5 h-5 text-brand-black", loading && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="flex-shrink-0 border-2 border-brand-black bg-white p-4 mb-4">
                        <p className="text-sm font-bold text-red-600 uppercase">{error}</p>
                    </div>
                )}

                {/* Table Container - Fills remaining space and scrolls */}
                <div className="flex-1 min-h-0 flex flex-col border-2 border-brand-black bg-white">
                    {/* Scrollable table wrapper */}
                    <div className="flex-1 overflow-auto">
                        <table className="w-full min-w-[600px] border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b-2 border-brand-black bg-gray-100">
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
                                {filteredItems
                                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                    .map((item) => {
                                        const delta = getAdjustmentDelta(item.id);
                                        return (
                                            <tr key={item.id} className={cn(
                                                "hover:bg-gray-50 transition-colors",
                                                delta !== 0 && "bg-emerald-50",
                                                item.quantity === 0 && "bg-rose-50/50"
                                            )}>
                                                <td className="p-2 pl-6">
                                                    <div className="border-2 border-brand-black bg-white w-10 h-10">
                                                        <ImageDisplay imagePath={item.image} alt={item.name} width={40} height={40} sx={{ border: 'none', bgcolor: 'transparent', borderRadius: 0 }} />
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <p className="font-bold text-sm tracking-tight uppercase">{item.name}</p>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <span className={cn(
                                                        "font-black text-sm",
                                                        item.quantity === 0 && "text-rose-600"
                                                    )}>
                                                        {item.quantity}
                                                    </span>
                                                    {delta !== 0 && (
                                                        <span className="ml-2 font-bold text-xs bg-brand-accent text-brand-black px-2 py-1">
                                                            ({delta > 0 ? `+${delta}` : delta})
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
                                                        <div className="flex gap-2 justify-center">
                                                            <button
                                                                onClick={() => addAdjustment(item, 1)}
                                                                className="p-1 px-2 border-2 border-brand-black bg-emerald-400 hover:brightness-95 transition-all shadow-[2px_2px_0px_0px_rgba(30,27,24,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                                                title="Add 1 to stock"
                                                            >
                                                                <Plus size={14} className="text-brand-black" />
                                                            </button>
                                                            <button
                                                                onClick={() => addAdjustment(item, -1)}
                                                                className="p-1 px-2 border-2 border-brand-black bg-rose-400 hover:brightness-95 transition-all shadow-[2px_2px_0px_0px_rgba(30,27,24,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                                                title="Remove 1 from stock"
                                                            >
                                                                <Minus size={14} className="text-brand-black" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                {filteredItems.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={isVolunteerMode ? 5 : 4} className="p-16 text-center bg-gray-50">
                                            <p className="text-sm font-black tracking-widest uppercase opacity-40">NO ITEMS FOUND</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination - Fixed at bottom of table */}
                    <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t-2 border-brand-black bg-gray-50">
                        <div className="flex items-center gap-4">
                            <label className="text-[10px] font-black tracking-widest uppercase">ROWS:</label>
                            <select value={rowsPerPage} onChange={handleChangeRowsPerPage} className="brutalist-input px-3 py-1 text-xs font-bold border-2 border-brand-black bg-white">
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-6">
                            <span className="text-xs font-bold uppercase">
                                {filteredItems.length > 0 ? `${page * rowsPerPage + 1}–${Math.min((page + 1) * rowsPerPage, filteredItems.length)} OF ${filteredItems.length}` : '0 ITEMS'}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => handleChangePage(null, page - 1)} disabled={page === 0} className={cn("brutalist-button px-4 py-2 text-xs", page === 0 && "opacity-30 cursor-not-allowed")}>PREV</button>
                                <button onClick={() => handleChangePage(null, page + 1)} disabled={page >= Math.ceil(filteredItems.length / rowsPerPage) - 1} className={cn("brutalist-button px-4 py-2 text-xs", page >= Math.ceil(filteredItems.length / rowsPerPage) - 1 && "opacity-30 cursor-not-allowed")}>NEXT</button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Right Sidebar: Pending Adjustments (only in volunteer mode) */}
            {isVolunteerMode && (
                <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-l-0 lg:border-l-2 border-t-2 lg:border-t-0 border-brand-black bg-white flex flex-col">
                    <div className="px-4 py-4 border-b-2 border-brand-black bg-gray-100">
                        <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-brand-black">
                            <RefreshCw size={14} /> PENDING CHANGES
                        </h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60 mt-1">{adjustments.length} ITEM(S) MODIFIED</p>
                    </div>

                    <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-3">
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
                                        className="border-2 border-brand-black bg-white p-2 flex items-center gap-2"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-[11px] uppercase truncate">{adj.item.name}</div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60">
                                                {adj.item.quantity} → {adj.item.quantity + adj.delta}
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "font-black text-xs px-2 py-1 border-2 border-brand-black",
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

                    <div className="p-4 border-t-2 border-brand-black bg-white space-y-3">
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
