import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw, Box, Loader2, Plus, Minus, Trash2, CheckCircle, Tag, MapPin, SlidersHorizontal, ScanBarcode, ShoppingBag } from 'lucide-react';
import ImageDisplay from './ImageDisplay';
import { cn, displayName } from './lib/utils';
import { handleAddItem, handleRemoveItem, handleSend } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import { useStock } from './StockContext';
import StockConfirmationModal from './components/StockConfirmationModal';
import Sheet from './components/Sheet';

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
                <span className="inline-flex items-center gap-1 border border-lijn bg-brand-beige-dark px-1.5 py-0.5 text-[9px] font-semibold text-brand-black/70 max-w-[160px]">
                    <Tag size={10} className="flex-shrink-0" />
                    <span className="truncate">{category}</span>
                </span>
            )}
            {location && (
                <span className="inline-flex items-center gap-1 border border-lijn bg-brand-beige-dark px-1.5 py-0.5 text-[9px] font-semibold text-brand-black/70 max-w-[200px]">
                    <MapPin size={10} className="flex-shrink-0" />
                    <span className="truncate">{location}</span>
                </span>
            )}
        </div>
    );
}

/** The stock list; for volunteers also the place to restock, count and order. */
export default function ItemList({ lowStockIds = [], onOrder }: {
    /** Parts at or under their minimum: they get an Order button. */
    lowStockIds?: number[];
    /** Open purchase orders prefilled with these parts. */
    onOrder?: (partIds: number[]) => void;
} = {}) {
    const { items, loading, error, refreshInventory, lastFetched } = useStock();
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(100);
    const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
    const [isCommitting, setIsCommitting] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    // Phone only: the filter sheet, the item whose stock is being changed, and
    // the list of pending changes.
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [pendingOpen, setPendingOpen] = useState(false);

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

    // Typed count: stored as the difference with the stock now, so it saves like +/-.
    const setCount = (item: Item, count: number) => {
        const delta = count - item.quantity;
        setAdjustments(prev => delta === 0
            ? prev.filter(a => a.item.id !== item.id)
            : prev.some(a => a.item.id === item.id)
                ? prev.map(a => a.item.id === item.id ? { ...a, delta } : a)
                : [...prev, { item, delta }]);
    };

    // Scan (handheld scanner types the code + Enter) = +1 to stock, pending like the + button.
    const [scanCode, setScanCode] = useState('');
    const [scanning, setScanning] = useState(false);
    const scanToStock = async () => {
        const code = scanCode.trim();
        if (!code) return;
        setScanning(true);
        try {
            const found = await handleSend(code);
            const item = found && items.find(i => i.id === found.id);
            if (item) addAdjustment(item, 1);
            else addToast(`No item found for: ${code}`, 'warning');
        } finally {
            setScanCode('');
            setScanning(false);
        }
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
                    success = await handleRemoveItem(adj.item.id, Math.abs(adj.delta), adj.item.name, totalPrice, 'inventory-overview');
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

    // Say out loud how old these numbers are. Silently showing a stale list is
    // worse than showing nothing, because it looks correct.
    const freshness = lastFetched === null ? null : (() => {
        const mins = Math.floor((Date.now() - lastFetched) / 60000);
        const label = mins < 1 ? 'just now' : mins < 60
            ? `${mins} min ago`
            : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
        return { stale: mins >= 5, label };
    })();
    const editing = editingId === null ? null : items.find(i => i.id === editingId) ?? null;

    const categorySelect = (
        <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-base md:text-sm cursor-pointer"
        >
            <option value="">All categories</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
    );
    const locationSelect = (
        <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-base md:text-sm cursor-pointer"
        >
            <option value="">All locations</option>
            {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
    );

    if (loading && items.length === 0) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-black" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-brand-beige">
            {/* Main Table Area */}
            {/* On a phone main is the one scroll area; from md up the table scrolls inside it. */}
            <main className="flex-1 flex flex-col min-h-0 md:p-4 overflow-y-auto md:overflow-hidden">
                {/* Phone: search, filters and refresh in one bar that stays on top */}
                <div className="md:hidden sticky top-0 z-10 bg-brand-beige border-b border-lijn px-3 py-2 space-y-1.5">
                    <div className="flex gap-2">
                        <div className="flex items-center flex-1 min-w-0 px-3 h-11 border border-lijn bg-brand-beige">
                            <Search className="w-5 h-5 text-brand-black/60 mr-2 shrink-0" />
                            <input
                                type="search"
                                placeholder="Search items"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1 min-w-0 bg-transparent outline-none text-base"
                            />
                        </div>
                        <button
                            onClick={() => setFiltersOpen(true)}
                            className={cn('relative w-11 h-11 shrink-0 flex items-center justify-center border border-lijn', hasActiveFilters && 'bg-brand-black text-white')}
                            aria-label="Filters"
                        >
                            <SlidersHorizontal size={18} />
                        </button>
                        <button
                            onClick={async () => { await refreshInventory(); addToast('Stock list refreshed', 'success'); }}
                            disabled={loading}
                            className="w-11 h-11 shrink-0 flex items-center justify-center border border-lijn disabled:opacity-50"
                            aria-label="Refresh"
                        >
                            <RefreshCw size={18} className={cn(loading && 'animate-spin')} />
                        </button>
                    </div>
                    <p className={cn('text-xs', freshness?.stale ? 'text-amber-700 font-semibold' : 'text-grafiet')}>
                        {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                        {hasActiveFilters && ' (filtered)'}
                        {freshness?.stale && ` · possibly out of date, updated ${freshness.label}`}
                    </p>
                </div>

                <Sheet
                    open={filtersOpen}
                    onClose={() => setFiltersOpen(false)}
                    title="Filters"
                    footer={
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setCategoryFilter(''); setLocationFilter(''); }}
                                disabled={!hasActiveFilters}
                                className="brutalist-button flex-1 h-12"
                            >
                                Clear
                            </button>
                            <button onClick={() => setFiltersOpen(false)} className="brutalist-button btn-primary flex-1 h-12">
                                Show {filteredItems.length}
                            </button>
                        </div>
                    }
                >
                    <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 border border-lijn px-3 h-12">
                            <Tag size={16} className="text-brand-black/60 shrink-0" />
                            {categorySelect}
                        </div>
                        <div className="flex items-center gap-2 border border-lijn px-3 h-12">
                            <MapPin size={16} className="text-brand-black/60 shrink-0" />
                            {locationSelect}
                        </div>
                    </div>
                </Sheet>

                {/* Toolbar (md and up): everything in one row, so the table gets the height */}
                <div className="hidden md:flex flex-shrink-0 flex-wrap items-center gap-2 mb-3">
                    <h2 className="flex items-center gap-2 text-base font-semibold mr-2">
                        <Box className="w-4 h-4 text-blue-600" aria-hidden /> Stock list
                    </h2>
                    <div className="flex items-center gap-2 border border-lijn bg-white px-2.5 h-9 w-56">
                        <Search className="w-4 h-4 text-brand-black/50 shrink-0" aria-hidden />
                        <input
                            type="search"
                            placeholder="Search items"
                            aria-label="Search items"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 border border-lijn bg-white px-2.5 h-9 w-44">
                        <Tag size={14} className="text-brand-black/50 shrink-0" aria-hidden />
                        {categorySelect}
                    </div>
                    <div className="flex items-center gap-1.5 border border-lijn bg-white px-2.5 h-9 w-44">
                        <MapPin size={14} className="text-brand-black/50 shrink-0" aria-hidden />
                        {locationSelect}
                    </div>
                    {hasActiveFilters && (
                        <button onClick={() => { setCategoryFilter(''); setLocationFilter(''); }} className="text-xs font-semibold underline underline-offset-2 px-1">
                            Clear
                        </button>
                    )}
                    <span className="text-xs text-grafiet tabular-nums">
                        {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                    </span>
                    {freshness?.stale && (
                        <span className="text-xs font-semibold text-amber-700">Updated {freshness.label}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        {isVolunteerMode && (
                            <form
                                onSubmit={e => { e.preventDefault(); void scanToStock(); }}
                                className="flex items-center gap-2 border border-lijn bg-white px-2.5 h-9 w-52"
                                title="Scan or type a barcode: +1 to stock (pending)"
                            >
                                <ScanBarcode className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />
                                <input
                                    value={scanCode}
                                    onChange={e => setScanCode(e.target.value)}
                                    placeholder="Scan to restock"
                                    aria-label="Scan a barcode to add 1 to stock"
                                    disabled={scanning}
                                    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                                />
                            </form>
                        )}
                        {isVolunteerMode && onOrder && lowStockIds.length > 0 && (
                            <button
                                onClick={() => onOrder(lowStockIds)}
                                className="brutalist-button h-9 px-3 text-xs font-semibold flex items-center gap-1.5 bg-white"
                                title="Make purchase orders for every item that is low"
                            >
                                <ShoppingBag size={14} aria-hidden /> Order all low ({lowStockIds.length})
                            </button>
                        )}
                        <button
                            onClick={async () => { await refreshInventory(); addToast('Stock list refreshed', 'success'); }}
                            disabled={loading}
                            title="Refresh"
                            aria-label="Refresh"
                            className="w-9 h-9 shrink-0 border border-lijn bg-white hover:bg-brand-beige flex items-center justify-center disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="flex-shrink-0 border border-lijn bg-brand-beige p-3 m-3 md:m-0 md:mb-3">
                        <p className="text-sm font-bold text-red-600">{error}</p>
                    </div>
                )}

                {/* Table Container - Fills remaining space and scrolls */}
                <div className="md:flex-1 md:min-h-0 flex flex-col md:border border-lijn bg-white">
                    {/* Scrollable list wrapper (md and up; on a phone main scrolls) */}
                    <div className="md:flex-1 md:overflow-auto">
                        {/* ── Phone: rows; a volunteer taps one to change its stock ── */}
                        <ul className="md:hidden divide-y divide-lijn-zacht border-b border-lijn bg-brand-beige">
                            {pagedItems.map((item) => {
                                const delta = getAdjustmentDelta(item.id);
                                return (
                                    <li
                                        key={item.id}
                                        onClick={isVolunteerMode && item.id > 0 ? () => setEditingId(item.id) : undefined}
                                        className={cn(
                                            "grid grid-cols-[36px_1fr_auto] gap-3 items-center px-3 py-2",
                                            isVolunteerMode && item.id > 0 && "cursor-pointer active:bg-brand-beige-dark",
                                            delta > 0 && "bg-emerald-50",
                                            delta < 0 && "bg-rose-50",
                                        )}
                                    >
                                        <div className="border border-lijn bg-white w-9 h-9 overflow-hidden">
                                            <ImageDisplay imagePath={item.image} alt={item.name} width={36} height={36} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm leading-tight truncate">{displayName(item.name)}</p>
                                            <p className="text-xs text-grafiet truncate">
                                                €{item.price.toFixed(2)}
                                                {[item.category !== 'Uncategorized' && item.category, item.location].filter(Boolean).map(t => ` · ${t}`).join('')}
                                            </p>
                                        </div>
                                        <div className="text-right tabular-nums">
                                            <div className={cn("font-semibold text-base leading-none", item.quantity === 0 && "text-rose-600")}>
                                                {item.quantity}
                                            </div>
                                            {(delta !== 0 || item.quantity === 0) && (
                                                <div className={cn("text-[11px] font-semibold mt-0.5", delta > 0 ? "text-emerald-700" : "text-rose-600")}>
                                                    {delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : 'Sold out'}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                            {filteredItems.length === 0 && !loading && (
                                <li className="p-16 text-center bg-brand-beige-dark">
                                    <p className="text-sm font-semibold opacity-40">No items found</p>
                                </li>
                            )}
                        </ul>

                        {/* ── Desktop: dense table ── */}
                        <table className="hidden md:table w-full min-w-[640px] border-collapse text-sm">
                            <thead className="sticky top-0 z-10 bg-brand-beige-dark">
                                <tr className="border-b border-lijn text-left text-xs font-semibold text-brand-black/70">
                                    <th className="py-2 pl-3 w-[48px]" />
                                    <th className="py-2 px-2">Item</th>
                                    <th className="py-2 px-2 hidden lg:table-cell">Category</th>
                                    <th className="py-2 px-2 hidden lg:table-cell">Location</th>
                                    <th className="py-2 px-2 text-right w-[96px]">Stock</th>
                                    {/* What the lab paid is for volunteers, not visitors. */}
                                    {isVolunteerMode && <th className="py-2 px-2 text-right w-[80px]">Cost</th>}
                                    <th className="py-2 px-2 text-right w-[80px]">Price</th>
                                    {isVolunteerMode && <th className="py-2 pr-3 w-[140px]" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-lijn-zacht">
                                {pagedItems.map((item) => {
                                    const delta = getAdjustmentDelta(item.id);
                                    const low = lowStockIds.includes(item.id);
                                    return (
                                        <tr key={item.id} className={cn(
                                            "hover:bg-brand-beige/60",
                                            delta > 0 && "bg-emerald-50",
                                            delta < 0 && "bg-rose-50",
                                        )}>
                                            <td className="py-1 pl-3">
                                                <div className="border border-lijn bg-white w-8 h-8 overflow-hidden">
                                                    <ImageDisplay imagePath={item.image} alt={item.name} width={32} height={32} />
                                                </div>
                                            </td>
                                            <td className="py-1 px-2 font-semibold max-w-0 w-full">
                                                <span className="block truncate" title={item.name}>{displayName(item.name)}</span>
                                            </td>
                                            <td className="py-1 px-2 text-xs text-grafiet whitespace-nowrap hidden lg:table-cell">
                                                {item.category !== 'Uncategorized' ? item.category : '–'}
                                            </td>
                                            <td className="py-1 px-2 text-xs text-grafiet whitespace-nowrap hidden lg:table-cell">{item.location ?? '–'}</td>
                                            <td className="py-1 px-2 text-right tabular-nums whitespace-nowrap">
                                                {isVolunteerMode && item.id > 0 ? (
                                                    // Counted the shelf? Type the real number: pending like +/-.
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={item.quantity + delta}
                                                        onChange={e => e.target.value !== '' && setCount(item, Math.max(0, Math.round(Number(e.target.value))))}
                                                        onFocus={e => e.target.select()}
                                                        aria-label={`Stock of ${item.name}`}
                                                        title="Type the counted number"
                                                        className={cn(
                                                            "w-16 h-7 px-1.5 text-right font-semibold border bg-white tabular-nums",
                                                            delta === 0 ? "border-lijn-zacht" : delta > 0 ? "border-emerald-600" : "border-rose-500",
                                                            item.quantity + delta === 0 && "text-rose-600",
                                                        )}
                                                    />
                                                ) : (
                                                    <span className={cn("font-semibold", item.quantity === 0 && "text-rose-600")}>
                                                        {item.quantity === 0 && !isVolunteerMode ? 'Sold out' : item.quantity}
                                                    </span>
                                                )}
                                            </td>
                                            {isVolunteerMode && (
                                                <td className="py-1 px-2 text-right tabular-nums text-brand-black/55"
                                                    title={item.cost > 0 && item.price > 0 ? `Margin ${(item.price - item.cost).toFixed(2)} per unit` : item.cost > 0 ? undefined : 'No supplier price on this part'}>
                                                    {item.cost > 0 ? `€${item.cost.toFixed(2)}` : '–'}
                                                </td>
                                            )}
                                            <td className="py-1 px-2 text-right tabular-nums font-semibold">€{item.price.toFixed(2)}</td>
                                            {isVolunteerMode && (
                                                <td className="py-1 pr-3">
                                                    {item.id > 0 ? (
                                                        <div className="flex items-center justify-end gap-1">
                                                            {low && onOrder && (
                                                                <button
                                                                    onClick={() => onOrder([item.id])}
                                                                    className="h-7 px-2 text-xs font-semibold border border-amber-500 bg-amber-50 text-amber-800 flex items-center gap-1"
                                                                    title="Low stock: make a purchase order"
                                                                >
                                                                    <ShoppingBag size={12} aria-hidden /> Order
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => addAdjustment(item, -1)}
                                                                className="w-7 h-7 flex items-center justify-center border border-lijn bg-white hover:bg-rose-100"
                                                                aria-label={`Remove 1 ${item.name} from stock`}
                                                            >
                                                                <Minus size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => addAdjustment(item, 1)}
                                                                className="w-7 h-7 flex items-center justify-center border border-lijn bg-white hover:bg-emerald-100"
                                                                aria-label={`Add 1 ${item.name} to stock`}
                                                            >
                                                                <Plus size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-brand-black/30 block text-right">No stock</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                                {filteredItems.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={isVolunteerMode ? 8 : 6} className="p-16 text-center bg-brand-beige-dark">
                                            <p className="text-sm font-semibold opacity-40">No items found</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination - Fixed at bottom of table */}
                    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 md:border-t border-lijn bg-brand-beige-dark">
                        <select value={rowsPerPage} onChange={handleChangeRowsPerPage} aria-label="Rows per page" className="px-2 h-11 md:h-8 text-base md:text-xs font-semibold border border-lijn bg-white">
                            <option value={25}>25 rows</option>
                            <option value={50}>50 rows</option>
                            <option value={100}>100 rows</option>
                            <option value={250}>250 rows</option>
                        </select>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                                {filteredItems.length > 0 ? `${page * rowsPerPage + 1}–${Math.min((page + 1) * rowsPerPage, filteredItems.length)} / ${filteredItems.length}` : '0 items'}
                            </span>
                            <button onClick={() => handleChangePage(null, page - 1)} disabled={page === 0} className="brutalist-button px-3 h-11 md:h-8 text-xs disabled:opacity-30">Prev</button>
                            <button onClick={() => handleChangePage(null, page + 1)} disabled={page >= Math.ceil(filteredItems.length / rowsPerPage) - 1} className="brutalist-button px-3 h-11 md:h-8 text-xs disabled:opacity-30">Next</button>
                        </div>
                    </div>
                </div>

                {/* Pending changes: a bar only while there are some */}
                {isVolunteerMode && adjustments.length > 0 && (
                    <div className="sticky bottom-0 z-10 flex-shrink-0 md:mt-3 border-t md:border border-lijn bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setPendingOpen(true)}
                            className="text-sm font-semibold underline underline-offset-2 whitespace-nowrap h-11 md:h-8"
                        >
                            {adjustments.length} pending {adjustments.length === 1 ? 'change' : 'changes'}
                        </button>
                        <span className="hidden md:inline text-xs text-grafiet">Deliveries? Receive the purchase order instead.</span>
                        <div className="ml-auto flex items-center gap-2 flex-1 md:flex-none">
                            <button onClick={clearAdjustments} className="brutalist-button px-3 h-11 md:h-8 text-xs font-semibold bg-white">
                                Undo all
                            </button>
                            <button
                                disabled={isCommitting}
                                onClick={() => setIsConfirmOpen(true)}
                                className="brutalist-button flex-1 md:flex-none px-4 h-11 md:h-8 bg-emerald-400 text-brand-black text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-95"
                            >
                                {isCommitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Confirm</>}
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Phone: change one item's stock */}
            <Sheet
                open={editing !== null}
                onClose={() => setEditingId(null)}
                title="Change stock"
                footer={<button onClick={() => setEditingId(null)} className="brutalist-button btn-primary w-full h-12">Done</button>}
            >
                {editing && (() => {
                    const delta = getAdjustmentDelta(editing.id);
                    return (
                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="border border-lijn bg-white w-16 h-16 overflow-hidden shrink-0">
                                    <ImageDisplay imagePath={editing.image} alt={editing.name} width={64} height={64} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-base break-words">{editing.name}</p>
                                    <MetaTags category={editing.category} location={editing.location} className="mt-1" />
                                </div>
                            </div>
                            <div className="flex items-stretch border border-lijn">
                                <button
                                    onClick={() => addAdjustment(editing, -1)}
                                    className="w-20 h-16 flex items-center justify-center bg-rose-400"
                                    aria-label="Remove 1 from stock"
                                >
                                    <Minus size={24} />
                                </button>
                                <div className="flex-1 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-semibold tabular-nums">
                                        {editing.quantity}{delta !== 0 && <> → {editing.quantity + delta}</>}
                                    </span>
                                    <span className="text-xs text-grafiet">
                                        {delta === 0 ? 'in stock' : delta > 0 ? `+${delta}, not saved yet` : `${delta}, not saved yet`}
                                    </span>
                                </div>
                                <button
                                    onClick={() => addAdjustment(editing, 1)}
                                    className="w-20 h-16 flex items-center justify-center bg-emerald-400"
                                    aria-label="Add 1 to stock"
                                >
                                    <Plus size={24} />
                                </button>
                            </div>
                            <p className="text-xs text-grafiet">Changes are saved together with Confirm at the bottom of the list.</p>
                        </div>
                    );
                })()}
            </Sheet>

            {/* Phone: the pending changes */}
            <Sheet open={pendingOpen && adjustments.length > 0} onClose={() => setPendingOpen(false)} title="Pending changes">
                <ul className="divide-y divide-lijn-zacht">
                    {adjustments.map(adj => (
                        <li key={adj.item.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm break-words">{adj.item.name}</div>
                                <div className="text-xs text-grafiet">{adj.item.quantity} → {adj.item.quantity + adj.delta}</div>
                            </div>
                            <span className={cn('font-semibold text-sm px-2 py-1', adj.delta > 0 ? 'bg-emerald-400' : 'bg-rose-400')}>
                                {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                            </span>
                            <button onClick={() => removeAdjustment(adj.item.id)} className="w-11 h-11 flex items-center justify-center text-brand-black/60" aria-label="Undo">
                                <Trash2 size={18} />
                            </button>
                        </li>
                    ))}
                </ul>
            </Sheet>

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
