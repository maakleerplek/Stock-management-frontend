import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingBag, Plus, Loader2, CheckCircle, XCircle, Package, Trash2, Truck, AlertTriangle } from 'lucide-react';
import inventreeClient from './api/inventreeClient';
import type { PurchaseOrderLine } from './api/types';
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
    supplier: number;
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

/** One editable row in the receive modal. Counts are in supplier packs. */
interface ReceiveRow {
    linePk: number;
    name: string;
    ordered: number;
    alreadyReceived: number;
    packQuantity: number;
    /** What the user says actually turned up. Free text so the field can be emptied. */
    packs: string;
    destination: number | null;
}

interface ReceiveModal {
    poPk: number;
    reference: string;
    rows: ReceiveRow[];
    locationPk: string;
}

interface CompleteModal {
    poPk: number;
    reference: string;
    outstanding: { name: string; ordered: number; received: number }[];
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
                    // InvenTree counts a PO line in supplier packs, not in single
                    // units, and multiplies by the supplier part's pack_quantity
                    // itself. Sending units here squared the order: 1 pack of 24
                    // became quantity 24 and a total of 576.
                    quantity: parseFloat(line.packs),
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

    const [receiveModal, setReceiveModal] = useState<ReceiveModal | null>(null);
    const [completeModal, setCompleteModal] = useState<CompleteModal | null>(null);
    const [openingReceive, setOpeningReceive] = useState<number | null>(null);
    const [receiving, setReceiving] = useState(false);
    const [confirmingReceive, setConfirmingReceive] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [locations, setLocations] = useState<{ pk: number; name: string; pathstring: string }[]>([]);
    const [actionError, setActionError] = useState<string | null>(null);

    /** Pack size per supplier part, so the modal can show units next to packs. */
    const packSizeFor = useCallback(
        (supplierParts: { pk: number; pack_quantity: string }[], supplierPartPk: number) =>
            parseFloat(supplierParts.find(sp => sp.pk === supplierPartPk)?.pack_quantity ?? '1') || 1,
        []
    );

    const openReceive = async (po: ExistingPO) => {
        setOpeningReceive(po.pk);
        setActionError(null);
        try {
            const [lines, locs, supplierParts] = await Promise.all([
                inventreeClient.getPurchaseOrderLines(po.pk),
                locations.length ? Promise.resolve(locations) : inventreeClient.getStockLocations(),
                inventreeClient.getSupplierPartsForSupplier(po.supplier),
            ]);
            setLocations(locs);

            const rows: ReceiveRow[] = lines.map((l: PurchaseOrderLine) => {
                const outstanding = Math.max(l.quantity - l.received, 0);
                return {
                    linePk: l.pk,
                    name: l.internal_part_name || l.part_detail?.name || l.sku || `Line ${l.pk}`,
                    ordered: l.quantity,
                    alreadyReceived: l.received,
                    packQuantity: packSizeFor(supplierParts, l.part),
                    // Default to everything still outstanding — the common case is a
                    // full delivery, and a short one is then a single edit.
                    packs: outstanding > 0 ? String(outstanding) : '0',
                    destination: l.destination ?? l.destination_detail?.pk ?? null,
                };
            });

            const firstDest = rows.find(r => r.destination !== null)?.destination;
            setReceiveModal({
                poPk: po.pk,
                reference: po.reference,
                rows,
                locationPk: String(firstDest ?? locs[0]?.pk ?? ''),
            });
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not load order lines');
        } finally {
            setOpeningReceive(null);
        }
    };

    const submitReceive = async () => {
        if (!receiveModal) return;
        const locationPk = parseInt(receiveModal.locationPk);
        const items = receiveModal.rows
            .map(r => ({ line_item: r.linePk, quantity: parseFloat(r.packs), location: r.destination ?? locationPk }))
            .filter(i => i.quantity > 0);

        if (items.length === 0) {
            setActionError('Nothing to receive — every quantity is zero.');
            return;
        }

        setReceiving(true);
        setActionError(null);
        try {
            await inventreeClient.receivePurchaseOrderItems(receiveModal.poPk, items, locationPk);
            setReceiveModal(null);
            setConfirmingReceive(false);
            loadOrders();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Receiving failed');
        } finally {
            setReceiving(false);
        }
    };

    const openComplete = async (po: ExistingPO) => {
        setOpeningReceive(po.pk);
        setActionError(null);
        try {
            const lines = await inventreeClient.getPurchaseOrderLines(po.pk);
            setCompleteModal({
                poPk: po.pk,
                reference: po.reference,
                outstanding: lines
                    .filter(l => l.received < l.quantity)
                    .map(l => ({
                        name: l.internal_part_name || l.part_detail?.name || l.sku || `Line ${l.pk}`,
                        ordered: l.quantity,
                        received: l.received,
                    })),
            });
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not load order lines');
        } finally {
            setOpeningReceive(null);
        }
    };

    const submitComplete = async () => {
        if (!completeModal) return;
        setCompleting(true);
        setActionError(null);
        try {
            await inventreeClient.completePurchaseOrder(completeModal.poPk, completeModal.outstanding.length > 0);
            setCompleteModal(null);
            loadOrders();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not close the order');
        } finally {
            setCompleting(false);
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
                {actionError && !receiveModal && !completeModal && (
                    <div className="flex items-center gap-3 border border-red-500 bg-red-50 p-3">
                        <XCircle size={16} className="text-red-600 flex-shrink-0" />
                        <p className="text-xs font-black uppercase tracking-widest text-red-700">{actionError}</p>
                    </div>
                )}
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
                                {po.status === 20 && (
                                    <button onClick={() => openReceive(po)} disabled={openingReceive === po.pk}
                                        className="brutalist-button px-3 py-1.5 text-[10px] bg-emerald-200 text-brand-black flex items-center gap-1">
                                        {openingReceive === po.pk ? <Loader2 size={10} className="animate-spin" /> : <Truck size={10} />} RECEIVE
                                    </button>
                                )}
                                {po.status === 20 && (
                                    <button onClick={() => openComplete(po)} disabled={openingReceive === po.pk}
                                        className="brutalist-button px-3 py-1.5 text-[10px] bg-amber-200 text-brand-black flex items-center gap-1">
                                        CLOSE
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

            {/* Receive modal — record what actually turned up, line by line */}
            {receiveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-2xl border border-brand-black bg-white max-h-[90vh] overflow-auto">
                        <div className="flex items-center gap-2 p-4 border-b border-brand-black bg-brand-black">
                            <Truck size={14} className="text-white" />
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">
                                RECEIVE — {receiveModal.reference}
                            </h2>
                        </div>

                        <div className="p-4 sm:p-6 space-y-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60">
                                Quantities are in packs. Correct any line that arrived short.
                            </p>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-brand-black/70 mb-1.5">
                                    Destination
                                </label>
                                <select
                                    value={receiveModal.locationPk}
                                    onChange={e => setReceiveModal({ ...receiveModal, locationPk: e.target.value })}
                                    className="brutalist-input w-full"
                                >
                                    {locations.map(l => (
                                        <option key={l.pk} value={l.pk}>{l.pathstring || l.name}</option>
                                    ))}
                                </select>
                            </div>

                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-brand-black/20 text-[10px] uppercase tracking-widest text-brand-black/60">
                                        <th className="text-left p-2">Item</th>
                                        <th className="text-right p-2">Ordered</th>
                                        <th className="text-right p-2">Already in</th>
                                        <th className="text-right p-2">Receiving</th>
                                        <th className="text-right p-2">Units</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receiveModal.rows.map((row, i) => {
                                        const packs = parseFloat(row.packs) || 0;
                                        const outstanding = Math.max(row.ordered - row.alreadyReceived, 0);
                                        const over = packs > outstanding;
                                        return (
                                            <tr key={row.linePk} className="border-b border-brand-black/10">
                                                <td className="p-2 font-bold">{row.name}</td>
                                                <td className="p-2 text-right font-mono">{row.ordered}</td>
                                                <td className="p-2 text-right font-mono text-brand-black/50">{row.alreadyReceived}</td>
                                                <td className="p-2 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={row.packs}
                                                        onChange={e => {
                                                            const rows = [...receiveModal.rows];
                                                            rows[i] = { ...row, packs: e.target.value };
                                                            setReceiveModal({ ...receiveModal, rows });
                                                        }}
                                                        className={cn('brutalist-input w-20 text-right', over && 'border-amber-500')}
                                                    />
                                                </td>
                                                <td className="p-2 text-right font-mono text-brand-black/60">
                                                    {packs * row.packQuantity}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {receiveModal.rows.some(r => (parseFloat(r.packs) || 0) > Math.max(r.ordered - r.alreadyReceived, 0)) && (
                                <div className="flex items-center gap-2 border border-amber-500 bg-amber-50 p-3">
                                    <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                        A line is over the amount ordered. InvenTree will accept it.
                                    </p>
                                </div>
                            )}

                            {actionError && (
                                <div className="flex items-center gap-2 border border-red-500 bg-red-50 p-3">
                                    <XCircle size={14} className="text-red-600 flex-shrink-0" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-700">{actionError}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 p-4 border-t border-brand-black">
                            <button
                                onClick={() => { setReceiveModal(null); setActionError(null); setConfirmingReceive(false); }}
                                disabled={receiving}
                                className="flex-1 brutalist-button py-3 text-xs bg-white text-brand-black"
                            >
                                BACK
                            </button>
                            <button
                                onClick={() => { setActionError(null); setConfirmingReceive(true); }}
                                disabled={receiving}
                                className="flex-1 brutalist-button py-3 text-xs bg-emerald-400 text-brand-black flex items-center justify-center gap-2"
                            >
                                <Truck size={14} />
                                BOOK IN
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receive confirmation — booking in writes stock and cannot be undone */}
            {receiveModal && confirmingReceive && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-lg border border-brand-black bg-white">
                        <div className="flex items-center gap-2 p-4 border-b border-brand-black bg-brand-black">
                            <AlertTriangle size={14} className="text-white" />
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">
                                IS EVERYTHING RECEIVED?
                            </h2>
                        </div>

                        <div className="p-4 sm:p-6 space-y-4">
                            <div className="flex items-start gap-2 border border-amber-500 bg-amber-50 p-3">
                                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                    This adds the stock below and cannot be undone. Only book in what is
                                    physically here — anything still coming can be received later.
                                </p>
                            </div>

                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-brand-black/20 text-[10px] uppercase tracking-widest text-brand-black/60">
                                        <th className="text-left p-2">Item</th>
                                        <th className="text-right p-2">Packs</th>
                                        <th className="text-right p-2">Units added</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receiveModal.rows.filter(r => (parseFloat(r.packs) || 0) > 0).map(r => {
                                        const packs = parseFloat(r.packs) || 0;
                                        return (
                                            <tr key={r.linePk} className="border-b border-brand-black/10">
                                                <td className="p-2 font-bold">{r.name}</td>
                                                <td className="p-2 text-right font-mono">{packs}</td>
                                                <td className="p-2 text-right font-mono">{packs * r.packQuantity}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {receiveModal.rows.some(r => (parseFloat(r.packs) || 0) === 0) && (
                                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/50">
                                    Skipped (nothing received):{' '}
                                    {receiveModal.rows.filter(r => (parseFloat(r.packs) || 0) === 0).map(r => r.name).join(', ')}
                                </p>
                            )}

                            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60">
                                Destination: {locations.find(l => String(l.pk) === receiveModal.locationPk)?.pathstring ?? '—'}
                            </p>

                            {actionError && (
                                <div className="flex items-center gap-2 border border-red-500 bg-red-50 p-3">
                                    <XCircle size={14} className="text-red-600 flex-shrink-0" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-700">{actionError}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 p-4 border-t border-brand-black">
                            <button
                                onClick={() => { setConfirmingReceive(false); setActionError(null); }}
                                disabled={receiving}
                                className="flex-1 brutalist-button py-3 text-xs bg-white text-brand-black"
                            >
                                NO, GO BACK
                            </button>
                            <button
                                onClick={submitReceive}
                                disabled={receiving}
                                className="flex-1 brutalist-button py-3 text-xs bg-emerald-400 text-brand-black flex items-center justify-center gap-2"
                            >
                                {receiving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                YES, BOOK IN
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close modal — spell out what is still outstanding before closing */}
            {completeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg border border-brand-black bg-white">
                        <div className="flex items-center gap-2 p-4 border-b border-brand-black bg-brand-black">
                            <AlertTriangle size={14} className="text-white" />
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">
                                CLOSE {completeModal.reference}?
                            </h2>
                        </div>

                        <div className="p-4 sm:p-6 space-y-4">
                            {completeModal.outstanding.length === 0 ? (
                                <p className="text-xs font-bold uppercase tracking-widest text-brand-black/70">
                                    Everything on this order has been received. Closing it is safe.
                                </p>
                            ) : (
                                <>
                                    <div className="flex items-start gap-2 border border-amber-500 bg-amber-50 p-3">
                                        <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                            Not everything is in. Closing now writes off the rest — it will never
                                            arrive in stock. Use RECEIVE first if more is still coming.
                                        </p>
                                    </div>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-brand-black/20 text-[10px] uppercase tracking-widest text-brand-black/60">
                                                <th className="text-left p-2">Item</th>
                                                <th className="text-right p-2">Received</th>
                                                <th className="text-right p-2">Ordered</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completeModal.outstanding.map(o => (
                                                <tr key={o.name} className="border-b border-brand-black/10">
                                                    <td className="p-2 font-bold">{o.name}</td>
                                                    <td className="p-2 text-right font-mono text-amber-700">{o.received}</td>
                                                    <td className="p-2 text-right font-mono">{o.ordered}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}

                            {actionError && (
                                <div className="flex items-center gap-2 border border-red-500 bg-red-50 p-3">
                                    <XCircle size={14} className="text-red-600 flex-shrink-0" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-700">{actionError}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 p-4 border-t border-brand-black">
                            <button
                                onClick={() => { setCompleteModal(null); setActionError(null); }}
                                disabled={completing}
                                className="flex-1 brutalist-button py-3 text-xs bg-white text-brand-black"
                            >
                                BACK
                            </button>
                            <button
                                onClick={submitComplete}
                                disabled={completing}
                                className="flex-1 brutalist-button py-3 text-xs bg-amber-400 text-brand-black flex items-center justify-center gap-2"
                            >
                                {completing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                {completeModal.outstanding.length === 0 ? 'CLOSE ORDER' : 'CLOSE ANYWAY'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
