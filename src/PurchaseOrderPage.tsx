import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Plus, Loader2, CheckCircle, XCircle, Package } from 'lucide-react';
import inventreeClient from './api/inventreeClient';
import { useStock } from './StockContext';
import type { SelectOption } from './AddPartForm';
import { cn } from './lib/utils';


interface OrderLine {
    supplierPartPk: number;
    partPk: number;
    partName: string;
    currentStock: number;
    SKU: string;
    packQuantity: number;
    packs: string;
}

interface ExistingPO {
    pk: number;
    reference: string;
    status: number;
    status_text: string;
    supplier_detail: { name: string };
    description: string;
    creation_date: string;
}

interface PurchaseOrderPageProps {
    suppliers: SelectOption[];
}

const STATUS_COLORS: Record<number, string> = {
    10: 'bg-brand-beige-dark text-brand-black',   // Pending
    20: 'bg-blue-100 text-blue-800',               // Placed/Issued
    30: 'bg-amber-100 text-amber-800',             // On hold
    40: 'bg-emerald-100 text-emerald-700',         // Complete
    50: 'bg-red-100 text-red-700',                 // Cancelled
};

export default function PurchaseOrderPage({ suppliers }: PurchaseOrderPageProps) {
    const { items: stockItems } = useStock();

    // Create order state
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [loadingParts, setLoadingParts] = useState(false);
    const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
    const [reference, setReference] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Existing orders state
    const [existingOrders, setExistingOrders] = useState<ExistingPO[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [issuingPk, setIssuingPk] = useState<number | null>(null);
    const [cancellingPk, setCancellingPk] = useState<number | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);

    const loadOrders = useCallback(async () => {
        setLoadingOrders(true);
        try {
            const orders = await inventreeClient.getPurchaseOrders();
            setExistingOrders(orders.filter(o => o.status !== 50)); // hide cancelled
        } finally {
            setLoadingOrders(false);
        }
    }, []);

    useEffect(() => { loadOrders(); }, [loadOrders]);

    useEffect(() => {
        if (!selectedSupplier) {
            setOrderLines([]);
            return;
        }
        const load = async () => {
            setLoadingParts(true);
            try {
                const parts = await inventreeClient.getSupplierPartsForSupplier(parseInt(selectedSupplier));
                // Build order lines with current stock info
                const lines: OrderLine[] = parts.map(sp => {
                    const stockItem = stockItems.find(i => i.part_id === sp.part);
                    return {
                        supplierPartPk: sp.pk,
                        partPk: sp.part,
                        partName: stockItem?.name ?? `Part #${sp.part}`,
                        currentStock: stockItem?.quantity ?? 0,
                        SKU: sp.SKU,
                        packQuantity: parseFloat(sp.pack_quantity) || 1,
                        packs: '',
                    };
                });
                setOrderLines(lines);
            } finally {
                setLoadingParts(false);
            }
        };
        load();
    }, [selectedSupplier, stockItems]);

    const updatePacks = (partPk: number, value: string) => {
        setOrderLines(prev => prev.map(l => l.partPk === partPk ? { ...l, packs: value } : l));
    };

    const handleSubmit = async () => {
        const linesToOrder = orderLines.filter(l => parseFloat(l.packs) > 0);
        if (linesToOrder.length === 0) return;

        setSubmitting(true);
        setSubmitError(null);
        setSubmitSuccess(null);

        try {
            const supplierName = suppliers.find(s => String(s.id) === selectedSupplier)?.name ?? 'Supplier';
            const ref = reference.trim() || `PO-${Date.now().toString().slice(-5)}`;

            const po = await inventreeClient.createPurchaseOrder({
                supplier: parseInt(selectedSupplier),
                reference: ref,
                description: `Order for ${supplierName}`,
            });

            for (const line of linesToOrder) {
                const qty = parseFloat(line.packs) * line.packQuantity;
                await inventreeClient.addPurchaseOrderLine({
                    order: po.pk,
                    part: line.supplierPartPk,
                    quantity: qty,
                });
            }

            setSubmitSuccess(`Purchase order ${po.reference} created with ${linesToOrder.length} item(s).`);
            setOrderLines(prev => prev.map(l => ({ ...l, packs: '' })));
            setReference('');
            setShowCreateForm(false);
            loadOrders();
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to create order');
        } finally {
            setSubmitting(false);
        }
    };

    const handleIssue = async (poPk: number) => {
        setIssuingPk(poPk);
        try {
            await inventreeClient.issuePurchaseOrder(poPk);
            loadOrders();
        } finally {
            setIssuingPk(null);
        }
    };

    const handleCancel = async (poPk: number) => {
        setCancellingPk(poPk);
        try {
            await inventreeClient.cancelPurchaseOrder(poPk);
            loadOrders();
        } finally {
            setCancellingPk(null);
        }
    };

    const linesWithQty = orderLines.filter(l => parseFloat(l.packs) > 0);

    return (
        <div className="flex-1 overflow-auto bg-brand-beige p-4 sm:p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShoppingBag size={20} className="text-brand-black" />
                    <h1 className="text-lg font-black uppercase tracking-widest">PURCHASE ORDERS</h1>
                </div>
                <button
                    onClick={() => { setShowCreateForm(v => !v); setSubmitSuccess(null); setSubmitError(null); }}
                    className="brutalist-button px-4 py-2 text-xs bg-amber-300 text-brand-black flex items-center gap-2"
                >
                    <Plus size={14} />
                    NEW ORDER
                </button>
            </div>

            {/* Success banner */}
            {submitSuccess && (
                <div className="flex items-center gap-3 border border-emerald-600 bg-emerald-50 p-3">
                    <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700">{submitSuccess}</p>
                </div>
            )}

            {/* Create form */}
            {showCreateForm && (
                <div className="border border-brand-black bg-white">
                    <div className="flex items-center justify-between p-4 border-b border-brand-black bg-brand-black">
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">CREATE NEW ORDER</h2>
                        <button onClick={() => setShowCreateForm(false)} className="text-white/60 hover:text-white text-xs font-black uppercase tracking-widest">CLOSE</button>
                    </div>

                    <div className="p-4 sm:p-6 space-y-5">
                        {/* Supplier + reference row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-brand-black/70 mb-1.5">
                                    Supplier <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedSupplier}
                                    onChange={e => setSelectedSupplier(e.target.value)}
                                    className="brutalist-input w-full"
                                >
                                    <option value="">SELECT SUPPLIER...</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={String(s.id)}>{s.name.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-brand-black/70 mb-1.5">
                                    Reference (optional)
                                </label>
                                <input
                                    type="text"
                                    value={reference}
                                    onChange={e => setReference(e.target.value)}
                                    placeholder="e.g. PO-0002"
                                    className="brutalist-input w-full"
                                />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                                    Auto-generated if left blank.
                                </p>
                            </div>
                        </div>

                        {/* Items table */}
                        {loadingParts && (
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-black/60 py-4">
                                <Loader2 size={14} className="animate-spin" /> LOADING ITEMS...
                            </div>
                        )}

                        {selectedSupplier && !loadingParts && orderLines.length === 0 && (
                            <p className="text-xs font-bold uppercase tracking-widest text-brand-black/40 py-4">
                                No items linked to this supplier.
                            </p>
                        )}

                        {orderLines.length > 0 && (
                            <div className="border border-brand-black overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-brand-beige-dark border-b border-brand-black">
                                            <th className="text-left p-3 text-[10px] font-black uppercase tracking-widest">Item</th>
                                            <th className="text-right p-3 text-[10px] font-black uppercase tracking-widest">In Stock</th>
                                            <th className="text-center p-3 text-[10px] font-black uppercase tracking-widest">Pack Size</th>
                                            <th className="text-center p-3 text-[10px] font-black uppercase tracking-widest w-28">Packs to Order</th>
                                            <th className="text-right p-3 text-[10px] font-black uppercase tracking-widest">Units</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-brand-black/10">
                                        {orderLines.map(line => {
                                            const packs = parseFloat(line.packs) || 0;
                                            const units = packs * line.packQuantity;
                                            return (
                                                <tr key={line.partPk} className={cn(
                                                    "transition-colors",
                                                    packs > 0 ? "bg-amber-50" : "hover:bg-brand-beige/50"
                                                )}>
                                                    <td className="p-3">
                                                        <p className="text-xs font-black uppercase">{line.partName}</p>
                                                        <p className="text-[10px] font-mono text-brand-black/40">{line.SKU}</p>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <span className={cn(
                                                            "text-sm font-black",
                                                            line.currentStock === 0 && "text-red-600"
                                                        )}>
                                                            {line.currentStock}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className="text-xs font-bold text-brand-black/60 flex items-center justify-center gap-1">
                                                            <Package size={12} />
                                                            {line.packQuantity}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={line.packs}
                                                            onChange={e => updatePacks(line.partPk, e.target.value)}
                                                            placeholder="0"
                                                            className="brutalist-input w-full text-center text-sm font-black py-1.5"
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <span className="text-sm font-black text-brand-black/60">
                                                            {units > 0 ? units : '—'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {submitError && (
                            <div className="flex items-center gap-2 border border-red-500 bg-red-50 p-3">
                                <XCircle size={14} className="text-red-500 flex-shrink-0" />
                                <p className="text-xs font-bold uppercase tracking-widest text-red-600">{submitError}</p>
                            </div>
                        )}

                        {/* Summary + submit */}
                        {linesWithQty.length > 0 && (
                            <div className="flex items-center justify-between pt-2 border-t border-brand-black/20">
                                <div className="text-xs font-bold uppercase tracking-widest text-brand-black/60">
                                    {linesWithQty.length} item(s) — {linesWithQty.reduce((s, l) => s + parseFloat(l.packs) * l.packQuantity, 0)} units total
                                </div>
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting || linesWithQty.length === 0}
                                    className={cn(
                                        "brutalist-button px-6 py-2.5 text-xs bg-emerald-400 text-brand-black flex items-center gap-2",
                                        submitting && "opacity-75 cursor-not-allowed"
                                    )}
                                >
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <ShoppingBag size={14} />}
                                    CREATE ORDER
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Existing orders */}
            <div className="space-y-2">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-brand-black/60">OPEN ORDERS</h2>

                {loadingOrders && (
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-black/60 py-4">
                        <Loader2 size={14} className="animate-spin" /> LOADING...
                    </div>
                )}

                {!loadingOrders && existingOrders.length === 0 && (
                    <div className="border border-brand-black/20 bg-white p-6 text-center text-xs font-bold uppercase tracking-widest text-brand-black/40">
                        No open purchase orders
                    </div>
                )}

                {existingOrders.map(po => (
                    <div key={po.pk} className="border border-brand-black bg-white">
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div>
                                    <p className="text-sm font-black uppercase tracking-widest">{po.reference}</p>
                                    <p className="text-[10px] font-bold uppercase text-brand-black/50">
                                        {po.supplier_detail?.name} · {po.creation_date?.slice(0, 10)}
                                    </p>
                                    {po.description && (
                                        <p className="text-[10px] text-brand-black/40 mt-0.5">{po.description}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "text-[10px] font-black uppercase tracking-widest px-2 py-1",
                                    STATUS_COLORS[po.status] ?? 'bg-brand-beige-dark'
                                )}>
                                    {po.status_text}
                                </span>
                                {po.status === 10 && (
                                    <button
                                        onClick={() => handleIssue(po.pk)}
                                        disabled={issuingPk === po.pk}
                                        className="brutalist-button px-3 py-1.5 text-[10px] bg-blue-200 text-brand-black flex items-center gap-1"
                                    >
                                        {issuingPk === po.pk ? <Loader2 size={10} className="animate-spin" /> : null}
                                        ISSUE
                                    </button>
                                )}
                                {(po.status === 10 || po.status === 20) && (
                                    <button
                                        onClick={() => handleCancel(po.pk)}
                                        disabled={cancellingPk === po.pk}
                                        className="brutalist-button px-3 py-1.5 text-[10px] bg-white text-red-600 border-red-400 flex items-center gap-1"
                                    >
                                        {cancellingPk === po.pk ? <Loader2 size={10} className="animate-spin" /> : null}
                                        CANCEL
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
