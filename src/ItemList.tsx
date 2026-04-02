import { useState, useEffect, useMemo } from 'react';
import inventreeClient from './api/inventreeClient';
import { Search, RefreshCw, Package, Tag, MapPin, Euro, Loader2 } from 'lucide-react';
import ImageDisplay from './ImageDisplay';
import { cn } from './lib/utils';

interface Item {
    id: number;
    name: string;
    category: string;
    location: string;
    quantity: number;
    price: number;
    image: string | null;
    ipn: string;
    description: string;
}

export default function ItemList() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);

    const fetchItems = async () => {
        setLoading(true);
        setError(null);
        console.log('[ItemList] Fetching all items from direct InvenTree client...');
        try {
            const data = await inventreeClient.getAllStockItems();
            
            // Normalize results - some requests might return a flat array, others a paginated object
            const results = Array.isArray(data) ? data : (data?.results || []);
            
            const mappedItems: Item[] = results.map(item => ({
                id: item.pk,
                name: (item as any).part_detail?.name || 'Unknown Part',
                category: (item as any).part_detail?.category_name || 'Uncategorized',
                location: (item as any).location_detail?.name || (item as any).location_detail?.pathstring || 'No Location',
                quantity: item.quantity,
                price: (item as any).part_detail?.pricing_min || 0,
                image: (item as any).part_detail?.image || null,
                ipn: (item as any).part_detail?.IPN || '',
                description: (item as any).part_detail?.description || '',
            }));

            setItems(mappedItems);
            console.log(`[ItemList] Loaded ${mappedItems.length} items`);
        } catch (err) {
            console.error('[ItemList] Critical error:', err);
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const filteredItems = useMemo(() => {
        return items.filter(item => 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.ipn.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [items, searchQuery]);

    const handleChangePage = (_event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    if (loading && items.length === 0) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-0 sm:p-4 md:p-6 w-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center mb-4 sm:mb-6 gap-4 px-4 sm:px-0">
                <div className="flex items-center gap-3">
                    <Package className="w-6 h-6 sm:w-8 sm:h-8" />
                    <h2 className="text-lg sm:text-xl font-bold uppercase">Inventory List</h2>
                </div>
                <div className="flex gap-2 items-center flex-grow max-w-full md:max-w-[600px]">
                    <div className="brutalist-input flex items-center flex-1 px-3 py-2">
                        <Search className="w-4 h-4 text-gray-500 mr-2" />
                        <input
                            type="text"
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-sm"
                        />
                    </div>
                    <button
                        onClick={fetchItems}
                        disabled={loading}
                        title="Refresh List"
                        className={cn(
                            "brutalist-button p-2",
                            loading && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="brutalist-card bg-yellow-100 border-yellow-500 p-4 mb-6 mx-4 sm:mx-0">
                    <p className="text-sm font-bold text-black">{error}</p>
                </div>
            )}

            {/* Table Container */}
            <div className="brutalist-card overflow-x-auto w-full max-w-full bg-white sm:rounded-none md:rounded">
                <table className="w-full min-w-[650px] border-collapse">
                    <thead className="bg-beige">
                        <tr>
                            <th className="p-3 text-left border-b-3 border-black w-[60px] text-xs font-bold uppercase">Image</th>
                            <th className="p-3 text-left border-b-3 border-black w-[200px] text-xs font-bold uppercase">Name / IPN</th>
                            <th className="p-3 text-left border-b-3 border-black w-[120px] text-xs font-bold uppercase">Category</th>
                            <th className="p-3 text-left border-b-3 border-black w-[120px] text-xs font-bold uppercase">Location</th>
                            <th className="p-3 text-right border-b-3 border-black w-[80px] text-xs font-bold uppercase">Stock</th>
                            <th className="p-3 text-right border-b-3 border-black w-[80px] text-xs font-bold uppercase">Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems
                            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                            .map((item) => (
                                <tr key={item.id} className="hover:bg-beige/30 transition-colors border-b border-gray-200 last:border-0">
                                    <td className="p-3">
                                        <ImageDisplay 
                                            imagePath={item.image} 
                                            alt={item.name} 
                                            width={40} 
                                            height={40} 
                                            sx={{ borderRadius: 1 }}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <p className="font-bold text-sm leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-gray-600 mt-1">{item.ipn}</p>
                                    </td>
                                    <td className="p-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 brutalist-border bg-beige text-xs font-bold max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                            <Tag className="w-3 h-3 flex-shrink-0" />
                                            <span className="overflow-hidden text-ellipsis">{item.category}</span>
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                            <span className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">{item.location}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <span className={cn(
                                            "font-bold text-sm",
                                            item.quantity > 0 ? "text-green-600" : "text-red-600"
                                        )}>
                                            {item.quantity}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-0.5">
                                            <Euro className="w-3 h-3" />
                                            <span className="font-bold text-sm">
                                                {item.price.toFixed(2)}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        {filteredItems.length === 0 && !loading && (
                            <tr>
                                <td colSpan={6} className="p-10 text-center">
                                    <p className="text-sm text-gray-600">No items found matching your search.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t-3 border-black bg-beige">
                    <div className="flex items-center gap-4">
                        <label className="text-xs font-bold">Rows per page:</label>
                        <select
                            value={rowsPerPage}
                            onChange={handleChangeRowsPerPage}
                            className="brutalist-input px-2 py-1 text-xs"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold">
                            {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, filteredItems.length)} of {filteredItems.length}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleChangePage(null, page - 1)}
                                disabled={page === 0}
                                className={cn(
                                    "brutalist-button px-3 py-1 text-xs",
                                    page === 0 && "opacity-30 cursor-not-allowed"
                                )}
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => handleChangePage(null, page + 1)}
                                disabled={page >= Math.ceil(filteredItems.length / rowsPerPage) - 1}
                                className={cn(
                                    "brutalist-button px-3 py-1 text-xs",
                                    page >= Math.ceil(filteredItems.length / rowsPerPage) - 1 && "opacity-30 cursor-not-allowed"
                                )}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
