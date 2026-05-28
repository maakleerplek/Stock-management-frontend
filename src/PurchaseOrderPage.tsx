import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingBag, Plus, Loader2, CheckCircle, XCircle, Package, Trash2 } from 'lucide-react';
import inventreeClient from './api/inventreeClient';
import { useStock } from './StockContext';
import type { SelectOption } from './AddPartForm';
import { cn } from './lib/utils';
import ImageDisplay from './ImageDisplay';

interface OrderLine {
    supplierPartPk: number;
    partPk: number;
    partName: string;
    currentStock: number;
    SKU: string;
    packQuantity: number;
    packs: string;
    image: string | null;
}

interface OrderDraft {
    draftId: string;
    selectedSupplier: string;
    loadingParts: boolean;
    orderLines: OrderLine[];
    reference: string;
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

interface ConfirmModal {
    draftId: string;
    supplierName: string;
    lines: OrderLine[];
    reference: string;
}

interface PurchaseOrderPageProps {
    suppliers: SelectOption[];
    prefillPartIds?: number[];
}

function statusColor(statusText: string): string {
    const s = statusText?.toLowerCase() ?? '';
    if (s.includes('cancel')) return 'bg-red-100 text-red-700';
    if (s.includes('complete')) return 'bg-emerald-100 text-emerald-700';
    if (s.includes('placed') || s.includes('issued') || s.includes('progress')) return 'bg-blue-100 text-blue-800';
    if (s.includes('hold')) return 'bg-amber-100 text-amber-800';
    return 'bg-brand-beige-dark text-brand-black';
}

function makeDraft(selectedSupplier = ''): OrderDraft {
    return {
        draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        selectedSupplier,
        loadingParts: false,
        orderLines: [],
        reference: '',
    };
}

export default function PurchaseOrderPage({ suppliers, prefillPartIds = [] }: PurchaseOrderPageProps) {
    const { items: stockItems } = useStock();
    const [drafts, setDrafts] = useState<OrderDraft[]>([makeDraft()]);
    const [showCreateSection, setShowCreateSection] = useState(false);
    const [existingOrders, setExistingOrders] = useState<ExistingPO[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [issuingPk, setIssuingPk] = useState<number | null>(null);
    const [cancellingPk, setCancellingPk] = useState<number | null>(null);
    const [submitResults, setSubmitResults] = useState<Record<string, { success?: string; error?: string }>>({});
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
    const [confirming, setConfirming] = useState(false);
    const prefillApplied = useRef(false);

    const loadOrders = useCallback(async () => {
        setLoadingOrders(true);
        try {
            const orders = await inventreeClient.getPurchaseOrders();
            setExistingOrders(orders.filter(o => o.status_text?.toLowerCase() !== 'cancelled'));
        } finally {
            setLoadingOrders(false);
        }
    }, []);

    useEffect(() => { loadOrders(); }, [loadOrders]);

    // Auto-create one draft per supplier when prefillPartIds is provided
    useEffect(() => {
        if (prefillPartIds.length === 0 || prefillApplied.current) return;
        prefillApplied.current = true;
        setShowCreateSection(true);

        const setup = async () => {
            const allSupplierParts = await inventreeClient.getAllSupplierParts();
            const supplierIds = new Set<number>();
            for (const sp of allSupplierParts) {
                if (prefillPartIds.includes(sp.part)) supplierIds.add(sp.supplier);
            }
            if (supplierIds.size === 0) return;
            setDrafts(Array.from(supplierIds).map(id => ({
                ...makeDraft(String(id)),
                loadingParts: true,
            })));
        };
        setup();
    }, [prefillPartIds]);

    const loadDraftParts = useCallback(async (draftId: string, supplierId: string) => {
        if (!supplierId) {
            setDrafts(prev => prev.map(d => d.draftId === draftId ? { ...d, orderLines: [], loadingParts: false } : d));
            return;
        }
        try {
            const parts = await inventreeClient.getSupplierPartsForSupplier(parseInt(supplierId));
            const lines: OrderLine[] = parts.map(sp => {
                const stockItem = stockItems.find(i => i.part_id === sp.part);
                return {
                    supplierPartPk: sp.pk,
                    partPk: sp.part,
                    partName: stockItem?.name ?? `Part #${sp.part}`,
                    currentStock: stockItem?.quantity ?? 0,
                    SKU: sp.SKU,
                    packQuantity: parseFloat(sp.pack_quantity) || 1,
                    packs: prefillPartIds.includes(sp.part) ? '1' : '',
                    image: stockItem?.image ?? null,
                };
            });
            setDrafts(prev => prev.map(d => d.draftId === draftId ? { ...d, orderLines: lines, loadingParts: false } : d));
        } catch {
            setDrafts(prev => prev.map(d => d.draftId === draftId ? { ...d, loadingParts: false } : d));
        }
    }, [stockItems, prefillPartIds]);

    // Trigger part loading for drafts that need it
    useEffect(() => {
        drafts.forEach(draft => {
            if (draft.selectedSupplier && draft.loadingParts && draft.orderLines.length === 0) {
                loadDraftParts(draft.draftId, draft.selectedSupplier);
            }
        });
    }, [drafts, loadDraftParts]);

    const updateDraftSupplier = (draftId: string, supplierId: string) => {
        setDrafts(prev => prev.map(d =>
            d.draftId === draftId
                ? { ...d, selectedSupplier: supplierId, loadingParts: !!supplierId, orderLines: [] }
                : d
        ));
        if (supplierId) loadDraftParts(draftId, supplierId);
    };

    const updatePacks = (draftId: string, partPk: number, value: string) => {
        setDrafts(prev => prev.map(d =>
            d.draftId === draftId
                ? { ...d, orderLines: d.orderLines.map(l => l.partPk === partPk ? { ...l, packs: value } : l) }
                : d
        ));
    };

    const updateReference = (draftId: string, value: string) => {
        setDrafts(prev => prev.map(d => d.draftId === draftId ? { ...d, reference: value } : d));
    };

    const removeDraft = (draftId: string) => {
        setDrafts(prev => {
            const remaining = prev.filter(d => d.draftId !== draftId);
            return remaining.length > 0 ? remaining : [makeDraft()];
        });
    };

    const openConfirm = (draft: OrderDraft) => {
        const linesToOrder = draft.orderLines.filter(l => parseFloat(l.packs) > 0);
        if (linesToOrder.length === 0 || !draft.selectedSupplier) return;
        const supplierName = suppliers.find(s => String(s.id) === draft.selectedSupplier)?.name ?? 'Supplier';
        setConfirmModal({ draftId: draft.draftId, supplierName, lines: linesToOrder, reference: draft.reference });
    };

    const handleConfirmedSubmit = async () => {
        if (!confirmModal) return;
        const draft = drafts.find(d => d.draftId === confirmModal.draftId);
        if (!draft) return;

        setConfirming(true);
        try {
            const ref = confirmModal.reference.trim() || `PO-${Date.now().toString().slice(-5)}`;
            const po = await inventreeClient.createPurchaseOrder({
                supplier: parseInt(draft.selectedSupplier),
                reference: ref,
                description: `Order for ${confirmModal.supplierName}`,
            });
            for (const line of confirmModal.lines) {
                await inventreeClient.addPurchaseOrderLine({
                    order: po.pk,
                    part: line.supplierPartPk,
                    quantity: parseFloat(line.packs) * line.packQuantity,
                });
            }
            setSubmitResults(prev => ({
                ...prev,
                [confirmModal.draftId]: { success: `Order ${po.reference} created — ${confirmModal.lines.length} item(s) for ${confirmModal.supplierName}.` },
            }));
            removeDraft(confirmModal.draftId);
            setConfirmModal(null);
            loadOrders();
        } catch (err) {
            setSubmitResults(prev => ({
                ...prev,
                [confirmModal.draftId]: { error: err instanceof Error ? err.message : 'Failed to create order' },
            }));
            setConfirmModal(null);
        } finally {
            setConfirming(false);
        }
    };

    const handleIssue = async (poPk: number) => {
        setIssuingPk(poPk);
        try { await inventreeClient.issuePurchaseOrder(poPk); loadOrders(); }
        finally { setIssuingPk(null); }
    };

    const handleCancel = async (poPk: number) => {
        setCancellingPk(poPk);
        try { await inventreeClient.cancelPurchaseOrder(poPk); loadOrders(); }
        finally { setCancellingPk(null); }
    };

    return (
        <div className="flex-1 overflow-auto bg-brand-beige p-4 sm:p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShoppingBag size={20} className="text-brand-black" />
                    <h1 className="text-lg font-black uppercase tracking-widest">PURCHASE ORDERS</h1>
                </div>
                <button
                    onClick={() => {
                        if (!showCreateSection) {
                            setDrafts(prev => prev.length > 0 ? prev : [makeDraft()]);
                        }
                        setShowCreateSection(v => !v);
                    }}
                    className="brutalist-button px-4 py-2 text-xs bg-amber-300 text-brand-black flex items-center gap-2"
                >
                    <Plus size={14} />
                    NEW ORDER
                </button>
            </div>

            {/* Success banners */}
            {Object.entries(submitResults).map(([id, result]) => result.success && (
                <div key={id} className="flex items-center gap-3 border border-emerald-600 bg-emerald-50 p-3">
                    <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700">{result.success}</p>
                </div>
            ))}

            {/* Order drafts */}
            {showCreateSection && (
                <div className="space-y-4">
                    {drafts.map((draft, idx) => {
                        const linesWithQty = draft.orderLines.filter(l => parseFloat(l.packs) > 0);
                        const draftError = submitResults[draft.draftId]?.error;
                        const supplierName = suppliers.find(s => String(s.id) === draft.selectedSupplier)?.name;

                        return (
                            <div key={draft.draftId} className="border border-brand-black bg-white">
                                <div className="flex items-center justify-between p-4 border-b border-brand-black bg-brand-black">
                                    <h2 className="text-sm font-black uppercase tracking-widest text-white">
                                        ORDER {idx + 1}{supplierName ? ` — ${supplierName.toUpperCase()}` : ''}
                                    </h2>
                                    <button onClick={() => removeDraft(draft.draftId)} className="text-white/60 hover:text-white transition-colors p-1">
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                <div className="p-4 sm:p-6 space-y-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-brand-black/70 mb-1.5">
                                                Supplier <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={draft.selectedSupplier}
                                                onChange={e => updateDraftSupplier(draft.draftId, e.target.value)}
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
                                                value={draft.reference}
                                                onChange={e => updateReference(draft.draftId, e.target.value)}
                                                placeholder="e.g. PO-0002"
                                                className="brutalist-input w-full"
                                            />
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                                                Auto-generated if left blank.
                                            </p>
                                        </div>
                                    </div>

                                    {draft.loadingParts && (
                                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-black/60 py-4">
                                            <Loader2 size={14} className="animate-spin" /> LOADING ITEMS...
                                        </div>
                                    )}

                                    {draft.selectedSupplier && !draft.loadingParts && draft.orderLines.length === 0 && (
                                        <p className="text-xs font-bold uppercase tracking-widest text-brand-black/40 py-4">
                                            No items linked to this supplier.
                                        </p>
                                    )}

                                    {draft.orderLines.length > 0 && (
                                        <div className="border border-brand-black overflow-x-auto">
                                            <table className="w-full min-w-[500px]">
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
                                                    {draft.orderLines.map(line => {
                                                        const packs = parseFloat(line.packs) || 0;
                                                        const units = packs * line.packQuantity;
                                                        return (
                                                            <tr key={line.partPk} className={cn(
                                                                "transition-colors",
                                                                packs > 0 ? "bg-amber-50" : "hover:bg-brand-beige/50"
                                                            )}>
                                                                 <td className="p-3">
                                                                     <div className="flex items-center gap-3">
                                                                         <div className="border border-brand-black bg-white w-10 h-10 overflow-hidden flex-shrink-0">
                                                                             <ImageDisplay imagePath={line.image} alt={line.partName} width={40} height={40} />
                                                                         </div>
                                                                         <div>
                                                                             <p className="text-xs font-black uppercase">{line.partName}</p>
                                                                             <p className="text-[10px] font-mono text-brand-black/40">{line.SKU}</p>
                                                                         </div>
                                                                     </div>
                                                                 </td>
                                                                <td className="p-3 text-right">
                                                                    <span className={cn("text-sm font-black", line.currentStock === 0 && "text-red-600")}>
                                                                        {line.currentStock}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <span className="text-xs font-bold text-brand-black/60 flex items-center justify-center gap-1">
                                                                        <Package size={12} /> {line.packQuantity}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="1"
                                                                        value={line.packs}
                                                                        onChange={e => updatePacks(draft.draftId, line.partPk, e.target.value)}
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

                                    {draftError && (
                                        <div className="flex items-center gap-2 border border-red-500 bg-red-50 p-3">
                                            <XCircle size={14} className="text-red-500 flex-shrink-0" />
                                            <p className="text-xs font-bold uppercase tracking-widest text-red-600">{draftError}</p>
                                        </div>
                                    )}

                                    {linesWithQty.length > 0 && (
                                        <div className="flex items-center justify-between pt-2 border-t border-brand-black/20">
                                            <div className="text-xs font-bold uppercase tracking-widest text-brand-black/60">
                                                {linesWithQty.length} item(s) — {linesWithQty.reduce((s, l) => s + parseFloat(l.packs) * l.packQuantity, 0)} units total
                                            </div>
                                            <button
                                                onClick={() => openConfirm(draft)}
                                                className="brutalist-button px-6 py-2.5 text-xs bg-emerald-400 text-brand-black flex items-center gap-2 hover:brightness-95"
                                            >
                                                <ShoppingBag size={14} />
                                                REVIEW & ORDER
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    <button
                        onClick={() => setDrafts(prev => [...prev, makeDraft()])}
                        className="brutalist-button w-full py-3 text-xs bg-white text-brand-black flex items-center justify-center gap-2"
                        style={{ borderStyle: 'dashed' }}
                    >
                        <Plus size={14} /> ADD ORDER FOR ANOTHER SUPPLIER
                    </button>
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
                            <div>
                                <p className="text-sm font-black uppercase tracking-widest">{po.reference}</p>
                                <p className="text-[10px] font-bold uppercase text-brand-black/50">
                                    {po.supplier_detail?.name} · {po.creation_date?.slice(0, 10)}
                                </p>
                                {po.description && <p className="text-[10px] text-brand-black/40 mt-0.5">{po.description}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1", statusColor(po.status_text))}>
                                    {po.status_text}
                                </span>
                                {po.status === 10 && (
                                    <button onClick={() => handleIssue(po.pk)} disabled={issuingPk === po.pk}
                                        className="brutalist-button px-3 py-1.5 text-[10px] bg-blue-200 text-brand-black flex items-center gap-1">
                                        {issuingPk === po.pk ? <Loader2 size={10} className="animate-spin" /> : null} ISSUE
                                    </button>
                                )}
                                {(po.status === 10 || po.status === 20) && (
                                    <button onClick={() => handleCancel(po.pk)} disabled={cancellingPk === po.pk}
                                        className="brutalist-button px-3 py-1.5 text-[10px] bg-white text-red-600 border-red-400 flex items-center gap-1">
                                        {cancellingPk === po.pk ? <Loader2 size={10} className="animate-spin" /> : null} CANCEL
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Confirmation modal */}
            {confirmModal && (
                <div
                    className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => !confirming && setConfirmModal(null)}
                >
                    <div
                        className="border-2 border-brand-black bg-white w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(30,27,24,1)]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b-2 border-brand-black bg-brand-black">
                            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                                <ShoppingBag size={14} /> CONFIRM ORDER
                            </h2>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="text-xs font-bold uppercase tracking-widest text-brand-black/70">
                                Supplier: <span className="text-brand-black">{confirmModal.supplierName}</span>
                                {confirmModal.reference && <> &nbsp;·&nbsp; Ref: <span className="text-brand-black">{confirmModal.reference}</span></>}
                            </div>
                            <div className="border border-brand-black overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-brand-beige-dark border-b border-brand-black">
                                            <th className="text-left p-2 text-[10px] font-black uppercase tracking-widest">Item</th>
                                            <th className="text-right p-2 text-[10px] font-black uppercase tracking-widest">Packs</th>
                                            <th className="text-right p-2 text-[10px] font-black uppercase tracking-widest">Units</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-brand-black/10">
                                        {confirmModal.lines.map(line => (
                                            <tr key={line.partPk}>
                                                <td className="p-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="border border-brand-black bg-white w-8 h-8 overflow-hidden flex-shrink-0">
                                                            <ImageDisplay imagePath={line.image} alt={line.partName} width={32} height={32} />
                                                        </div>
                                                        <span className="text-xs font-bold uppercase">{line.partName}</span>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-right text-xs font-mono">{line.packs}</td>
                                                <td className="p-2 text-right text-xs font-mono">{parseFloat(line.packs) * line.packQuantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs font-bold uppercase tracking-widest text-brand-black/60">
                                Total: {confirmModal.lines.reduce((s, l) => s + parseFloat(l.packs) * l.packQuantity, 0)} units across {confirmModal.lines.length} item(s)
                            </p>
                        </div>
                        <div className="p-4 border-t-2 border-brand-black flex gap-3">
                            <button
                                onClick={() => setConfirmModal(null)}
                                disabled={confirming}
                                className="flex-1 brutalist-button py-3 text-xs bg-white text-brand-black"
                            >
                                BACK
                            </button>
                            <button
                                onClick={handleConfirmedSubmit}
                                disabled={confirming}
                                className="flex-1 brutalist-button py-3 text-xs bg-emerald-400 text-brand-black flex items-center justify-center gap-2"
                            >
                                {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                CONFIRM & CREATE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
