import { useState, useEffect } from 'react';
import { X, Wrench, CheckCircle, XCircle, Loader2, Tag } from 'lucide-react';
import inventreeClient from './api/inventreeClient';
import type { SelectOption } from './AddPartForm';
import { cn } from './lib/utils';

interface DataRepairModalProps {
    open: boolean;
    onClose: () => void;
    suppliers: SelectOption[];
}

interface BarcodeResult {
    partName: string;
    barcode: string;
    status: 'fixed' | 'already_ok' | 'error';
    message?: string;
}

interface PartWithoutSupplier {
    pk: number;
    name: string;
    IPN?: string;
    selectedSupplier: string;
    selectedSku: string;
    saving: boolean;
    saved: boolean;
    error?: string;
}

type Tab = 'barcodes' | 'suppliers';

export default function DataRepairModal({ open, onClose, suppliers }: DataRepairModalProps) {
    const [tab, setTab] = useState<Tab>('barcodes');

    // Barcode fix state
    const [barcodeRunning, setBarcodeRunning] = useState(false);
    const [barcodeResults, setBarcodeResults] = useState<BarcodeResult[]>([]);
    const [barcodesDone, setBarcodesDone] = useState(false);

    // Supplier fix state
    const [loadingParts, setLoadingParts] = useState(false);
    const [partsWithoutSupplier, setPartsWithoutSupplier] = useState<PartWithoutSupplier[]>([]);
    const [suppliersLoaded, setSuppliersLoaded] = useState(false);

    useEffect(() => {
        if (open && tab === 'suppliers' && !suppliersLoaded) {
            loadPartsWithoutSuppliers();
        }
    }, [open, tab]);

    const loadPartsWithoutSuppliers = async () => {
        setLoadingParts(true);
        try {
            const [partsResp, supplierPartsResp] = await Promise.all([
                inventreeClient.getAllParts(),
                inventreeClient.getAllSupplierParts(),
            ]);

            const partPksWithSupplier = new Set(supplierPartsResp.map(sp => sp.part));
            const missing = partsResp.results
                .filter(p => !partPksWithSupplier.has(p.pk))
                .map(p => ({
                    pk: p.pk,
                    name: p.name,
                    IPN: p.IPN,
                    selectedSupplier: '',
                    selectedSku: '',
                    saving: false,
                    saved: false,
                }));

            setPartsWithoutSupplier(missing);
            setSuppliersLoaded(true);
        } catch (err) {
            console.error('[DataRepair] Failed to load parts:', err);
        } finally {
            setLoadingParts(false);
        }
    };

    const runBarcodesFix = async () => {
        setBarcodeRunning(true);
        setBarcodeResults([]);
        setBarcodesDone(false);

        try {
            const partsResp = await inventreeClient.getAllParts();
            const partsWithIPN = partsResp.results.filter(p => p.IPN && p.IPN.trim());

            for (const part of partsWithIPN) {
                const barcode = part.IPN!.trim();
                try {
                    const stockResp = await inventreeClient.getAllStockItems({ part: part.pk });
                    const stockItems = stockResp.results;

                    if (stockItems.length === 0) {
                        setBarcodeResults(prev => [...prev, {
                            partName: part.name,
                            barcode,
                            status: 'error',
                            message: 'No stock item found',
                        }]);
                        continue;
                    }

                    // Assign to first stock item
                    const stockItem = stockItems[0];
                    try {
                        await inventreeClient.assignBarcode(barcode, stockItem.pk);
                        setBarcodeResults(prev => [...prev, {
                            partName: part.name,
                            barcode,
                            status: 'fixed',
                        }]);
                    } catch (assignErr: unknown) {
                        const msg = assignErr instanceof Error ? assignErr.message : String(assignErr);
                        const alreadyLinked = msg.toLowerCase().includes('already') || msg.includes('400');
                        setBarcodeResults(prev => [...prev, {
                            partName: part.name,
                            barcode,
                            status: alreadyLinked ? 'already_ok' : 'error',
                            message: alreadyLinked ? undefined : msg,
                        }]);
                    }
                } catch (err) {
                    setBarcodeResults(prev => [...prev, {
                        partName: part.name,
                        barcode,
                        status: 'error',
                        message: 'Failed to fetch stock items',
                    }]);
                }
            }
        } catch (err) {
            console.error('[DataRepair] Barcode fix failed:', err);
        } finally {
            setBarcodeRunning(false);
            setBarcodesDone(true);
        }
    };

    const saveSupplierForPart = async (partPk: number) => {
        const part = partsWithoutSupplier.find(p => p.pk === partPk);
        if (!part || !part.selectedSupplier) return;

        setPartsWithoutSupplier(prev => prev.map(p =>
            p.pk === partPk ? { ...p, saving: true, error: undefined } : p
        ));

        try {
            const sku = part.selectedSku.trim() || part.IPN || part.name;
            await inventreeClient.createSupplierPart({
                part: partPk,
                supplier: parseInt(part.selectedSupplier),
                SKU: sku,
            });
            setPartsWithoutSupplier(prev => prev.map(p =>
                p.pk === partPk ? { ...p, saving: false, saved: true } : p
            ));
        } catch (err) {
            setPartsWithoutSupplier(prev => prev.map(p =>
                p.pk === partPk ? {
                    ...p,
                    saving: false,
                    error: err instanceof Error ? err.message : 'Failed to save',
                } : p
            ));
        }
    };

    const updatePart = (pk: number, field: 'selectedSupplier' | 'selectedSku', value: string) => {
        setPartsWithoutSupplier(prev => prev.map(p =>
            p.pk === pk ? { ...p, [field]: value } : p
        ));
    };

    const fixed = barcodeResults.filter(r => r.status === 'fixed').length;
    const alreadyOk = barcodeResults.filter(r => r.status === 'already_ok').length;
    const errors = barcodeResults.filter(r => r.status === 'error').length;
    const unsavedParts = partsWithoutSupplier.filter(p => !p.saved);

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-brand-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-brand-black w-full max-w-2xl my-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-brand-black bg-brand-black">
                    <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-amber-300" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">DATA REPAIR</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 transition-colors">
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-brand-black">
                    {(['barcodes', 'suppliers'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all",
                                tab === t
                                    ? "border-brand-black text-brand-black"
                                    : "border-transparent text-brand-black/50 hover:text-brand-black"
                            )}
                        >
                            {t === 'barcodes' ? 'FIX BARCODES' : `LINK SUPPLIERS ${suppliersLoaded ? `(${unsavedParts.length})` : ''}`}
                        </button>
                    ))}
                </div>

                {/* Barcodes Tab */}
                {tab === 'barcodes' && (
                    <div className="p-6 space-y-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-brand-black/60">
                            Scans all parts with a barcode (IPN) and links them to their stock item. Safe to run multiple times — already-linked barcodes are skipped.
                        </p>

                        {!barcodeRunning && !barcodesDone && (
                            <button
                                onClick={runBarcodesFix}
                                className="brutalist-button px-6 py-3 bg-amber-300 text-brand-black text-xs flex items-center gap-2"
                            >
                                <Wrench size={14} />
                                RUN BARCODE FIX
                            </button>
                        )}

                        {barcodeRunning && (
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-black/60">
                                <Loader2 size={14} className="animate-spin" />
                                FIXING BARCODES...
                            </div>
                        )}

                        {barcodeResults.length > 0 && (
                            <div className="border border-brand-black">
                                {barcodesDone && (
                                    <div className="flex gap-4 px-4 py-2 bg-brand-beige border-b border-brand-black text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-emerald-700">{fixed} FIXED</span>
                                        <span className="text-brand-black/50">{alreadyOk} ALREADY OK</span>
                                        {errors > 0 && <span className="text-red-600">{errors} ERRORS</span>}
                                    </div>
                                )}
                                <div className="max-h-64 overflow-y-auto divide-y divide-brand-black/10">
                                    {barcodeResults.map((r, i) => (
                                        <div key={i} className="flex items-center gap-3 px-4 py-2">
                                            {r.status === 'fixed' && <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />}
                                            {r.status === 'already_ok' && <CheckCircle size={14} className="text-brand-black/30 flex-shrink-0" />}
                                            {r.status === 'error' && <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black uppercase truncate">{r.partName}</p>
                                                <p className="text-[10px] font-mono text-brand-black/50">{r.barcode}</p>
                                            </div>
                                            {r.message && (
                                                <p className="text-[10px] text-red-500 font-bold uppercase">{r.message}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {barcodesDone && (
                            <button
                                onClick={() => { setBarcodeResults([]); setBarcodesDone(false); }}
                                className="text-[10px] font-black uppercase tracking-widest text-brand-black/50 hover:text-brand-black"
                            >
                                RUN AGAIN
                            </button>
                        )}
                    </div>
                )}

                {/* Suppliers Tab */}
                {tab === 'suppliers' && (
                    <div className="p-6 space-y-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-brand-black/60">
                            Parts without a linked supplier. Select a supplier for each and save.
                        </p>

                        {loadingParts && (
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-black/60">
                                <Loader2 size={14} className="animate-spin" />
                                LOADING PARTS...
                            </div>
                        )}

                        {suppliersLoaded && unsavedParts.length === 0 && (
                            <div className="flex items-center gap-2 py-6 justify-center text-xs font-black uppercase tracking-widest text-emerald-600">
                                <CheckCircle size={16} />
                                ALL PARTS HAVE A SUPPLIER LINKED
                            </div>
                        )}

                        {suppliersLoaded && unsavedParts.length > 0 && (
                            <div className="border border-brand-black divide-y divide-brand-black/10 max-h-[60vh] overflow-y-auto">
                                {unsavedParts.map(part => (
                                    <div key={part.pk} className="p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Tag size={12} className="text-brand-black/40 flex-shrink-0" />
                                            <p className="text-xs font-black uppercase tracking-widest">{part.name}</p>
                                            {part.IPN && (
                                                <span className="text-[10px] font-mono text-brand-black/40">{part.IPN}</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={part.selectedSupplier}
                                                onChange={e => updatePart(part.pk, 'selectedSupplier', e.target.value)}
                                                className="brutalist-input text-xs px-2 py-1.5"
                                            >
                                                <option value="">SELECT SUPPLIER...</option>
                                                {suppliers.map(s => (
                                                    <option key={s.id} value={String(s.id)}>{s.name.toUpperCase()}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                value={part.selectedSku}
                                                onChange={e => updatePart(part.pk, 'selectedSku', e.target.value)}
                                                placeholder={part.IPN || 'Product code (optional)'}
                                                className="brutalist-input text-xs px-2 py-1.5"
                                            />
                                        </div>
                                        {part.error && (
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">{part.error}</p>
                                        )}
                                        <button
                                            onClick={() => saveSupplierForPart(part.pk)}
                                            disabled={!part.selectedSupplier || part.saving}
                                            className={cn(
                                                "brutalist-button px-4 py-1.5 text-[10px] bg-emerald-400 text-brand-black flex items-center gap-1.5",
                                                (!part.selectedSupplier || part.saving) && "opacity-40 cursor-not-allowed"
                                            )}
                                        >
                                            {part.saving ? <Loader2 size={10} className="animate-spin" /> : null}
                                            SAVE
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
